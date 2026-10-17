/* Figma → editable design. Reads a file through the Figma REST API (with the user's
 * personal access token) or from a saved JSON copy of that API response, and maps it
 * onto Freakma's model: auto-layout frames stay auto layout, plain frames and groups
 * become free-position containers, text keeps its typography, shapes and icons become
 * vectors (exact path geometry), and image fills are downloaded into the design. */
import type { Fragment, Layout, Node } from "../model/types";
import { uid } from "../model/doc";
import { bridge } from "../platform";

/* ---------- the subset of the Figma REST schema we read ---------- */

interface RGBA { r: number; g: number; b: number; a: number }
interface Paint {
  type: string;
  visible?: boolean;
  opacity?: number;
  color?: RGBA;
  gradientHandlePositions?: { x: number; y: number }[];
  gradientStops?: { color: RGBA; position: number }[];
  imageRef?: string;
  scaleMode?: string;
}
interface Effect { type: string; visible?: boolean; color?: RGBA; offset?: { x: number; y: number }; radius?: number; spread?: number }
interface Box { x: number; y: number; width: number; height: number }
export interface FNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  children?: FNode[];
  absoluteBoundingBox?: Box | null;
  size?: { x: number; y: number };
  relativeTransform?: number[][];
  opacity?: number;
  fills?: Paint[];
  strokes?: Paint[];
  strokeWeight?: number;
  cornerRadius?: number;
  rectangleCornerRadii?: number[];
  effects?: Effect[];
  clipsContent?: boolean;
  layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL" | "GRID";
  layoutWrap?: "NO_WRAP" | "WRAP";
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  primaryAxisAlignItems?: "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN";
  counterAxisAlignItems?: "MIN" | "CENTER" | "MAX" | "BASELINE";
  primaryAxisSizingMode?: "FIXED" | "AUTO";
  counterAxisSizingMode?: "FIXED" | "AUTO";
  layoutSizingHorizontal?: "FIXED" | "HUG" | "FILL";
  layoutSizingVertical?: "FIXED" | "HUG" | "FILL";
  layoutGrow?: number;
  layoutAlign?: string;
  layoutPositioning?: "AUTO" | "ABSOLUTE";
  characters?: string;
  style?: {
    fontFamily?: string;
    fontWeight?: number;
    fontSize?: number;
    italic?: boolean;
    lineHeightPx?: number;
    letterSpacing?: number;
    textAlignHorizontal?: string;
    textCase?: string;
    textDecoration?: string;
    textAutoResize?: string;
  };
  fillGeometry?: { path: string; windingRule?: string }[];
  strokeGeometry?: { path: string; windingRule?: string }[];
}
export interface FigmaFile { name: string; document: FNode }

export interface ImportedPage {
  name: string;
  frames: { frag: Fragment; x: number; y: number }[];
}

const MAX_NODES = 6000;

/* ---------- URL + network ---------- */

