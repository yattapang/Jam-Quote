"use client";

import { useState, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import fieldStyles from "@/components/ui/Field.module.css";
import { changePassword } from "@/lib/api-client";
import styles from "./SecuritySection.module.css";

/**
 * Password change for the signed-in user.
 *
 * The only other route to a new password is signing out and using an emailed
 * reset link, which is useless to someone who is already signed in and
 * impossible when email delivery is down.
 */

// Mirrors the API's minimum (apps/api/src/auth/auth.dto.ts). Checked here only
// so the user hears about it without a round trip — the API remains the rule.
const MIN_PASSWORD_LENGTH = 8;

export default function SecuritySection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [changed, setChanged] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setChanged(false);

    if (!currentPassword || !newPassword) {
      setError("Enter your current password and a new one.");
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    // Caught here rather than server-side: the server never sees the
    // confirmation field, so a typo in it is only ever detectable in the browser.
    if (newPassword !== confirmPassword) {
      setError("The new passwords don't match.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("Your new password must be different from your current one.");
      return;
    }

    setBusy(true);
    try {
      await changePassword({ currentPassword, newPassword });
      // Cleared on success so the values stop living in component state and in
      // the DOM the moment they are no longer needed.
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setChanged(true);
    } catch (err) {
      // The API's own message is the useful one ("Current password is
      // incorrect") — a generic failure would leave the user guessing which of
      // the three fields was wrong. It never contains a submitted value.
      setError(err instanceof Error ? err.message : "Couldn't change your password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className={styles.title}>Security</h2>
      {/* States the session behaviour rather than implying the usual one:
          tokens are stateless, so a change does NOT sign other devices out.
          Saying nothing would let a user assume it does. */}
      <p className={styles.blurb}>
        Change the password you use to sign in. Devices you&apos;re already signed in on stay
        signed in.
      </p>

      <form onSubmit={(e) => void submit(e)}>
        <div className={styles.fields}>
          <Input
            id="current-password"
            type="password"
            label="Current password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            disabled={busy}
          />
          <Input
            id="new-password"
            type="password"
            label="New password"
            autoComplete="new-password"
            hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={busy}
          />
          <Input
            id="confirm-new-password"
            type="password"
            label="Confirm new password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={busy}
          />
        </div>

        {error && <span className={fieldStyles.error}>{error}</span>}
        {changed && <span className={styles.success}>Password changed.</span>}

        <div className={styles.actions}>
          <Button variant="outlineAccent" size="sm" type="submit" disabled={busy}>
            {busy ? "Changing…" : "Change password"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
