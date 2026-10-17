import type { CSSProperties } from "react";
import type { Layout, Node, Theme, VectorPoint } from "../model/types";
import { SHADOWS, color, fontStack, radius, textSpec } from "../model/theme";

const ALIGN: Record<string, string> = { start: "flex-start", center: "center", end: "flex-end" };
const JUSTIFY: Record<string, string> = { start: "flex-start", center: "center", end: "flex-end", between: "space-between" };

/** is this node placed by its own x/y rather than by its parent's auto layout? */
export const isPositioned = (n: Node, parentLayout?: Layout) => !!n.abs || parentLayout?.mode === "free";

/** CSS for one node. Used by the canvas and by HTML/React export, so what you
 * see is what you export. */
export function nodeStyle(n: Node, parentLayout: Layout | undefined, t: Theme, topLevel = false): CSSProperties {
  const s: CSSProperties = { boxSizing: "border-box", position: "relative", minWidth: 0 };
  const pdir = parentLayout?.mode;
  const positioned = !topLevel && isPositioned(n, parentLayout);

  if (topLevel) {
    s.width = n.w;
    if (n.hMode === "fixed") s.height = n.h;
    else s.minHeight = n.h;
  } else if (positioned) {
    s.position = "absolute";
    s.left = n.x ?? 0;
    s.top = n.y ?? 0;
    if (n.wMode === "fixed" || n.type === "vector") s.width = n.w;
    else if (n.wMode === "fill") s.right = 0;
    if (n.hMode === "fixed" || n.type === "vector") s.height = n.h;
    else if (n.hMode === "fill") s.bottom = 0;
  } else {
    // main axis "fill" grows; cross axis "fill" stretches
    if (n.wMode === "fixed") {
      s.width = n.w;
      s.flexShrink = 0;
    } else if (n.wMode === "fill") {
      if (pdir === "row") s.flex = "1 1 0";
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
    if (L.mode === "free") {
      s.display = "block";
    } else if (L.mode === "grid") {
      s.display = "grid";
      s.gap = L.gap;
      s.gridTemplateColumns = `repeat(${Math.max(1, L.columns)}, minmax(0, 1fr))`;
      s.alignItems = ALIGN[L.align];
      s.alignContent = "start";
    } else {
      s.display = "flex";
      s.gap = L.gap;
      s.flexDirection = L.mode;
      s.alignItems = ALIGN[L.align];
      s.justifyContent = JUSTIFY[L.justify];
      s.flexWrap = L.wrap ? "wrap" : "nowrap";
    }
  }

  const bg = color(t, n.fill);
  if (bg && n.type !== "vector") s.background = bg;
  if (n.type !== "vector" && n.stroke && (n.strokeWidth ?? 1) > 0) s.border = `${n.strokeWidth ?? 1}px solid ${color(t, n.stroke)}`;
  const r = radius(t, n.radius);
  if (r !== undefined) s.borderRadius = r;
  if (n.shadowCss) s.boxShadow = n.shadowCss;
  else if (n.shadow && n.shadow !== "none") s.boxShadow = SHADOWS[n.shadow];
  if (n.opacity !== undefined && n.opacity < 1) s.opacity = n.opacity;
  if (n.clip) s.overflow = "hidden";
  if (n.rotation) {
    s.transform = `rotate(${n.rotation}deg)`;
    s.transformOrigin = "center";
  }

  if (n.type === "text") {
    const ts = textSpec(t, n);
    s.fontFamily = fontStack(ts.family);
    s.fontSize = ts.size;
    s.fontWeight = ts.weight;
    s.lineHeight = ts.lineHeight;
    const ls = n.letterSpacing ?? ts.letterSpacing;
    if (ls) s.letterSpacing = ls;
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

  if (n.type === "vector") {
    s.flexShrink = 0;
    s.overflow = "visible";
    if (!positioned && n.wMode !== "fill") s.width = n.w;
    if (!positioned && n.hMode !== "fill") s.height = n.h;
  }

  if (n.type === "frame") {
    s.fontFamily = fontStack(t.fonts.body);
    s.color = color(t, "$text");
  }

  return s;
}

/** points → SVG path data */
export function pathData(pts: VectorPoint[] | undefined, closed?: boolean): string {
  if (!pts || !pts.length) return "";
  const f = (v: number) => Math.round(v * 100) / 100;
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
  const seg = (a: VectorPoint, b: VectorPoint) => {
    if (a.ox === undefined && b.ix === undefined) return ` L${f(b.x)} ${f(b.y)}`;
    return ` C${f(a.ox ?? a.x)} ${f(a.oy ?? a.y)} ${f(b.ix ?? b.x)} ${f(b.iy ?? b.y)} ${f(b.x)} ${f(b.y)}`;
  };
  for (let i = 1; i < pts.length; i++) d += seg(pts[i - 1], pts[i]);
  if (closed && pts.length > 2) d += seg(pts[pts.length - 1], pts[0]) + " Z";
  return d;
}

/** the SVG markup of a vector node, sized to fill its box */
export function vectorSvg(n: Node, t: Theme): string {
  const vw = n.vw || n.w || 1, vh = n.vh || n.h || 1;
  const d = n.d ?? pathData(n.points, n.closed);
  const stroke = color(t, n.stroke) ?? "none";
  let fill = n.closed || n.d ? color(t, n.fill) ?? "none" : "none";
  // SVG can't paint a CSS gradient: use its first colour
  if (/gradient\(/.test(fill)) fill = /(#[0-9a-f]{3,8}|rgba?\([^)]*\))/i.exec(fill)?.[1] ?? "none";
  const sw = n.stroke ? n.strokeWidth ?? 2 : 0;
  const id = "m" + n.id.replace(/[^a-z0-9]/gi, "");
  const marker = (which: "s" | "e") =>
    `<marker id="${id}${which}" viewBox="0 0 10 10" refX="${which === "e" ? 8 : 2}" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${stroke}"/></marker>`;
  const arrows = n.arrow && n.arrow !== "none" ? `<defs>${marker("e")}${n.arrow === "both" ? marker("s") : ""}</defs>` : "";
  const ma = n.arrow === "end" || n.arrow === "both" ? ` marker-end="url(#${id}e)"` : "";
  const ms = n.arrow === "both" ? ` marker-start="url(#${id}s)"` : "";
  return `<svg width="100%" height="100%" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="none" style="overflow:visible;display:block" xmlns="http://www.w3.org/2000/svg">${arrows}<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${n.evenOdd ? ' fill-rule="evenodd"' : ""} vector-effect="non-scaling-stroke"${ma}${ms}/></svg>`;
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
