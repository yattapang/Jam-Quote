import { formatJmd, type Cents } from "@jamquote/core";

export type MoneyTone = "default" | "muted" | "good" | "critical" | "accent";

const TONE_VAR: Record<MoneyTone, string> = {
  default: "var(--jq-text)",
  muted: "var(--jq-text-muted)",
  good: "var(--jq-good)",
  critical: "var(--jq-crit)",
  accent: "var(--jq-accent)",
};

interface MoneyTextProps {
  cents: Cents;
  tone?: MoneyTone;
  withSymbol?: boolean;
  size?: number | string;
  weight?: number;
  className?: string;
}

/** Renders JMD amounts with @jamquote/core's formatJmd — never hand-format money. */
export default function MoneyText({
  cents,
  tone = "default",
  withSymbol = true,
  size,
  weight = 800,
  className,
}: MoneyTextProps) {
  return (
    <span
      className={`jq-numeral ${className ?? ""}`}
      style={{
        color: TONE_VAR[tone],
        fontSize: size,
        fontWeight: weight,
      }}
    >
      {formatJmd(cents, withSymbol)}
    </span>
  );
}
