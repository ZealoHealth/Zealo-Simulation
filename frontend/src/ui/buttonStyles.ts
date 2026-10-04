/**
 * Button looks, shared by `<Button>` and by router links styled as buttons.
 * Kept out of `ui/index.tsx` so that file exports only components (fast refresh).
 */
export type ButtonVariant = "primary" | "secondary" | "quiet" | "ghost" | "danger" | "inverse";
export type ButtonSize = "md" | "lg";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: "bg-scrub text-white hover:bg-scrub-dark",
  secondary: "border-[1.5px] border-scrub text-scrub hover:bg-scrub-tint",
  quiet: "border-[1.5px] border-line text-ink hover:border-muted",
  ghost: "text-ink-2 hover:bg-wash",
  danger: "bg-out text-white hover:bg-out-text",
  /** White on the green results band. */
  inverse: "bg-surface text-scrub hover:bg-wash",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  md: "min-h-11 rounded-lg px-4 text-[15px]",
  /** Home hero calls to action. */
  lg: "min-h-[52px] rounded-lg px-6 text-[17px]",
};

export function buttonClass(variant: ButtonVariant = "quiet", size: ButtonSize = "md") {
  return `inline-flex items-center justify-center gap-2 font-bold transition-colors ${BUTTON_SIZES[size]} ${BUTTON_STYLES[variant]}`;
}
