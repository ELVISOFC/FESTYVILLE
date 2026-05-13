export const COLORS = {
  bg: "#090A0F",
  surface: "#141724",
  surfaceElev: "#1F2336",
  overlay: "rgba(0,0,0,0.85)",
  primary: "#FF0055",
  secondary: "#00FFFF",
  accent: "#FFD700",
  textPrimary: "#FFFFFF",
  textSecondary: "#94A3B8",
  success: "#00FF66",
  warning: "#FF9900",
  error: "#FF0055",
  grassBase: "#0B2E1D",
  grassBorder: "#134D32",
  dirtBase: "#3D1F0E",
  dirtBorder: "#5C3118",
  gridLines: "rgba(255,255,255,0.08)",
};

export const CATEGORY_COLORS: Record<string, { base: string; highlight: string }> = {
  stage:   { base: "#990033", highlight: "#FF0055" },
  vendor:  { base: "#995C00", highlight: "#FF9900" },
  utility: { base: "#009999", highlight: "#00FFFF" },
  decor:   { base: "#00993D", highlight: "#00FF66" },
};

export const GRADE_COLORS: Record<string, string> = {
  S: "#FFD700",
  A: "#00FF66",
  B: "#00FFFF",
  C: "#FF9900",
  D: "#FF3366",
  F: "#660000",
};

export const PIXEL_FONT = "monospace"; // RN does not bundle Press Start 2P by default
