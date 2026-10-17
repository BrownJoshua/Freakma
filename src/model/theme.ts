import type { Node, Theme, TextStyle } from "./types";

const scale = (heading: "heading" | "body" = "heading"): Record<string, TextStyle> => ({
  display: { label: "Display", size: 48, weight: 700, lineHeight: 1.1, font: heading, letterSpacing: -0.5 },
  h1: { label: "Heading 1", size: 36, weight: 700, lineHeight: 1.15, font: heading, letterSpacing: -0.3 },
  h2: { label: "Heading 2", size: 28, weight: 600, lineHeight: 1.2, font: heading },
  h3: { label: "Heading 3", size: 22, weight: 600, lineHeight: 1.25, font: heading },
  h4: { label: "Heading 4", size: 18, weight: 600, lineHeight: 1.3, font: heading },
  body: { label: "Body", size: 16, weight: 400, lineHeight: 1.5, font: "body" },
  bodySm: { label: "Body small", size: 14, weight: 400, lineHeight: 1.45, font: "body" },
  label: { label: "Label", size: 14, weight: 500, lineHeight: 1.3, font: "body" },
  button: { label: "Button", size: 14, weight: 600, lineHeight: 1.2, font: "body" },
  caption: { label: "Caption", size: 12, weight: 400, lineHeight: 1.35, font: "body" },
  overline: { label: "Overline", size: 11, weight: 600, lineHeight: 1.2, font: "body", letterSpacing: 0.9, uppercase: true },
  mono: { label: "Numbers / code", size: 14, weight: 400, lineHeight: 1.4, font: "mono" },
});

const base = {
  success: "#2E7D4F",
  successSoft: "#E3F1E8",
  warning: "#B5650A",
  warningSoft: "#FFF0D6",
  danger: "#B3261E",
  dangerSoft: "#FBE4E1",
};

export const THEMES: Theme[] = [
  {
    name: "Steel",
    colors: {
      primary: "#1F5F8B", onPrimary: "#FFFFFF", primarySoft: "#E6EEF5", onPrimarySoft: "#163F5E",
      background: "#EEF0EC", surface: "#FFFFFF", surfaceAlt: "#F3F5F1", inverse: "#16191D",
      text: "#1B1F24", textMuted: "#555D66", border: "#DDE1DA", ...base,
    },
    fonts: { heading: "IBM Plex Sans", body: "IBM Plex Sans", mono: "IBM Plex Mono" },
    text: scale(),
    radius: { sm: 6, md: 10, lg: 16 },
    canvas: "#E3E4E1",
  },
  {
    name: "Material",
    colors: {
      primary: "#6750A4", onPrimary: "#FFFFFF", primarySoft: "#EADDFF", onPrimarySoft: "#21005D",
      background: "#FEF7FF", surface: "#FFFFFF", surfaceAlt: "#F3EDF7", inverse: "#322F35",
      text: "#1D1B20", textMuted: "#49454F", border: "#CAC4D0", ...base,
    },
    fonts: { heading: "Roboto", body: "Roboto", mono: "JetBrains Mono" },
    text: scale(),
    radius: { sm: 8, md: 16, lg: 28 },
    canvas: "#E6E1E9",
  },
  {
    name: "Minimal",
    colors: {
      primary: "#111111", onPrimary: "#FFFFFF", primarySoft: "#F0F0F0", onPrimarySoft: "#111111",
      background: "#FFFFFF", surface: "#FFFFFF", surfaceAlt: "#F6F6F6", inverse: "#111111",
      text: "#111111", textMuted: "#5F5F5F", border: "#E5E5E5", ...base,
    },
    fonts: { heading: "Inter", body: "Inter", mono: "JetBrains Mono" },
    text: scale(),
    radius: { sm: 4, md: 8, lg: 12 },
    canvas: "#E9E9E9",
  },
  {
    name: "Warm",
    colors: {
      primary: "#B4430C", onPrimary: "#FFFFFF", primarySoft: "#FFEDD5", onPrimarySoft: "#5C2205",
      background: "#FFFBF5", surface: "#FFFFFF", surfaceAlt: "#FBF3E8", inverse: "#2A1D14",
      text: "#2A1D14", textMuted: "#6B5847", border: "#EADCC9", ...base,
    },
    fonts: { heading: "Playfair Display", body: "Lato", mono: "JetBrains Mono" },
    text: scale(),
    radius: { sm: 6, md: 12, lg: 20 },
    canvas: "#EDE6DC",
  },
  {
    name: "Dark",
    colors: {
      primary: "#8AB4F8", onPrimary: "#0B1B33", primarySoft: "#22344F", onPrimarySoft: "#D6E3FF",
      background: "#121417", surface: "#1B1E23", surfaceAlt: "#23272E", inverse: "#E8EAED",
      text: "#E8EAED", textMuted: "#9AA0A6", border: "#30353C",
      success: "#81C995", successSoft: "#1E3527", warning: "#FDD663", warningSoft: "#3A3220", danger: "#F28B82", dangerSoft: "#3D2321",
    },
    fonts: { heading: "Inter", body: "Inter", mono: "JetBrains Mono" },
    text: scale(),
    radius: { sm: 6, md: 10, lg: 16 },
    canvas: "#0B0C0E",
  },
];

