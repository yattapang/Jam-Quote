import Link from "next/link";
import styles from "./Card.module.css";

interface CardProps {
  children: React.ReactNode;
  padding?: "sm" | "md" | "lg";
  className?: string;
  href?: string;
  style?: React.CSSProperties;
}

export default function Card({ children, padding = "md", className, href, style }: CardProps) {
  const padClass = padding === "sm" ? styles.padSm : padding === "lg" ? styles.padLg : "";
  const cls = [styles.card, padClass, href ? styles.interactive : "", className].filter(Boolean).join(" ");

  if (href) {
    return (
      <Link href={href} className={cls} style={style}>
        {children}
      </Link>
    );
  }
  return (
    <div className={cls} style={style}>
      {children}
    </div>
  );
}
