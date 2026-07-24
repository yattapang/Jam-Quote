"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { authenticateAction, type AuthFormState } from "@/lib/auth-actions";
import styles from "./login.module.css";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" fullWidth disabled={pending}>
      {pending ? "Please wait…" : label}
    </Button>
  );
}

export default function LoginForm() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [state, formAction] = useFormState<AuthFormState, FormData>(authenticateAction, {});
  const isRegister = mode === "register";

  return (
    <form className={styles.form} action={formAction}>
      <input type="hidden" name="mode" value={mode} />

      {isRegister && (
        <>
          <Input label="Business name" name="businessName" required autoComplete="organization" />
          <Input label="Your name" name="fullName" autoComplete="name" />
        </>
      )}

      <Input label="Email" name="email" type="email" required autoComplete="email" />
      <Input
        label="Password"
        name="password"
        type="password"
        required
        autoComplete={isRegister ? "new-password" : "current-password"}
      />

      {state?.error && <span className={styles.error}>{state.error}</span>}

      <SubmitButton label={isRegister ? "Create account" : "Sign in"} />

      <p className={styles.switch}>
        {isRegister ? "Already have an account?" : "New to JamQuote?"}
        <button
          type="button"
          className={styles.switchButton}
          onClick={() => setMode(isRegister ? "login" : "register")}
        >
          {isRegister ? "Sign in" : "Create one"}
        </button>
      </p>
    </form>
  );
}
