import type { CSSProperties } from "react";
import type { Layout, Node, Theme } from "../model/types";
import { SHADOWS, color, fontStack, radius, textSpec } from "../model/theme";

const ALIGN: Record<string, string> = { start: "flex-start", center: "center", end: "flex-end" };
const JUSTIFY: Record<string, string> = { start: "flex-start", center: "center", end: "flex-end", between: "space-between" };

/** CSS for one node. Used by the canvas and by HTML/React export, so what you
 * see is what you export. */
export function nodeStyle(n: Node, parentLayout: Layout | undefined, t: Theme, topLevel = false): CSSProperties {
  const s: CSSProperties = { boxSizing: "border-box", position: "relative", minWidth: 0 };
  const pdir = parentLayout?.mode;

  if (topLevel) {
    s.width = n.w;
    if (n.hMode === "fixed") s.height = n.h;
    else s.minHeight = n.h;
  } else {
    // main axis "fill" grows; cross axis "fill" stretches
    const mainW = pdir === "row";
    if (n.wMode === "fixed") {
      s.width = n.w;
      s.flexShrink = 0;
    } else if (n.wMode === "fill") {
      if (mainW) s.flex = "1 1 0";
      else if (pdir === "column") s.alignSelf = "stretch";
      else if (pdir === "grid") s.justifySelf = "stretch";
    } else if (n.type === "text") {
      s.maxWidth = "100%";
    }
    if (n.hMode === "fixed") {
      s.height = n.h;
      s.flexShrink = 0;
    } else if (n.hMode === "fill") {
      if (pdir === "column") s.flex = "1 1 0";
      else s.alignSelf = "stretch";
    }
  }

  if (n.layout && (n.type === "box" || n.type === "frame")) {
    const L = n.layout;
    const [pt, pr, pb, pl] = L.padding;
    s.padding = `${pt}px ${pr}px ${pb}px ${pl}px`;
    s.gap = L.gap;
    if (L.mode === "grid") {
      s.display = "grid";
      s.gridTemplateColumns = `repeat(${Math.max(1, L.columns)}, minmax(0, 1fr))`;
      s.alignItems = ALIGN[L.align];
      s.alignContent = "start";
    } else {
      s.display = "flex";
      s.flexDirection = L.mode;
      s.alignItems = ALIGN[L.align];
      s.justifyContent = JUSTIFY[L.justify];
      s.flexWrap = L.wrap ? "wrap" : "nowrap";
    }
  }

  const bg = color(t, n.fill);
  if (bg) s.background = bg;
  if (n.stroke && (n.strokeWidth ?? 1) > 0) s.border = `${n.strokeWidth ?? 1}px solid ${color(t, n.stroke)}`;
  const r = radius(t, n.radius);
  if (r !== undefined) s.borderRadius = r;
  if (n.shadow && n.shadow !== "none") s.boxShadow = SHADOWS[n.shadow];
  if (n.opacity !== undefined && n.opacity < 1) s.opacity = n.opacity;
  if (n.clip) s.overflow = "hidden";

  if (n.type === "text") {
    const ts = textSpec(t, n);
    s.fontFamily = fontStack(ts.family);
    s.fontSize = ts.size;
    s.fontWeight = ts.weight;
    s.lineHeight = ts.lineHeight;
    if (ts.letterSpacing) s.letterSpacing = ts.letterSpacing;
    if (ts.uppercase) s.textTransform = "uppercase";
    s.color = color(t, n.color) ?? color(t, "$text");
    s.textAlign = n.textAlign ?? "left";
    s.whiteSpace = "pre-wrap";
    s.overflowWrap = "break-word";
    if (n.italic) s.fontStyle = "italic";
    if (n.underline) s.textDecoration = "underline";
    s.margin = 0;
  }

  if (n.type === "icon") {
    s.width = n.w;
    s.height = n.w;
    s.flexShrink = 0;
    s.color = color(t, n.color) ?? color(t, "$text");
    s.display = "inline-flex";
  }

  if (n.type === "image") {
    s.overflow = "hidden";
    if (!n.src) s.background = bg ?? color(t, "$surfaceAlt");
  }

  if (n.type === "frame") {
    s.fontFamily = fontStack(t.fonts.body);
    s.color = color(t, "$text");
  }

  return s;
}

/** camelCase CSS object → "prop: value; …" for HTML export */
export function cssText(s: CSSProperties): string {
  const unitless = new Set(["opacity", "fontWeight", "lineHeight", "flex", "zIndex", "flexShrink", "flexGrow"]);
  return Object.entries(s)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => {
      const prop = k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
      const val = typeof v === "number" && !unitless.has(k) ? `${v}px` : String(v);
      return `${prop}: ${val}`;
    })
    .join("; ");
}
