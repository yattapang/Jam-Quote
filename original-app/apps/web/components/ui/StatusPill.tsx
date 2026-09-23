import styles from "./StatusPill.module.css";

export type PillKind = "neutral" | "good" | "warn" | "critical" | "info" | "accent";
export type PillVariant = "soft" | "solid";

// CSS-module class names resolve to `string | undefined` under
// noUncheckedIndexedAccess; coalesce at the use site below.
const CLASS_MAP: Record<PillKind, Record<PillVariant, string | undefined>> = {
  neutral: { soft: styles.neutralSoft, solid: styles.neutralSoft },
  good: { soft: styles.goodSoft, solid: styles.goodSolid },
  warn: { soft: styles.warnSoft, solid: styles.warnSolid },
  critical: { soft: styles.criticalSoft, solid: styles.criticalSolid },
  info: { soft: styles.infoSoft, solid: styles.infoSolid },
  accent: { soft: styles.goodSoft /* unused */, solid: styles.accentSolid },
};

export interface StatusPillProps {
  label: string;
  kind: PillKind;
  variant?: PillVariant;
  className?: string;
}

export default function StatusPill({ label, kind, variant = "soft", className }: StatusPillProps) {
  const cls = CLASS_MAP[kind][variant] ?? "";
  return <span className={`${styles.pill} ${cls} ${className ?? ""}`}>{label}</span>;
}
