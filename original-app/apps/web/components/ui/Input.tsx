import type { InputHTMLAttributes } from "react";
import styles from "./Field.module.css";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export default function Input({ label, hint, error, id, className, ...rest }: InputProps) {
  return (
    <label className={styles.field} htmlFor={id}>
      {label && <span className={styles.label}>{label}</span>}
      <input id={id} className={`${styles.control} ${className ?? ""}`} {...rest} />
      {error ? <span className={styles.error}>{error}</span> : hint ? <span className={styles.hint}>{hint}</span> : null}
    </label>
  );
}
