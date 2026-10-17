/* Ready-made looks for boxes and buttons. Used to build the blank "styles" parts and by
 * the inspector's Quick styles, so a look can be put on anything after it is placed. */
import type { Node } from "../model/types";

export interface StylePreset {
  id: string;
  name: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: Node["radius"];
  shadow?: Node["shadow"];
  shadowCss?: string;
  /** colour for the text and icons inside; unset = the theme's normal text colour */
  ink?: string;
}

const GRADIENT = "linear-gradient(135deg, #4C8DFF 0%, #8B5CF6 100%)";

export const BOX_STYLES: StylePreset[] = [
  { id: "plain", name: "Plain", radius: "none" },
  { id: "card", name: "Card", fill: "$surface", stroke: "$border", strokeWidth: 1, radius: "md" },
  { id: "outlined", name: "Outlined", stroke: "$border", strokeWidth: 2, radius: "md" },
  { id: "soft", name: "Soft", fill: "$surfaceAlt", radius: "md" },
  { id: "tinted", name: "Tinted", fill: "$primarySoft", radius: "md", ink: "$onPrimarySoft" },
  { id: "elevated", name: "Elevated", fill: "$surface", radius: "lg", shadow: "md" },
  { id: "floating", name: "Floating", fill: "$surface", radius: "lg", shadowCss: "0 24px 48px -12px rgba(16, 24, 40, 0.25)" },
  { id: "glass", name: "Glass", fill: "rgba(255, 255, 255, 0.55)", stroke: "rgba(255, 255, 255, 0.8)", strokeWidth: 1, radius: "lg", shadow: "sm" },
  { id: "brand", name: "Brand", fill: "$primary", radius: "md", ink: "$onPrimary" },
  { id: "dark", name: "Dark", fill: "$inverse", radius: "md", ink: "#FFFFFF" },
  { id: "gradient", name: "Gradient", fill: GRADIENT, radius: "lg", ink: "#FFFFFF" },
  { id: "pill", name: "Pill", fill: "$surfaceAlt", radius: "full" },
];

export const BUTTON_STYLES: StylePreset[] = [
  { id: "filled", name: "Filled", fill: "$primary", radius: "md", ink: "$onPrimary" },
  { id: "soft", name: "Soft", fill: "$primarySoft", radius: "md", ink: "$onPrimarySoft" },
  { id: "outline", name: "Outline", fill: "$surface", stroke: "$border", strokeWidth: 1, radius: "md", ink: "$text" },
  { id: "ghost", name: "Ghost", radius: "md", ink: "$primary" },
  { id: "pill", name: "Pill", fill: "$primary", radius: "full", ink: "$onPrimary" },
  { id: "pill-outline", name: "Pill outline", stroke: "$primary", strokeWidth: 1.5, radius: "full", ink: "$primary" },
  { id: "dark", name: "Dark", fill: "$inverse", radius: "md", ink: "#FFFFFF" },
  { id: "gradient", name: "Gradient", fill: GRADIENT, radius: "md", ink: "#FFFFFF", shadowCss: "0 8px 20px -6px rgba(99, 102, 241, 0.55)" },
  { id: "elevated", name: "Elevated", fill: "$surface", radius: "md", shadow: "md", ink: "$text" },
  { id: "danger", name: "Danger", fill: "$danger", radius: "md", ink: "#FFFFFF" },
  { id: "success", name: "Success", fill: "$success", radius: "md", ink: "#FFFFFF" },
  { id: "square", name: "Square", fill: "$primary", radius: "none", ink: "$onPrimary" },
];

export const FIELD_STYLES: StylePreset[] = [
  { id: "outlined", name: "Outlined", fill: "$surface", stroke: "$border", strokeWidth: 1, radius: "sm" },
  { id: "filled", name: "Filled", fill: "$surfaceAlt", radius: "sm" },
  { id: "underline", name: "Underline", radius: "none", shadowCss: "inset 0 -1.5px 0 #9AA0A6" },
  { id: "rounded", name: "Rounded", fill: "$surface", stroke: "$border", strokeWidth: 1, radius: "full" },
  { id: "soft", name: "Soft", fill: "$primarySoft", radius: "md" },
  { id: "dark", name: "Dark", fill: "$inverse", radius: "sm", ink: "#FFFFFF" },
];

export const BUTTON_SIZES = {
  S: { h: 32, pad: 12, style: "caption" },
  M: { h: 44, pad: 18, style: "button" },
  L: { h: 52, pad: 24, style: "button" },
} as const;

/** colours that only make sense on a particular background: re-ink these, keep the rest */
const SWAPPABLE = new Set([undefined, "$text", "$textMuted", "#FFFFFF", "#FFF", "$onPrimary", "$onPrimarySoft", "$primary"]);

/** put a look on a node; inner text and icons follow the look's ink colour */
export function applyStyle(nodes: Record<string, Node>, id: string, p: StylePreset) {
  const n = nodes[id];
  if (!n) return;
  for (const k of ["fill", "stroke", "strokeWidth", "radius", "shadow", "shadowCss"] as const) {
    if (p[k] === undefined) delete n[k];
    else (n as unknown as Record<string, unknown>)[k] = p[k];
  }
  // a button's ink is its whole point; a box only re-inks text that was following the background
  const button = n.atomic;
  const walk = (cid: string) => {
    const c = nodes[cid];
    if (!c) return;
    if (c !== n && c.atomic) return; // buttons and fields inside keep their own look
    if (c !== n && c.fill && !button) return; // so do boxes with their own background
    if (c.type === "text" || c.type === "icon") {
      const keep = c.type === "text" && c.color && !SWAPPABLE.has(c.color);
      if (!keep) {
        if (p.ink) c.color = c.type === "text" && !button && c.color === "$textMuted" && !p.ink.startsWith("#") ? c.color : p.ink;
        else if (c.color === "#FFFFFF" || c.color === "$onPrimary" || c.color === "$onPrimarySoft") delete c.color;
      }
    }
    c.children.forEach(walk);
  };
  walk(id);
}

/** which preset list fits a node */
export function stylesFor(n: Node): { kind: "button" | "field" | "box"; list: StylePreset[] } {
  if (n.atomic && /^Button/.test(n.name)) return { kind: "button", list: BUTTON_STYLES };
  if (n.name === "Input" || n.name === "Select" || /^Field/.test(n.name)) return { kind: "field", list: FIELD_STYLES };
  return { kind: "box", list: BOX_STYLES };
}
