/**
 * Turns @jamquote/ui design tokens into a CSS custom-property sheet.
 * Single source of truth: nothing in this file hand-picks a color — it only
 * maps ThemeTokens keys to --jq-* variable names. Both prefers-color-scheme
 * (system default) and a [data-theme] attribute override (explicit user
 * choice, persisted in localStorage by ThemeToggle) are emitted so either
 * mechanism can win.
 */
import { light, dark, fonts, radius, space, type ThemeTokens } from "@jamquote/ui";

function themeVars(t: ThemeTokens): string {
  return `
    --jq-bg: ${t.bg};
    --jq-surface: ${t.surface};
    --jq-surface-alt: ${t.surfaceAlt};
    --jq-border: ${t.border};
    --jq-text: ${t.text};
    --jq-text-muted: ${t.textMuted};
    --jq-accent: ${t.accent};
    --jq-accent-soft: ${t.accentSoft};
    --jq-on-accent: ${t.onAccent};
    --jq-good: ${t.good};
    --jq-good-soft: ${t.goodSoft};
    --jq-warn: ${t.warn};
    --jq-warn-soft: ${t.warnSoft};
    --jq-crit: ${t.crit};
    --jq-crit-soft: ${t.critSoft};
    --jq-info: ${t.info};
    --jq-info-soft: ${t.infoSoft};
    --jq-neutral-pill: ${t.neutralPill};
    --jq-neutral-pill-soft: ${t.neutralPillSoft};
  `;
}

function staticVars(): string {
  return `
    --jq-font-display: '${fonts.display}', 'Segoe UI', sans-serif;
    --jq-font-body: '${fonts.body}', 'Segoe UI', sans-serif;
    --jq-radius-sm: ${radius.sm}px;
    --jq-radius-md: ${radius.md}px;
    --jq-radius-lg: ${radius.lg}px;
    --jq-space-xs: ${space.xs}px;
    --jq-space-sm: ${space.sm}px;
    --jq-space-md: ${space.md}px;
    --jq-space-lg: ${space.lg}px;
    --jq-space-xl: ${space.xl}px;
  `;
}

/** Server-rendered <style> contents. Light is the default; dark applies via
 * system preference OR an explicit data-theme override in either direction. */
export function buildThemeStyleTag(): string {
  return `
:root {
  ${staticVars()}
  ${themeVars(light)}
  color-scheme: light;
}

@media (prefers-color-scheme: dark) {
  :root {
    ${themeVars(dark)}
    color-scheme: dark;
  }
}

:root[data-theme="dark"] {
  ${themeVars(dark)}
  color-scheme: dark;
}

:root[data-theme="light"] {
  ${themeVars(light)}
  color-scheme: light;
}
`;
}
