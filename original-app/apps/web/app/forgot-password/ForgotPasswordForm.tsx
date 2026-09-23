"use client";

import { useFormState, useFormStatus } from "react-dom";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { forgotPasswordAction, type ForgotPasswordState } from "@/lib/auth-actions";
import styles from "../login/login.module.css";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" fullWidth disabled={pending}>
      {pending ? "Sending…" : "Send reset link"}
    </Button>
  );
}

export default function ForgotPasswordForm() {
  const [state, formAction] = useFormState<ForgotPasswordState, FormData>(forgotPasswordAction, {});

  if (state?.submitted) {
    return (
      <p className={styles.subtitle}>
        If an account exists for that email, we&apos;ve sent a reset link. It expires in 1 hour.
      </p>
    );
  }

  return (
    <form className={styles.form} action={formAction}>
      <Input label="Email" name="email" type="email" required autoComplete="email" />

      {state?.error && <span className={styles.error}>{state.error}</span>}

      <SubmitButton />
    </form>
  );
}
