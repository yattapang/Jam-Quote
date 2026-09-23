/**
 * Client-side helpers for the logo upload (#27).
 *
 * Every check here is a COURTESY, not a control. The server re-derives the
 * format from the file's own bytes and re-enforces every limit, because
 * anything decided in the browser is attacker-controlled. These exist so an
 * honest contractor gets an instant, specific message instead of a round-trip
 * and a generic failure.
 */

/** Mirrors MAX_LOGO_BYTES in apps/api/src/business/logo-image.ts. */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const ACCEPTED_TYPES = ["image/png", "image/jpeg"];

/**
 * Returns a message explaining why this file will be refused, or "" if it
 * looks acceptable. SVG is called out by name because it is the format people
 * reach for for logos, and "unsupported" would leave them guessing.
 */
export function describeLogoRejection(file: { type: string; size: number; name: string }): string {
  if (file.size > MAX_LOGO_BYTES) {
    return `That image is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is ${Math.floor(
      MAX_LOGO_BYTES / 1024 / 1024,
    )}MB.`;
  }
  const looksSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
  if (looksSvg) {
    return "SVG can contain scripts, so it isn't accepted. Export your logo as a PNG.";
  }
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return "Please choose a PNG or JPEG image.";
  }
  return "";
}

/** Base64 (no data: prefix) — the shape POST /business/logo expects. */
export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => {
      const result = String(reader.result);
      // readAsDataURL gives "data:image/png;base64,AAAA" — the API wants only
      // the payload, and the declared type in that prefix is ignored anyway.
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}
