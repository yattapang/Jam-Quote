import { BadRequestException } from "@nestjs/common";

/**
 * Validation and metadata-stripping for tenant logo uploads (#27).
 *
 * WHY THIS IS HAND-ROLLED RATHER THAN sharp: the API runs on Render's free
 * tier and has no image tooling. sharp is a native dependency pulled in for
 * one feature, and a full decode/re-encode is not what actually defends this
 * surface — see the threats below, each of which is handled here.
 *
 * What this does NOT do, stated plainly: it does not re-encode. A file that
 * passes these checks is structurally a PNG or JPEG and carries no metadata,
 * but it has not been proven decodable. That is acceptable because nothing
 * server-side interprets it — the bytes go to a browser or into a PDF, and a
 * corrupt image renders as a broken image, not as code. If we ever process
 * these images (thumbnails, OCR), revisit and add a real decoder.
 */

/** 2 MB. Generous for a letterhead, small enough to keep a Business row's
 * logo cheap to serve on every quote render. */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
/** Bigger than any sensible print letterhead; guards against decompression
 * bombs dressed as logos. */
export const MAX_LOGO_DIMENSION = 3000;
export const MIN_LOGO_DIMENSION = 16;

export type LogoFormat = "png" | "jpeg";

export interface NormalizedLogo {
  bytes: Buffer;
  contentType: string;
  width: number;
  height: number;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Identifies the format from the bytes themselves, never from a
 * client-supplied filename or content-type — both are attacker-controlled.
 * Anything that is not unambiguously PNG or JPEG is rejected, which is what
 * keeps SVG out: SVG is XML and can carry <script>, so it would be an XSS
 * vector everywhere the logo is rendered in a browser.
 */
export function sniffImageFormat(buf: Buffer): LogoFormat | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE)) return "png";
  // JPEG: SOI marker. Every variant (JFIF, Exif, raw) starts this way.
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  return null;
}

/** PNG dimensions live in the IHDR chunk, which the spec requires to be first. */
function pngDimensions(buf: Buffer): { width: number; height: number } | null {
  // 8 signature + 4 length + 4 type "IHDR" then width/height as big-endian u32.
  if (buf.length < 24) return null;
  if (buf.subarray(12, 16).toString("ascii") !== "IHDR") return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * JPEG dimensions require walking the marker segments to a Start Of Frame.
 * There is no fixed offset — an Exif block, colour profile or comment can sit
 * in front of the frame header, and their sizes vary.
 */
function jpegDimensions(buf: Buffer): { width: number; height: number } | null {
  let offset = 2; // skip SOI
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) return null; // desynchronized — not a JPEG we trust
    const marker = buf[offset + 1] as number;
    // Standalone markers carry no length payload.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = buf.readUInt16BE(offset + 2);
    // SOF0-3, SOF5-7, SOF9-11 are frame headers; SOF4 (0xc4) is a Huffman
    // table and 0xc8/0xcc are not frames, so they are excluded explicitly.
    const isFrameHeader =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrameHeader) {
      // length(2) precision(1) height(2) width(2)
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
    }
    if (length < 2) return null; // malformed; refuse rather than loop forever
    offset += 2 + length;
  }
  return null;
}

export function readImageDimensions(
  buf: Buffer,
  format: LogoFormat,
): { width: number; height: number } | null {
  return format === "png" ? pngDimensions(buf) : jpegDimensions(buf);
}

/**
 * PNG chunks the image genuinely needs. Everything else — tEXt/iTXt (arbitrary
 * text, sometimes whole documents), eXIf (can carry GPS), tIME — is dropped.
 *
 * PLTE and tRNS are kept because removing them changes how the image LOOKS:
 * palette data and transparency respectively.
 */
const PNG_CHUNKS_TO_KEEP = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "sRGB"]);

function stripPngMetadata(buf: Buffer): Buffer {
  const out: Buffer[] = [buf.subarray(0, 8)]; // signature
  let offset = 8;
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString("ascii");
    const total = 12 + length; // length(4) + type(4) + data + crc(4)
    if (offset + total > buf.length) break; // truncated; stop cleanly
    if (PNG_CHUNKS_TO_KEEP.has(type)) out.push(buf.subarray(offset, offset + total));
    offset += total;
    if (type === "IEND") break;
  }
  return Buffer.concat(out);
}

/**
 * Drops every APPn segment from a JPEG. APP1 is where Exif lives, and Exif on
 * a phone photo routinely carries GPS coordinates — a contractor uploading a
 * photo of their shop sign would otherwise embed their location in every quote
 * PDF they send a customer. APP13 can carry IPTC/Photoshop blocks.
 *
 * Scanning stops at Start Of Scan: everything after it is entropy-coded pixel
 * data where 0xFF bytes are not markers, so continuing to parse would corrupt
 * the image.
 */
function stripJpegMetadata(buf: Buffer): Buffer {
  const out: Buffer[] = [buf.subarray(0, 2)]; // SOI
  let offset = 2;
  while (offset + 4 <= buf.length) {
    if (buf[offset] !== 0xff) break;
    const marker = buf[offset + 1] as number;
    if (marker === 0xda) {
      // SOS — copy the rest verbatim.
      out.push(buf.subarray(offset));
      break;
    }
    const length = buf.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buf.length) break;
    const isAppSegment = marker >= 0xe0 && marker <= 0xef;
    const isComment = marker === 0xfe;
    if (!isAppSegment && !isComment) out.push(buf.subarray(offset, offset + 2 + length));
    offset += 2 + length;
  }
  return Buffer.concat(out);
}

/**
 * The single entry point: takes raw uploaded bytes and returns something safe
 * to store and serve, or throws a BadRequestException the UI can show as-is.
 */
export function normalizeLogo(buf: Buffer): NormalizedLogo {
  if (buf.length === 0) throw new BadRequestException("The file is empty.");
  if (buf.length > MAX_LOGO_BYTES) {
    throw new BadRequestException(
      `Logo must be ${Math.floor(MAX_LOGO_BYTES / 1024 / 1024)}MB or smaller.`,
    );
  }

  const format = sniffImageFormat(buf);
  if (!format) {
    // Named explicitly because SVG is the one people reach for for logos, and
    // "unsupported format" would send them hunting for the reason.
    throw new BadRequestException(
      "Logo must be a PNG or JPEG. SVG is not accepted because it can contain scripts.",
    );
  }

  const dimensions = readImageDimensions(buf, format);
  if (!dimensions) throw new BadRequestException("That file isn't a readable image.");
  const { width, height } = dimensions;
  if (width > MAX_LOGO_DIMENSION || height > MAX_LOGO_DIMENSION) {
    throw new BadRequestException(`Logo must be ${MAX_LOGO_DIMENSION}px or smaller on each side.`);
  }
  if (width < MIN_LOGO_DIMENSION || height < MIN_LOGO_DIMENSION) {
    throw new BadRequestException(`Logo must be at least ${MIN_LOGO_DIMENSION}px on each side.`);
  }

  const bytes = format === "png" ? stripPngMetadata(buf) : stripJpegMetadata(buf);
  return {
    bytes,
    // Derived from the sniffed format, never echoed from the client.
    contentType: format === "png" ? "image/png" : "image/jpeg",
    width,
    height,
  };
}
