"use client";

import { useFormState, useFormStatus } from "react-dom";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { adminLogin, type AuthFormState } from "@/lib/auth-actions";
import styles from "../login/login.module.css";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" fullWidth disabled={pending}>
      {pending ? "Signing in…" : "Sign in to console"}
    </Button>
  );
}

export default function AdminLoginForm() {
  const [state, formAction] = useFormState<AuthFormState, FormData>(adminLogin, {});

  return (
    <form className={styles.form} action={formAction}>
      <Input label="Email" name="email" type="email" required autoComplete="email" />
      <Input label="Password" name="password" type="password" required autoComplete="current-password" />
      {state?.error && <span className={styles.error}>{state.error}</span>}
      <SubmitButton />
    </form>
  );
}
