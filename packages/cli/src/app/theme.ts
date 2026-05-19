/**
 * Shared color tokens for OpenTUI dashboard and Ink-rendered printed CLI output.
 * Palette: Catppuccin Mocha.
 */
export const palette = {
  accent: "#8BD5CA",
  background: "#11111B",
  border: "#45475A",
  danger: "#F38BA8",
  info: "#89B4FA",
  magenta: "#CBA6F7",
  muted: "#9399B2",
  panel: "#181825",
  peach: "#FAB387",
  rose: "#F5C2E7",
  surface: "#313244",
  success: "#A6E3A1",
  text: "#CDD6F4",
  warning: "#F9E2AF"
} as const

export type PaletteKey = keyof typeof palette

export const glyphs = {
  arrow: "›",
  bullet: "•",
  error: "✗",
  info: "ℹ",
  pointer: "➜",
  success: "✓",
  warning: "⚠"
} as const
