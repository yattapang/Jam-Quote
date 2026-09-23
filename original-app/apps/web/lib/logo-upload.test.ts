import { describe, expect, it } from "vitest";
import { describeLogoRejection, MAX_LOGO_BYTES } from "./logo-upload";

const file = (over: Partial<{ type: string; size: number; name: string }> = {}) => ({
  type: "image/png",
  size: 50_000,
  name: "logo.png",
  ...over,
});

describe("describeLogoRejection", () => {
  it("accepts PNG and JPEG", () => {
    expect(describeLogoRejection(file())).toBe("");
    expect(describeLogoRejection(file({ type: "image/jpeg", name: "logo.jpg" }))).toBe("");
  });

  it("explains WHY svg is refused rather than just calling it unsupported", () => {
    // SVG is what people reach for for a logo, so "unsupported format" would
    // leave them guessing. The server refuses it too — this is only the fast
    // path to a useful message.
    expect(describeLogoRejection(file({ type: "image/svg+xml", name: "logo.svg" }))).toMatch(
      /scripts/,
    );
  });

  it("catches an svg that lies about its MIME type", () => {
    // A renamed file reports whatever the OS guesses, so the extension is a
    // second signal worth checking client-side.
    expect(describeLogoRejection(file({ type: "image/png", name: "logo.svg" }))).toMatch(/scripts/);
  });

  it("reports the actual size when the file is too big", () => {
    const msg = describeLogoRejection(file({ size: MAX_LOGO_BYTES + 1_500_000 }));
    expect(msg).toMatch(/3\.4MB/);
    expect(msg).toMatch(/limit is 2MB/);
  });

  it("rejects other image formats", () => {
    expect(describeLogoRejection(file({ type: "image/gif", name: "logo.gif" }))).toMatch(/PNG or JPEG/);
    expect(describeLogoRejection(file({ type: "application/pdf", name: "logo.pdf" }))).toMatch(/PNG or JPEG/);
  });
});
