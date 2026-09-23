import { describe, expect, it } from "vitest";
import { BadRequestException } from "@nestjs/common";
import {
  MAX_LOGO_BYTES,
  normalizeLogo,
  readImageDimensions,
  sniffImageFormat,
} from "./logo-image.js";

/** Minimal but structurally real PNG: signature + IHDR + IEND. */
function png(width = 64, height = 32, extraChunks: Buffer[] = []): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  return Buffer.concat([sig, chunk("IHDR", ihdrData), ...extraChunks, chunk("IEND", Buffer.alloc(0))]);
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  // CRC is not verified by the stripper, so a placeholder keeps these fixtures
  // readable without pulling in a checksum implementation.
  return Buffer.concat([len, Buffer.from(type, "ascii"), data, Buffer.alloc(4)]);
}

/** Minimal JPEG: SOI + optional segments + SOF0 + SOS + EOI. */
function jpeg(width = 64, height = 32, segments: Buffer[] = []): Buffer {
  // SOF0: marker(2) + length(2) + precision(1) + height(2) + width(2) +
  // componentCount(1) + 3 bytes per component. `length` counts everything
  // after the marker INCLUDING itself, so a 1-component frame is 11 and the
  // whole segment is 13 bytes.
  const sof = Buffer.alloc(13);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(11, 2);
  sof.writeUInt8(8, 4); // precision
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  sof.writeUInt8(1, 9); // component count
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    ...segments,
    sof,
    Buffer.from([0xff, 0xda, 0x00, 0x02]), // SOS
    Buffer.from([0x12, 0x34, 0x56]), // "pixel data"
    Buffer.from([0xff, 0xd9]), // EOI
  ]);
}

function jpegSegment(marker: number, payload: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt16BE(0xff00 | marker, 0);
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

describe("sniffImageFormat — the bytes decide, not the filename", () => {
  it("identifies PNG and JPEG from their signatures", () => {
    expect(sniffImageFormat(png())).toBe("png");
    expect(sniffImageFormat(jpeg())).toBe("jpeg");
  });

  it("rejects SVG, which is the whole point of sniffing", () => {
    // SVG is XML and can carry <script>. A client-supplied content-type of
    // image/png would otherwise wave it straight through to a browser.
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(sniffImageFormat(svg)).toBeNull();
  });

  it("rejects other things people try to upload", () => {
    expect(sniffImageFormat(Buffer.from("GIF89a..."))).toBeNull();
    expect(sniffImageFormat(Buffer.from("%PDF-1.7"))).toBeNull();
    expect(sniffImageFormat(Buffer.from("RIFF....WEBPVP8 "))).toBeNull();
    expect(sniffImageFormat(Buffer.alloc(0))).toBeNull();
  });

  it("rejects a file that merely claims a PNG extension", () => {
    expect(sniffImageFormat(Buffer.from("not really a png"))).toBeNull();
  });
});

describe("readImageDimensions", () => {
  it("reads PNG dimensions from IHDR", () => {
    expect(readImageDimensions(png(800, 240), "png")).toEqual({ width: 800, height: 240 });
  });

  it("reads JPEG dimensions from the frame header", () => {
    expect(readImageDimensions(jpeg(800, 240), "jpeg")).toEqual({ width: 800, height: 240 });
  });

  it("finds the JPEG frame header past a leading Exif block", () => {
    // There is no fixed offset — an Exif segment sits in front of the frame on
    // essentially every phone photo.
    const exif = jpegSegment(0xe1, Buffer.from("Exif\0\0" + "x".repeat(64)));
    expect(readImageDimensions(jpeg(1024, 768, [exif]), "jpeg")).toEqual({ width: 1024, height: 768 });
  });

  it("returns null for a truncated file rather than guessing", () => {
    expect(readImageDimensions(Buffer.from([0x89, 0x50]), "png")).toBeNull();
  });
});

describe("normalizeLogo — metadata stripping", () => {
  it("drops a JPEG Exif segment, which can carry GPS coordinates", () => {
    // A contractor photographing their shop sign would otherwise embed their
    // location in every quote PDF they send a customer.
    const exif = jpegSegment(0xe1, Buffer.from("Exif\0\0GPS 18.0179,-76.8099"));
    const withExif = jpeg(400, 200, [exif]);
    expect(withExif.includes("GPS 18.0179")).toBe(true);

    const { bytes } = normalizeLogo(withExif);
    expect(bytes.includes("GPS 18.0179")).toBe(false);
    // Still a JPEG, and still the same picture.
    expect(sniffImageFormat(bytes)).toBe("jpeg");
    expect(readImageDimensions(bytes, "jpeg")).toEqual({ width: 400, height: 200 });
  });

  it("drops JPEG comment segments too", () => {
    const comment = jpegSegment(0xfe, Buffer.from("internal build notes"));
    const { bytes } = normalizeLogo(jpeg(400, 200, [comment]));
    expect(bytes.includes("internal build notes")).toBe(false);
  });

  it("drops PNG text chunks", () => {
    const text = chunk("tEXt", Buffer.from("Author\0Jane Contractor"));
    const withText = png(400, 200, [text]);
    expect(withText.includes("Jane Contractor")).toBe(true);

    const { bytes } = normalizeLogo(withText);
    expect(bytes.includes("Jane Contractor")).toBe(false);
    expect(sniffImageFormat(bytes)).toBe("png");
    expect(readImageDimensions(bytes, "png")).toEqual({ width: 400, height: 200 });
  });

  it("keeps PNG transparency, which changes how the logo looks", () => {
    const trns = chunk("tRNS", Buffer.from([0x00, 0x10]));
    const { bytes } = normalizeLogo(png(400, 200, [trns]));
    expect(bytes.includes(Buffer.from("tRNS", "ascii"))).toBe(true);
  });

  it("preserves JPEG pixel data after the scan marker", () => {
    // Everything past SOS is entropy-coded; 0xFF bytes there are not markers,
    // so continuing to parse would corrupt the image.
    const { bytes } = normalizeLogo(jpeg(400, 200));
    expect(bytes.subarray(bytes.length - 2)).toEqual(Buffer.from([0xff, 0xd9]));
  });
});

describe("normalizeLogo — rejection", () => {
  it("names SVG explicitly so the contractor knows why", () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(() => normalizeLogo(svg)).toThrow(BadRequestException);
    expect(() => normalizeLogo(svg)).toThrow(/SVG is not accepted/);
  });

  it("rejects an oversized file", () => {
    const huge = Buffer.concat([png(64, 64), Buffer.alloc(MAX_LOGO_BYTES)]);
    expect(() => normalizeLogo(huge)).toThrow(/2MB or smaller/);
  });

  it("rejects absurd dimensions (a decompression bomb dressed as a logo)", () => {
    expect(() => normalizeLogo(png(40_000, 40_000))).toThrow(/3000px or smaller/);
  });

  it("rejects something too small to be a real logo", () => {
    expect(() => normalizeLogo(png(4, 4))).toThrow(/at least 16px/);
  });

  it("rejects an empty file", () => {
    expect(() => normalizeLogo(Buffer.alloc(0))).toThrow(/empty/);
  });

  it("derives the content type from the bytes, never from the client", () => {
    expect(normalizeLogo(png()).contentType).toBe("image/png");
    expect(normalizeLogo(jpeg()).contentType).toBe("image/jpeg");
  });
});