/** "https://www.figma.com/design/KEY/Name?node-id=1-2" → { key, nodeId } */
export function parseFigmaUrl(input: string): { key: string; nodeId?: string } | null {
  const s = input.trim();
  const m = /figma\.com\/(?:file|design|proto)\/([A-Za-z0-9]+)(?:\/branch\/([A-Za-z0-9]+))?/.exec(s);
  const key = m ? m[2] || m[1] : /^[A-Za-z0-9]{10,}$/.test(s) ? s : null;
  if (!key) return null;
  const id = /[?&]node-id=([^&#]+)/.exec(s)?.[1];
  return { key, nodeId: id ? decodeURIComponent(id).replace(/-/g, ":") : undefined };
}

async function getJson(url: string, token: string) {
  const headers = { "X-Figma-Token": token };
  if (bridge) {
    const r = await bridge.fetchUrl(url, headers);
    if (!r.ok) throw new Error(figmaError(r.status, r.text));
    return JSON.parse(r.text ?? "{}");
  }
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(figmaError(r.status, await r.text()));
  return r.json();
}

function figmaError(status: number, body?: string) {
  if (status === 403) return "Figma refused the token. Create a personal access token in Figma (Settings → Security) with file read access.";
  if (status === 404) return "Figma could not find that file. Check the link, and that your account can open it.";
  let msg = "";
  try {
    msg = JSON.parse(body ?? "").err ?? "";
  } catch {}
  return `Figma error ${status}${msg ? `: ${msg}` : ""}`;
}

async function toDataUrl(url: string): Promise<string> {
  if (bridge) {
    const r = await bridge.fetchUrl(url, {}, true);
    if (!r.ok || !r.base64) return url;
    return `data:${r.type.split(";")[0] || "image/png"};base64,${r.base64}`;
  }
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = () => res(url);
      fr.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}

/** fetch a Figma file (or just the frames in the link's node-id) and convert it */
export async function fetchFigma(link: string, token: string, onStatus: (s: string) => void): Promise<{ name: string; pages: ImportedPage[] }> {
  const p = parseFigmaUrl(link);
  if (!p) throw new Error("That doesn't look like a Figma file link");
  onStatus("Reading the file from Figma…");
  const base = `https://api.figma.com/v1/files/${p.key}`;
  const file: FigmaFile = await getJson(`${base}?geometry=paths${p.nodeId ? `&ids=${encodeURIComponent(p.nodeId)}` : ""}`, token);
  const refs = new Set<string>();
  walk(file.document, (n) => [...(n.fills ?? []), ...(n.strokes ?? [])].forEach((f) => f.type === "IMAGE" && f.imageRef && refs.add(f.imageRef)));
  const images: Record<string, string> = {};
  if (refs.size) {
    onStatus(`Downloading ${refs.size} image${refs.size > 1 ? "s" : ""}…`);
    const r = await getJson(`${base}/images`, token);
    const urls: Record<string, string> = r.meta?.images ?? r.images ?? {};
    const list = [...refs].filter((k) => urls[k]);
    let done = 0;
    // a few at a time so big files don't stall
    for (let i = 0; i < list.length; i += 6) {
      await Promise.all(list.slice(i, i + 6).map(async (k) => {
        images[k] = await toDataUrl(urls[k]);
        onStatus(`Downloading images… ${++done}/${list.length}`);
      }));
    }
  }
  onStatus("Building the design…");
  return { name: file.name, pages: convertFigma(file, images, p.nodeId) };
}

function walk(n: FNode, fn: (n: FNode) => void) {
  fn(n);
  n.children?.forEach((c) => walk(c, fn));
}

/* ---------- conversion ---------- */

const hex = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0");
function rgba(c: RGBA, opacity = 1): string {
  const a = (c.a ?? 1) * opacity;
  if (a >= 0.999) return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`.toUpperCase();
  return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${+a.toFixed(3)})`;
}

function paintCss(p: Paint, images: Record<string, string>, w: number, h: number): string | undefined {
  const op = p.opacity ?? 1;
  if (p.type === "SOLID" && p.color) return rgba(p.color, op);
  const stops = (p.gradientStops ?? []).map((s) => `${rgba(s.color, op)} ${Math.round(s.position * 100)}%`).join(", ");
  const [h0, h1] = p.gradientHandlePositions ?? [];
  if (p.type === "GRADIENT_LINEAR" && h0 && h1) {
    const ang = (Math.atan2((h1.x - h0.x) * w, -(h1.y - h0.y) * h) * 180) / Math.PI;
    return `linear-gradient(${Math.round(ang)}deg, ${stops})`;
  }
  if (p.type === "GRADIENT_RADIAL" && h0) return `radial-gradient(circle at ${Math.round(h0.x * 100)}% ${Math.round(h0.y * 100)}%, ${stops})`;
  if (p.type === "GRADIENT_ANGULAR" && h0) return `conic-gradient(from 90deg at ${Math.round(h0.x * 100)}% ${Math.round(h0.y * 100)}%, ${stops})`;
  if (p.type === "IMAGE" && p.imageRef && images[p.imageRef]) {
    const size = p.scaleMode === "FIT" ? "contain" : p.scaleMode === "TILE" ? "auto" : "cover";
    return `url("${images[p.imageRef]}") center / ${size} ${p.scaleMode === "TILE" ? "repeat" : "no-repeat"}`;
  }
  return undefined;
}

const visiblePaints = (ps?: Paint[]) => (ps ?? []).filter((p) => p.visible !== false);

class FigmaConverter {
  nodes: Record<string, Node> = {};
  count = 0;
  constructor(private images: Record<string, string>) {}

  size(f: FNode) {
    const b = f.absoluteBoundingBox;
    return { w: Math.max(0, f.size?.x ?? b?.width ?? 0), h: Math.max(0, f.size?.y ?? b?.height ?? 0) };
  }

  rotation(f: FNode) {
    const m = f.relativeTransform;
    if (!m) return 0;
    const deg = (Math.atan2(m[1][0], m[0][0]) * 180) / Math.PI;
    // the matrix maps (1,0) to (cos φ, sin φ) on a y-down screen, so φ is already CSS's clockwise angle
    return Math.abs(deg) < 0.01 ? 0 : Math.round(deg * 100) / 100;
  }

  /** top-left of the unrotated box relative to the origin (works for rotated nodes too) */
  pos(f: FNode, origin: { x: number; y: number }) {
    const b = f.absoluteBoundingBox;
    const { w, h } = this.size(f);
    if (!b) return { x: 0, y: 0 };
    return { x: Math.round(b.x + b.width / 2 - w / 2 - origin.x), y: Math.round(b.y + b.height / 2 - h / 2 - origin.y) };
  }

  common(f: FNode, n: Node) {
    if (f.opacity !== undefined && f.opacity < 1) n.opacity = +f.opacity.toFixed(3);
    const rot = this.rotation(f);
    if (rot) n.rotation = rot;
    const shadows = (f.effects ?? [])
      .filter((e) => e.visible !== false && (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW") && e.color)
      .map((e) => `${e.type === "INNER_SHADOW" ? "inset " : ""}${e.offset?.x ?? 0}px ${e.offset?.y ?? 0}px ${e.radius ?? 0}px ${e.spread ?? 0}px ${rgba(e.color!)}`);
    if (shadows.length && f.type !== "TEXT") n.shadowCss = shadows.join(", ");
  }

  boxStyle(f: FNode, n: Node) {
    const fills = visiblePaints(f.fills);
    const css = fills.map((p) => paintCss(p, this.images, n.w, n.h)).filter(Boolean) as string[];
    // Figma lists paints bottom-up; CSS lists backgrounds top-down. Only the last can be a colour.
    if (css.length) n.fill = css.length === 1 ? css[0] : css.reverse().map((c, i, a) => (i < a.length - 1 && !/gradient|url\(/.test(c) ? `linear-gradient(${c}, ${c})` : c)).join(", ");
    const stroke = visiblePaints(f.strokes).find((p) => p.type === "SOLID");
    if (stroke?.color && (f.strokeWeight ?? 1) > 0) {
      n.stroke = rgba(stroke.color, stroke.opacity ?? 1);
      n.strokeWidth = f.strokeWeight ?? 1;
    }
    const r = f.cornerRadius ?? f.rectangleCornerRadii?.[0];
    if (r) n.radius = Math.round(r);
    if (f.clipsContent) n.clip = true;
  }

  layoutOf(f: FNode): Layout {
    const pad: [number, number, number, number] = [f.paddingTop ?? 0, f.paddingRight ?? 0, f.paddingBottom ?? 0, f.paddingLeft ?? 0];
    if (f.layoutMode !== "HORIZONTAL" && f.layoutMode !== "VERTICAL")
      return { mode: "free", gap: 0, padding: [0, 0, 0, 0], align: "start", justify: "start", wrap: false, columns: 3 };
    const al = { MIN: "start", CENTER: "center", MAX: "end", BASELINE: "end" } as const;
    const ju = { MIN: "start", CENTER: "center", MAX: "end", SPACE_BETWEEN: "between" } as const;
    return {
      mode: f.layoutMode === "HORIZONTAL" ? "row" : "column",
      gap: Math.round(f.itemSpacing ?? 0),
      padding: pad.map(Math.round) as Layout["padding"],
      align: al[f.counterAxisAlignItems ?? "MIN"] ?? "start",
      justify: ju[f.primaryAxisAlignItems ?? "MIN"] ?? "start",
      wrap: f.layoutWrap === "WRAP",
      columns: 3,
    };
  }

  /** sizing modes from the node and its auto-layout parent */
  sizing(f: FNode, n: Node, parent: FNode | null) {
    const auto = parent && (parent.layoutMode === "HORIZONTAL" || parent.layoutMode === "VERTICAL") && f.layoutPositioning !== "ABSOLUTE";
    const map = { FIXED: "fixed", HUG: "hug", FILL: "fill" } as const;
    let w: Node["wMode"] = "fixed", h: Node["hMode"] = "fixed";
    if (f.layoutSizingHorizontal) w = map[f.layoutSizingHorizontal];
    if (f.layoutSizingVertical) h = map[f.layoutSizingVertical];
    if (!f.layoutSizingHorizontal && !f.layoutSizingVertical) {
      if (f.layoutMode === "HORIZONTAL" || f.layoutMode === "VERTICAL") {
        const primaryHug = f.primaryAxisSizingMode === "AUTO", counterHug = f.counterAxisSizingMode === "AUTO";
        if (f.layoutMode === "HORIZONTAL") (w = primaryHug ? "hug" : "fixed"), (h = counterHug ? "hug" : "fixed");
        else (h = primaryHug ? "hug" : "fixed"), (w = counterHug ? "hug" : "fixed");
      }
      if (auto) {
        const row = parent!.layoutMode === "HORIZONTAL";
        if (f.layoutGrow === 1) row ? (w = "fill") : (h = "fill");
        if (f.layoutAlign === "STRETCH") row ? (h = "fill") : (w = "fill");
      }
    }
    if (f.type === "TEXT") {
      const ar = f.style?.textAutoResize;
      if (ar === "WIDTH_AND_HEIGHT") (w = w === "fill" ? "fill" : "hug"), (h = "hug");
      else if (ar === "HEIGHT") h = "hug";
    }
    // fill only means something inside auto layout
    if (!auto) {
      if (w === "fill") w = "fixed";
      if (h === "fill") h = "fixed";
    }
    n.wMode = w;
    n.hMode = h;
  }

  /** convert one node; origin is the parent's top-left (absolute) for free positioning */
  convert(f: FNode, parent: FNode | null, origin: { x: number; y: number }, parentFree: boolean): string | null {
    if (f.visible === false || this.count >= MAX_NODES) return null;
    this.count++;
    const { w, h } = this.size(f);
    const id = uid("fg");
    const base: Node = { id, type: "box", name: f.name || f.type.toLowerCase(), children: [], w: Math.round(w), h: Math.round(h), wMode: "fixed", hMode: "fixed" };
    const absChild = f.layoutPositioning === "ABSOLUTE";
    if (parentFree || absChild) {
      Object.assign(base, this.pos(f, origin));
      if (absChild && !parentFree) base.abs = true;
    }
    this.sizing(f, base, parent);
    this.common(f, base);
    const t = f.type;

    if (t === "TEXT") {
      const st = f.style ?? {};
      const fill = visiblePaints(f.fills).find((p) => p.type === "SOLID");
      Object.assign(base, {
        type: "text",
        text: f.characters ?? "",
        textStyle: "body",
        fontFamily: st.fontFamily,
        fontSize: st.fontSize ? Math.round(st.fontSize * 10) / 10 : undefined,
        fontWeight: st.fontWeight,
        lineHeight: st.lineHeightPx && st.fontSize ? +(st.lineHeightPx / st.fontSize).toFixed(3) : undefined,
        letterSpacing: st.letterSpacing ? +st.letterSpacing.toFixed(2) : undefined,
        textAlign: st.textAlignHorizontal === "CENTER" ? "center" : st.textAlignHorizontal === "RIGHT" ? "right" : undefined,
        italic: st.italic || undefined,
        underline: st.textDecoration === "UNDERLINE" || undefined,
        uppercase: st.textCase === "UPPER" || undefined,
        color: fill?.color ? rgba(fill.color, fill.opacity ?? 1) : undefined,
      } satisfies Partial<Node>);
      for (const k of Object.keys(base) as (keyof Node)[]) if (base[k] === undefined) delete base[k];
      this.nodes[id] = base;
      return id;
    }

    const shape = ["VECTOR", "STAR", "LINE", "REGULAR_POLYGON", "ELLIPSE", "BOOLEAN_OPERATION"].includes(t);
    const imageFill = visiblePaints(f.fills).find((p) => p.type === "IMAGE");
    if (t === "RECTANGLE" && imageFill?.imageRef) {
      Object.assign(base, { type: "image", src: this.images[imageFill.imageRef] ?? "", fit: imageFill.scaleMode === "FIT" ? "contain" : "cover" });
      const r = f.cornerRadius ?? f.rectangleCornerRadii?.[0];
      if (r) base.radius = Math.round(r);
      this.nodes[id] = base;
      return id;
    }
    if (shape && !(t === "ELLIPSE" && imageFill)) {
      this.vector(f, base);
      this.nodes[id] = base;
      return id;
    }

    // containers: frames, components, instances, sections, groups, rectangles
    this.boxStyle(f, base);
    const kids = f.children ?? [];
    if (kids.length || t !== "RECTANGLE") {
      const lay = t === "GROUP" ? this.layoutOf({ ...f, layoutMode: "NONE" }) : this.layoutOf(f);
      base.layout = lay;
      if (t === "ELLIPSE") base.radius = "full";
      const b = f.absoluteBoundingBox;
      const myOrigin = b ? { x: b.x + b.width / 2 - w / 2, y: b.y + b.height / 2 - h / 2 } : origin;
      for (const k of kids) {
        const c = this.convert(k, f, myOrigin, lay.mode === "free");
        if (c) base.children.push(c);
      }
      // a group is just its children's bounding box: never clip, never paint
      if (t === "GROUP") delete base.clip;
    }
    this.nodes[id] = base;
    return id;
  }

  vector(f: FNode, n: Node) {
    const fills = visiblePaints(f.fills);
    const strokes = visiblePaints(f.strokes).filter((p) => p.type === "SOLID");
    const fillGeo = f.fillGeometry ?? [];
    const strokeGeo = f.strokeGeometry ?? [];
    n.type = "vector";
    n.vw = Math.max(1, n.w);
    n.vh = Math.max(1, n.h);
    if (fillGeo.length && fills.length) {
      n.d = fillGeo.map((g) => g.path).join(" ");
      n.evenOdd = fillGeo.some((g) => g.windingRule === "EVENODD") || undefined;
      n.fill = paintCss(fills[fills.length - 1], this.images, n.w, n.h);
      if (strokes[0]?.color && (f.strokeWeight ?? 0) > 0) {
        n.stroke = rgba(strokes[0].color, strokes[0].opacity ?? 1);
        n.strokeWidth = f.strokeWeight;
      }
    } else if (strokeGeo.length && strokes[0]?.color) {
      // outline of the stroke, painted as a fill: exact for any stroke style
      n.d = strokeGeo.map((g) => g.path).join(" ");
      n.fill = rgba(strokes[0].color, strokes[0].opacity ?? 1);
    } else if (f.type === "LINE" && strokes[0]?.color) {
      n.points = [{ x: 0, y: 0 }, { x: n.vw, y: 0 }];
      n.stroke = rgba(strokes[0].color, strokes[0].opacity ?? 1);
      n.strokeWidth = f.strokeWeight ?? 1;
      n.h = Math.max(1, n.h);
    } else {
      n.d = "";
    }
    if (!n.evenOdd) delete n.evenOdd;
    if (n.fill === undefined) delete n.fill;
  }
}

const SCREEN_TYPES = new Set(["FRAME", "COMPONENT", "COMPONENT_SET", "INSTANCE", "SECTION"]);
const DEVICE_BY_WIDTH: Record<number, string> = { 1440: "desktop", 1280: "laptop", 834: "tablet", 390: "iphone", 393: "iphone", 375: "iphone", 412: "android", 360: "android" };

/** a whole file (or the pruned tree the API returns for ?ids=) → pages of screens */
export function convertFigma(file: FigmaFile, images: Record<string, string> = {}, onlyNode?: string): ImportedPage[] {
  const conv = new FigmaConverter(images);
  const pages: ImportedPage[] = [];
  const isTarget = (n: FNode): boolean => !onlyNode || n.id === onlyNode || !!n.children?.some(isTarget);
  for (const canvas of file.document.children ?? []) {
    if (canvas.type !== "CANVAS") continue;
    const page: ImportedPage = { name: canvas.name, frames: [] };
    // sections only group screens on the board: lift their screens out
    const tops: FNode[] = [];
    const lift = (list: FNode[]) => {
      for (const n of list) {
        if (n.visible === false) continue;
        if (n.type === "SECTION" && n.children?.length) lift(n.children);
        else tops.push(n);
      }
    };
    lift(canvas.children ?? []);
    for (const t of tops) {
      if (onlyNode && !isTarget(t)) continue;
      // a link to one layer inside a screen imports just that layer as its own screen
      const pick = onlyNode && t.id !== onlyNode ? findNode(t, onlyNode) ?? t : t;
      const b = pick.absoluteBoundingBox;
      if (!b) continue;
      conv.nodes = {};
      const asScreen = SCREEN_TYPES.has(pick.type);
      let root: string | null;
      if (asScreen) root = conv.convert(pick, null, { x: b.x, y: b.y }, false);
      else {
        // a loose layer on the canvas gets a transparent screen around it
        const inner = conv.convert(pick, null, { x: b.x, y: b.y }, true);
        root = inner && uid("fg");
        if (root && inner) {
          conv.nodes[inner].x = 0;
          conv.nodes[inner].y = 0;
          conv.nodes[root] = { id: root, type: "box", name: pick.name, children: [inner], w: Math.round(b.width), h: Math.round(b.height), wMode: "fixed", hMode: "fixed", layout: { mode: "free", gap: 0, padding: [0, 0, 0, 0], align: "start", justify: "start", wrap: false, columns: 3 } };
        }
      }
      if (!root) continue;
      const r = conv.nodes[root];
      r.type = "frame";
      if (r.wMode === "fill") r.wMode = "fixed";
      if (r.hMode === "fill") r.hMode = "fixed";
      delete r.x;
      delete r.y;
      delete r.abs;
      delete r.rotation;
      if (!r.layout) r.layout = { mode: "free", gap: 0, padding: [0, 0, 0, 0], align: "start", justify: "start", wrap: false, columns: 3 };
      const dev = DEVICE_BY_WIDTH[r.w];
      if (dev) r.device = dev;
      page.frames.push({ frag: { root, nodes: conv.nodes }, x: Math.round(b.x), y: Math.round(b.y) });
    }
    if (page.frames.length) pages.push(page);
  }
  if (!pages.length) throw new Error(onlyNode ? "That link points at nothing Freakma can import" : "The file has no visible layers to import");
  return pages;
}

function findNode(n: FNode, id: string): FNode | null {
  if (n.id === id) return n;
  for (const c of n.children ?? []) {
    const f = findNode(c, id);
    if (f) return f;
  }
  return null;
}
