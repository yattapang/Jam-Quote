import { describe, expect, it } from "vitest";
import { apiEnvironment } from "./api-environment";

/**
 * The badge that tells a staff member which deployment they are about to change.
 *
 * A review found this logic untested and two things wrong with it: it read the
 * second-precedence environment variable, and its staging pattern fired on ordinary
 * production hosts. Both are now covered here by name, because "it says PRODUCTION
 * on a laptop" and "it says STAGING on production" are the same defect wearing
 * different clothes, and only a table of real hostnames catches either.
 */

describe("apiEnvironment", () => {
  it("calls a local API local, not production", () => {
    // The defect it was written for: an unconditional green PRODUCTION pill.
    for (const url of [
      "http://localhost:3001/api",
      "http://127.0.0.1:3001/api",
      "http://[::1]:3001/api",
    ]) {
      const env = apiEnvironment(url);
      expect(env.label, url).toBe("LOCAL");
      expect(env.tone, url).toBe("muted");
    }
  });

  it("does not mistake a .dev or .fly.dev host for staging", () => {
    // Each of these read STAGING under the first version of the pattern. `.dev` is
    // an ordinary TLD and Fly.io is an ordinary production host; an amber pill on
    // production teaches staff to ignore the pill.
    for (const host of [
      "https://jamquote-api.fly.dev/api",
      "https://api.jamquote.dev/api",
      "https://jamquote.dev/api",
      "https://jamquote-api.onrender.com/api",
      "https://api.jamquote.com/api",
    ]) {
      expect(apiEnvironment(host).label, host).toBe("PRODUCTION");
    }
  });

  it("recognises a real pre-production host", () => {
    for (const host of [
      "https://jamquote-staging.onrender.com/api",
      "https://staging.jamquote.com/api",
      "https://jamquote-api-uat.onrender.com/api",
      "https://qa.jamquote.com/api",
    ]) {
      const env = apiEnvironment(host);
      expect(env.label, host).toBe("STAGING");
      expect(env.tone, host).toBe("warn");
    }
  });

  it("says so when nothing resolved, rather than guessing", () => {
    for (const value of [undefined, "", "   "]) {
      expect(apiEnvironment(value).label).toBe("API NOT SET");
    }
    expect(apiEnvironment("not a url").label).toBe("API UNREADABLE");
  });

  it("carries the host, so a wrong badge is diagnosable", () => {
    // Without this the only way to tell which API a suspicious pill means is to
    // read the deploy config.
    expect(apiEnvironment("https://jamquote-staging.onrender.com/api").detail).toBe(
      "jamquote-staging.onrender.com",
    );
    expect(apiEnvironment("http://localhost:3001/api").detail).toBe("localhost:3001");
  });

  it("every tone it returns is a real CSS variable name", () => {
    // The console spends the tone as `var(--${tone})`, so an invented tone renders
    // an unstyled pill rather than failing.
    const tones = new Set(["good", "warn", "muted"]);
    for (const url of [
      "http://localhost:3001/api",
      "https://staging.jamquote.com/api",
      "https://api.jamquote.com/api",
      "not a url",
      undefined,
    ]) {
      expect(tones.has(apiEnvironment(url).tone), String(url)).toBe(true);
    }
  });
});
