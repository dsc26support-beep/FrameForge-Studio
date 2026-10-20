import type { Animation } from '@frameforge/project-schema';

export const EASING_CSS: Record<Animation['easing'], string> = {
  linear: 'linear',
  ease: 'ease',
  easeIn: 'cubic-bezier(0.42, 0, 1, 1)',
  easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
  easeInOut: 'cubic-bezier(0.42, 0, 0.58, 1)',
  overshoot: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
};

/** Stacks use single quotes so they can be embedded in double-quoted style attributes. */
export const FONT_STACKS = {
  sans: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'Liberation Sans', sans-serif",
  serif: "Georgia, 'Times New Roman', 'Noto Serif', 'Liberation Serif', serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
  display: "Impact, 'Arial Black', 'Helvetica Neue', 'Liberation Sans', Arial, sans-serif",
} as const;
