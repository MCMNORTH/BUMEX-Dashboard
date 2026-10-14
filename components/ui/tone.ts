/**
 * The five tones every badge, chip, and status marker uses.
 * Color means status: brand for "in motion", success / warning / danger for outcomes,
 * neutral for everything categorical (types, categories, methods, visibility).
 * Brand is the fixed BUMEX navy, not the user's theme color, so a red or green theme
 * can't make "in progress" look like danger or success.
 */
export type Tone = "neutral" | "brand" | "success" | "warning" | "danger";

export const toneBadge: Record<Tone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  brand: "border-brand/20 bg-brand/10 text-brand",
  success: "border-success/25 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-danger/25 bg-danger/10 text-danger",
};

/** Small solid dot, for compact rows and column headers. */
export const toneDot: Record<Tone, string> = {
  neutral: "bg-muted-foreground/50",
  brand: "bg-brand",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};
