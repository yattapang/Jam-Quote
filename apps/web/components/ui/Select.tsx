import type { SelectHTMLAttributes } from "react";
import styles from "./Field.module.css";

interface Option {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  options: Option[];
}

export default function Select({ label, hint, options, id, className, ...rest }: SelectProps) {
  return (
    <label className={styles.field} htmlFor={id}>
      {label && <span className={styles.label}>{label}</span>}
      <select id={id} className={`${styles.control} ${className ?? ""}`} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <span className={styles.hint}>{hint}</span>}
    </label>
  );
}