export const FONT_CHOICES = [
  "Inter", "Roboto", "IBM Plex Sans", "Poppins", "Lato", "Montserrat", "Playfair Display",
  "Source Serif 4", "Noto Sans Tamil", "IBM Plex Mono", "JetBrains Mono", "system-ui", "Georgia",
];

export const COLOR_LABELS: Record<string, string> = {
  primary: "Primary", onPrimary: "On primary", primarySoft: "Primary soft", onPrimarySoft: "On primary soft",
  background: "Page background", surface: "Surface (cards)", surfaceAlt: "Surface alt", inverse: "Inverse (dark bars)",
  text: "Text", textMuted: "Text muted", border: "Border",
  success: "Success", successSoft: "Success soft", warning: "Warning", warningSoft: "Warning soft", danger: "Danger", dangerSoft: "Danger soft",
};

export const cloneTheme = (t: Theme): Theme => JSON.parse(JSON.stringify(t));

/** "$primary" → theme colour, anything else passes through */
export function color(t: Theme, v?: string): string | undefined {
  if (!v) return undefined;
  if (v.startsWith("$")) return t.colors[v.slice(1)] ?? "#FF00FF";
  return v;
}

export function radius(t: Theme, r: Node["radius"]): number | undefined {
  if (r === undefined || r === "none") return r === "none" ? 0 : undefined;
  if (typeof r === "number") return r;
  if (r === "full") return 999;
  return t.radius[r];
}

export const SHADOWS: Record<string, string> = {
  none: "none",
  sm: "0 1px 2px rgba(16,24,40,.08), 0 1px 3px rgba(16,24,40,.06)",
  md: "0 4px 10px rgba(16,24,40,.10), 0 2px 4px rgba(16,24,40,.06)",
  lg: "0 16px 32px rgba(16,24,40,.16), 0 4px 8px rgba(16,24,40,.08)",
};

export function fontStack(name: string): string {
  const mono = /mono/i.test(name);
  const serif = /serif 4|playfair|georgia/i.test(name);
  return `'${name}', ${mono ? "ui-monospace, Consolas, monospace" : serif ? "Georgia, serif" : "system-ui, 'Segoe UI', sans-serif"}`;
}

/** effective text settings for a text node: its style, then per-node overrides */
export function textSpec(t: Theme, n: Node) {
  const s = t.text[n.textStyle ?? "body"] ?? t.text.body;
  return {
    family: n.fontFamily ?? t.fonts[s.font],
    size: n.fontSize ?? s.size,
    weight: n.fontWeight ?? s.weight,
    lineHeight: n.lineHeight ?? s.lineHeight,
    letterSpacing: s.letterSpacing ?? 0,
    uppercase: n.uppercase ?? s.uppercase ?? false,
  };
}
