"use client";

import { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import fieldStyles from "@/components/ui/Field.module.css";
import { deleteLogo, getLogoMeta, logoUrl, uploadLogo, type ApiLogoMeta } from "@/lib/api-client";
import { fileToBase64, MAX_LOGO_BYTES, describeLogoRejection } from "@/lib/logo-upload";
import styles from "./BrandingSection.module.css";

/**
 * Logo upload for the tenant's quote and invoice documents (#27).
 *
 * The preview is shown at roughly the size it prints, not as a thumbnail: the
 * point of the setting is "will this look right on the document my customer
 * receives", which a 40px avatar cannot answer.
 */
export default function BrandingSection() {
  const [meta, setMeta] = useState<ApiLogoMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    getLogoMeta()
      .then((m) => {
        if (active) setMeta(m);
      })
      .catch(() => {
        // A branding panel failing must not take the settings page down.
        if (active) setError("Couldn't check for a logo — is the API running?");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function pick(file: File | undefined) {
    if (!file) return;
    // Checked here for a fast, specific message; the server re-checks
    // everything from the bytes, because a client-side check is a courtesy,
    // not a control.
    const rejection = describeLogoRejection(file);
    if (rejection) {
      setError(rejection);
      return;
    }

    setBusy(true);
    setError("");
    try {
      setMeta(await uploadLogo(await fileToBase64(file)));
    } catch (e) {
      // The API's own message is the useful one ("SVG is not accepted
      // because…"), so surface it rather than a generic failure.
      setError(e instanceof Error ? e.message : "Couldn't upload that image.");
    } finally {
      setBusy(false);
      // Clear the input so picking the SAME file again still fires onChange.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await deleteLogo();
      setMeta(null);
    } catch {
      setError("Couldn't remove the logo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className={styles.title}>Branding</h2>
      <p className={styles.blurb}>
        Your logo appears at the top of every quote and invoice you send. PNG or JPEG, up to{" "}
        {Math.floor(MAX_LOGO_BYTES / 1024 / 1024)}MB. A wide logo around 600&times;200 prints best.
      </p>

      {loading ? (
        <span className={fieldStyles.hint}>Loading…</span>
      ) : (
        <>
          {meta ? (
            <div className={styles.previewWrap}>
              {/* Plain <img>: next/image would try to optimize a same-origin
                  proxy route that requires an auth cookie. eslint-disable is
                  deliberate, not an oversight. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={styles.preview}
                src={logoUrl(meta.updatedAt)}
                alt="Your business logo as it will appear on documents"
              />
              <span className={fieldStyles.hint}>
                {meta.width}&times;{meta.height}px
              </span>
            </div>
          ) : (
            <span className={fieldStyles.hint}>
              No logo yet — documents show your business name as text.
            </span>
          )}

          {error && <span className={fieldStyles.error}>{error}</span>}

          <div className={styles.actions}>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg"
              className={styles.fileInput}
              onChange={(e) => void pick(e.target.files?.[0])}
              disabled={busy}
              aria-label="Choose a logo image"
            />
            <Button
              variant="outlineAccent"
              size="sm"
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              {busy ? "Uploading…" : meta ? "Replace logo" : "Upload logo"}
            </Button>
            {meta && (
              <Button variant="ghost" size="sm" type="button" onClick={() => void remove()} disabled={busy}>
                Remove
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
