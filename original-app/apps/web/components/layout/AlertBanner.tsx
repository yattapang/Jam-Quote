import Link from "next/link";
import styles from "./AlertBanner.module.css";

const SEVERITY_VARS = {
  warn: { bg: "var(--jq-warn-soft)", dot: "var(--jq-warn)" },
  info: { bg: "var(--jq-info-soft)", dot: "var(--jq-info)" },
  critical: { bg: "var(--jq-crit-soft)", dot: "var(--jq-crit)" },
} as const;

interface AlertBannerProps {
  message: string;
  href: string;
  severity?: keyof typeof SEVERITY_VARS;
  cta?: string;
}

export default function AlertBanner({ message, href, severity = "warn", cta = "Review" }: AlertBannerProps) {
  const v = SEVERITY_VARS[severity];
  return (
    <Link href={href} className={styles.banner} style={{ background: v.bg }}>
      <span className={styles.dot} style={{ background: v.dot }} />
      <span className={styles.text}>{message}</span>
      <span className={styles.cta} style={{ color: v.dot }}>
        {cta} &rsaquo;
      </span>
    </Link>
  );
}
