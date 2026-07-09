import type { ButtonHTMLAttributes } from "react";
import Link from "next/link";
import styles from "./Button.module.css";

type Variant = "primary" | "secondary" | "outlineAccent" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface CommonProps {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  children: React.ReactNode;
  className?: string;
}

type ButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & { href?: undefined };

interface LinkProps extends CommonProps {
  href: string;
}

function classes(variant: Variant, size: Size, fullWidth?: boolean, extra?: string) {
  return [styles.base, styles[variant], styles[size], fullWidth ? styles.fullWidth : "", extra]
    .filter(Boolean)
    .join(" ");
}

export default function Button({
  variant = "primary",
  size = "md",
  fullWidth,
  children,
  className,
  href,
  ...rest
}: ButtonProps | LinkProps) {
  if (href) {
    return (
      <Link href={href} className={classes(variant, size, fullWidth, className)}>
        {children}
      </Link>
    );
  }
  return (
    <button
      className={classes(variant, size, fullWidth, className)}
      {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {children}
    </button>
  );
}
