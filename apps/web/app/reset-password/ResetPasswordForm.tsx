"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { resetPasswordAction, type ResetPasswordState } from "@/lib/auth-actions";
import styles from "../login/login.module.css";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" fullWidth disabled={pending}>
      {pending ? "Resetting…" : "Reset password"}
    </Button>
  );
}

export default function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction] = useFormState<ResetPasswordState, FormData>(resetPasswordAction, {});

  return (
    <>
      <form className={styles.form} action={formAction}>
        <input type="hidden" name="token" value={token} />

        <Input
          label="New password"
          name="newPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />

        {state?.error && <span className={styles.error}>{state.error}</span>}

        <SubmitButton />
      </form>

      {state?.error && (
        <p className={styles.switch}>
          Link expired or invalid?
          <Link href="/forgot-password" className={styles.switchButton}>
            Request a new one
          </Link>
        </p>
      )}
    </>
  );
}
