/* HTML → editable design. The page is rendered in a hidden, script-free iframe, then
 * every visible element is read back with its computed styles and position:
 * flex and grid become auto layout, block flow becomes a vertical stack (with spacers
 * where the page had uneven gaps), positioned elements become free-positioned layers,
 * images and SVGs become images, and text keeps its font, size, weight and colour. */
import type { Fragment, Layout, Node } from "../model/types";
import { uid } from "../model/doc";

const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "HEAD", "META", "LINK", "TITLE", "IFRAME", "OBJECT", "EMBED", "BR", "WBR", "SOURCE", "TRACK", "AREA", "MAP"]);
const MAX_NODES = 3000;

export interface HtmlImportOptions {
  width: number;
  baseUrl?: string;
  name?: string;
}

function toHex(c: string): string | undefined {
  const m = /rgba?\(([^)]+)\)/.exec(c);
  if (!m) return c && c !== "transparent" ? c : undefined;
  const [r, g, b, a = "1"] = m[1].split(/[\s,/]+/).filter(Boolean);
  const alpha = parseFloat(a);
  if (alpha === 0) return undefined;
  if (alpha < 1) return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  return "#" + [r, g, b].map((v) => Math.round(parseFloat(v)).toString(16).padStart(2, "0")).join("").toUpperCase();
}

const px = (v: string) => parseFloat(v) || 0;
const firstFamily = (f: string) => f.split(",")[0].trim().replace(/^["']|["']$/g, "");

function waitFor(iframe: HTMLIFrameElement, ms: number) {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => !done && ((done = true), resolve());
    iframe.addEventListener("load", finish, { once: true });
    setTimeout(finish, ms);
  });
}

export interface Mounted {
  iframe: HTMLIFrameElement;
  doc: Document;
  win: Window;
  /** the viewport height the page is laid out in (what 100vh means) */
  viewportH: number;
}

/** render HTML in a hidden, script-free iframe at a device size */
export async function mountHtml(html: string, opts: HtmlImportOptions & { viewportH?: number }): Promise<Mounted> {
  const viewportH = opts.viewportH ?? (opts.width < 800 ? 844 : 900);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-same-origin");
  iframe.style.cssText = `position:fixed;left:-30000px;top:0;width:${opts.width}px;height:${viewportH}px;border:0;opacity:0;pointer-events:none`;
  const base = opts.baseUrl ? `<base href="${opts.baseUrl.replace(/"/g, "&quot;")}">` : "";
  let src = html;
  if (base) src = /<head[^>]*>/i.test(src) ? src.replace(/<head[^>]*>/i, (m) => m + base) : base + src;
  iframe.srcdoc = src;
  document.body.appendChild(iframe);
  try {
    await waitFor(iframe, 10000);
    const d = iframe.contentDocument!;
    await Promise.race([d.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]);
    await new Promise((r) => setTimeout(r, 400));
    return { iframe, doc: d, win: iframe.contentWindow!, viewportH };
  } catch (e) {
    iframe.remove();
    throw e;
  }
}

/** turn what the mounted page shows right now into a fragment; byEl maps elements to their nodes */
export function convertMounted(m: Mounted, name: string) {
  const d = m.doc;
  const conv = new Converter(m.win);
  const root = conv.root(d.body ?? d.documentElement, name);
  const contentH = Math.max(d.body?.scrollHeight ?? 0, d.documentElement.scrollHeight, Math.round(d.body?.getBoundingClientRect().height ?? 0));
  return { frag: { root, nodes: conv.nodes } as Fragment, height: Math.round(contentH), title: d.title, byEl: conv.byEl };
}

export async function htmlToFragment(html: string, opts: HtmlImportOptions): Promise<{ frag: Fragment; height: number; title: string }> {
  const m = await mountHtml(html, opts);
  try {
    const r = convertMounted(m, opts.name ?? (m.doc.title || "Imported page"));
    return { frag: r.frag, height: r.height, title: r.title };
  } finally {
    m.iframe.remove();
  }
}

class Converter {
  nodes: Record<string, Node> = {};
  /** which node each converted element became (used to wire up prototype links) */
  byEl = new Map<Element, string>();
  count = 0;
  constructor(private win: Window) {}

  cs(el: Element) {
    return this.win.getComputedStyle(el);
  }

  add(n: Node) {
    this.nodes[n.id] = n;
    this.count++;
    return n.id;
  }

  label(el: Element, fallback: string) {
    const aria = el.getAttribute("aria-label");
    if (aria) return aria.slice(0, 40);
    const tag = el.tagName.toLowerCase();
    const cls = (el.getAttribute("class") || "").split(/\s+/).filter((c) => c && c.length < 30)[0];
    const sem = { nav: "Navigation", header: "Header", footer: "Footer", main: "Main", aside: "Sidebar", section: "Section", form: "Form", ul: "List", ol: "List", li: "Item", table: "Table", button: "Button", a: "Link" } as Record<string, string>;
    return sem[tag] ? (cls ? `${sem[tag]} · ${cls}` : sem[tag]) : cls ? `${fallback} · ${cls}` : fallback;
  }

  visible(el: Element, cs: CSSStyleDeclaration) {
    if (cs.display === "none" || cs.visibility === "hidden" || cs.visibility === "collapse") return false;
    if (parseFloat(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0.5 && r.height > 0.5;
  }

  boxStyle(cs: CSSStyleDeclaration, n: Node, r: DOMRect) {
    const bg = toHex(cs.backgroundColor);
    const img = cs.backgroundImage && cs.backgroundImage !== "none" ? cs.backgroundImage : "";
    if (img) n.fill = img.startsWith("url(") ? `${img} ${cs.backgroundPosition || "center"} / ${cs.backgroundSize === "auto" ? "cover" : cs.backgroundSize} no-repeat${bg ? " " + bg : ""}` : img + (bg ? `, ${bg}` : "");
    else if (bg) n.fill = bg;
    const bw = px(cs.borderTopWidth), bl = px(cs.borderLeftWidth), bb = px(cs.borderBottomWidth);
    if (bw > 0 && cs.borderTopStyle !== "none" && bw === bl && bw === bb) {
      const c = toHex(cs.borderTopColor);
      if (c) {
        n.stroke = c;
        n.strokeWidth = bw;
      }
    }
    const rad = cs.borderTopLeftRadius;
    if (rad && rad !== "0px") n.radius = rad.endsWith("%") ? (Math.abs(r.width - r.height) < 2 ? "full" : Math.round((px(rad) / 100) * r.width)) : Math.round(px(rad));
    if (cs.boxShadow && cs.boxShadow !== "none") n.shadowCss = cs.boxShadow;
    const op = parseFloat(cs.opacity);
    if (op < 1) n.opacity = op;
    if (cs.overflow === "hidden" || cs.overflowX === "hidden" || cs.overflow === "clip") n.clip = true;
  }

  hasBoxLook(cs: CSSStyleDeclaration) {
    return (toHex(cs.backgroundColor) !== undefined) || (cs.backgroundImage && cs.backgroundImage !== "none") || px(cs.borderTopWidth) > 0 || px(cs.paddingTop) + px(cs.paddingLeft) > 0 || (cs.boxShadow && cs.boxShadow !== "none");
  }

  textProps(cs: CSSStyleDeclaration): Partial<Node> {
    const size = px(cs.fontSize) || 16;
    const lh = cs.lineHeight === "normal" ? 1.25 : px(cs.lineHeight) / size;
    const align = cs.textAlign === "center" ? "center" : cs.textAlign === "right" || cs.textAlign === "end" ? "right" : "left";
    const p: Partial<Node> = {
      textStyle: "body",
      fontFamily: firstFamily(cs.fontFamily),
      fontSize: Math.round(size * 10) / 10,
      fontWeight: parseInt(cs.fontWeight, 10) || 400,
      lineHeight: Math.round(lh * 100) / 100,
      color: toHex(cs.color) ?? "#000000",
      textAlign: align,
    };
    if (cs.letterSpacing !== "normal" && px(cs.letterSpacing)) p.letterSpacing = px(cs.letterSpacing);
    if (cs.textTransform === "uppercase") p.uppercase = true;
    if (cs.fontStyle === "italic") p.italic = true;
    if (/underline/.test(cs.textDecorationLine || cs.textDecoration)) p.underline = true;
    return p;
  }

  /** an element whose content is only text and inline formatting */
  isTextLeaf(el: Element): boolean {
    if (!el.textContent?.trim()) return false;
    for (const c of Array.from(el.children)) {
      if (SKIP.has(c.tagName)) continue;
      if (/^(IMG|SVG|VIDEO|CANVAS|INPUT|SELECT|TEXTAREA|BUTTON|PICTURE)$/i.test(c.tagName)) return false;
      const cs = this.cs(c);
      if (cs.display !== "inline" && cs.display !== "contents") return false;
      if (this.hasBoxLook(cs) && cs.display !== "inline") return false;
    }
    return true;
  }

  root(body: Element, name: string): string {
    const cs = this.cs(body);
    const htmlCs = this.cs(body.ownerDocument.documentElement);
    const r = body.getBoundingClientRect();
    const n: Node = { id: uid("h"), type: "box", name, children: [], w: r.width, h: r.height, wMode: "fill", hMode: "hug", layout: this.layoutFor(body, cs, r) };
    n.fill = toHex(cs.backgroundColor) ?? toHex(htmlCs.backgroundColor) ?? "#FFFFFF";
    this.add(n);
    n.children = this.childrenOf(body, n, r, cs);
    n.part = false;
    return n.id;
  }

  layoutFor(el: Element, cs: CSSStyleDeclaration, _r: DOMRect): Layout {
    const pad: [number, number, number, number] = [px(cs.paddingTop), px(cs.paddingRight), px(cs.paddingBottom), px(cs.paddingLeft)];
    const disp = cs.display;
    const L: Layout = { mode: "column", gap: 0, padding: pad.map(Math.round) as Layout["padding"], align: "start", justify: "start", wrap: false, columns: 3 };
    const map = (v: string): Layout["align"] => (/center/.test(v) ? "center" : /end|right|bottom/.test(v) ? "end" : "start");
    if (disp.includes("flex")) {
      L.mode = cs.flexDirection.startsWith("column") ? "column" : "row";
      L.gap = Math.round(px(L.mode === "row" ? cs.columnGap : cs.rowGap));
      L.wrap = cs.flexWrap !== "nowrap";
      L.align = map(cs.alignItems);
      const j = cs.justifyContent;
      L.justify = /space/.test(j) ? "between" : /center/.test(j) ? "center" : /end|right/.test(j) ? "end" : "start";
    } else if (disp.includes("grid")) {
      L.mode = "grid";
      L.columns = Math.max(1, cs.gridTemplateColumns.split(/\s+(?![^(]*\))/).filter(Boolean).length);
      L.gap = Math.round(px(cs.columnGap) || px(cs.rowGap));
    } else if (cs.textAlign === "center") L.align = "center";
    void el;
    return L;
  }

  /** convert the children of a container, deciding layout details from where things actually are */
  childrenOf(el: Element, parent: Node, pr: DOMRect, pcs: CSSStyleDeclaration): string[] {
    const L = parent.layout!;
    const innerL = pr.left + px(pcs.borderLeftWidth) + px(pcs.paddingLeft);
    const innerT = pr.top + px(pcs.borderTopWidth) + px(pcs.paddingTop);
    const innerW = pr.width - px(pcs.borderLeftWidth) - px(pcs.borderRightWidth) - px(pcs.paddingLeft) - px(pcs.paddingRight);
    const items: { id: string; r: DOMRect; positioned: boolean }[] = [];
    const reversed = /reverse/.test(pcs.flexDirection);

    for (const child of Array.from(el.childNodes)) {
      if (this.count > MAX_NODES) break;
      if (child.nodeType === 3) {
        const t = child.textContent?.replace(/\s+/g, " ").trim();
        if (!t) continue;
        const range = el.ownerDocument.createRange();
        range.selectNodeContents(child);
        const r = range.getBoundingClientRect();
        if (r.width < 0.5) continue;
        const id = this.add({ id: uid("h"), type: "text", name: t.slice(0, 24), children: [], w: Math.ceil(r.width) + 1, h: r.height, wMode: "hug", hMode: "hug", text: t, ...this.textProps(pcs) });
        items.push({ id, r, positioned: false });
        continue;
      }
      if (child.nodeType !== 1) continue;
      const c = child as Element;
      if (SKIP.has(c.tagName)) continue;
      const cs = this.cs(c);
      if (cs.display === "contents") {
        // flatten: its children belong to this container
        for (const g of Array.from(c.children)) {
          const gcs = this.cs(g);
          if (!this.visible(g, gcs)) continue;
          const id = this.element(g, gcs, L, innerW);
          if (id) this.byEl.set(g, id);
          if (id) items.push({ id, r: g.getBoundingClientRect(), positioned: /absolute|fixed/.test(gcs.position) });
        }
        continue;
      }
      if (!this.visible(c, cs)) continue;
      const id = this.element(c, cs, L, innerW);
      if (id) this.byEl.set(c, id);
      if (id) items.push({ id, r: c.getBoundingClientRect(), positioned: /absolute|fixed/.test(cs.position) });
    }

    const flow = items.filter((i) => !i.positioned);
    if (reversed) flow.reverse();
    // positioned children float at their spot
    for (const it of items.filter((i) => i.positioned)) {
      const n = this.nodes[it.id];
      Object.assign(n, { abs: true, x: Math.round(it.r.left - pr.left), y: Math.round(it.r.top - pr.top), wMode: "fixed", w: Math.round(it.r.width) });
      if (n.type !== "text") Object.assign(n, { hMode: "fixed", h: Math.round(it.r.height) });
    }

    // block flow: detect side-by-side inline-blocks, and keep real spacing with gap or spacers
    if (L.mode === "column" && flow.length > 1) {
      const sameLine = flow.every((f, i) => i === 0 || (Math.abs(f.r.top - flow[0].r.top) < 4 && f.r.left >= flow[i - 1].r.right - 2));
      if (sameLine) {
        L.mode = "row";
        L.align = "start";
        L.wrap = true;
        const gaps = flow.slice(1).map((f, i) => Math.round(f.r.left - flow[i].r.right));
        L.gap = Math.max(0, Math.min(...gaps));
      }
    }
    const out: string[] = [];
    if (L.mode === "column") {
      const lead = flow.length ? Math.round(flow[0].r.top - innerT) : 0;
      if (lead > 1) L.padding[0] += lead;
      const gaps = flow.slice(1).map((f, i) => Math.round(f.r.top - flow[i].r.bottom));
      const pos = gaps.filter((g) => g >= 0);
      const uniform = pos.length === gaps.length && gaps.every((g) => Math.abs(g - gaps[0]) <= 1);
      if (uniform && gaps.length) L.gap = Math.max(0, gaps[0]);
      flow.forEach((f, i) => {
        if (i > 0 && !uniform && gaps[i - 1] > 1) out.push(this.add({ id: uid("h"), type: "box", name: "Spacer", children: [], w: 1, h: gaps[i - 1], wMode: "fill", hMode: "fixed", layout: undefined }));
        out.push(f.id);
      });
      // centred children (margin: auto) → centre the column
      const fixedKids = flow.filter((f) => this.nodes[f.id].wMode !== "fill");
      if (fixedKids.length && fixedKids.every((f) => Math.abs(f.r.left - innerL - (innerL + innerW - f.r.right)) < 3 && f.r.left - innerL > 3)) L.align = "center";
    } else {
      flow.forEach((f) => out.push(f.id));
    }
    for (const it of items.filter((i) => i.positioned)) out.push(it.id);

    // sizes relative to this container
    for (const f of flow) {
      const n = this.nodes[f.id];
      if (n.wMode === "fixed" && n.type !== "image" && n.type !== "vector" && L.mode !== "row" && Math.abs(f.r.width - innerW) <= 1.5) n.wMode = "fill";
    }
    return out;
  }

  element(c: Element, cs: CSSStyleDeclaration, parentL: Layout, parentInnerW: number): string | null {
    const r = c.getBoundingClientRect();
    const tag = c.tagName.toUpperCase();
    const base = { id: uid("h"), children: [] as string[], w: Math.round(r.width), h: Math.round(r.height) };

    if (tag === "IMG" || tag === "PICTURE") {
      const img = (tag === "PICTURE" ? c.querySelector("img") : c) as HTMLImageElement | null;
      const n: Node = { ...base, type: "image", name: img?.alt || "Image", wMode: "fixed", hMode: "fixed", src: img?.currentSrc || img?.src, fit: cs.objectFit === "contain" ? "contain" : "cover" };
      this.boxStyle(cs, n, r);
      return this.add(n);
    }
    if (tag === "SVG" || c instanceof (this.win as unknown as { SVGSVGElement: typeof SVGSVGElement }).SVGSVGElement) {
      const clone = c.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("width", String(Math.round(r.width)));
      clone.setAttribute("height", String(Math.round(r.height)));
      if (!clone.getAttribute("xmlns")) clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const svg = new XMLSerializer().serializeToString(clone).replace(/currentColor/g, toHex(cs.color) ?? "#000");
      return this.add({ ...base, type: "image", name: c.getAttribute("aria-label") || "Icon", wMode: "fixed", hMode: "fixed", src: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg), fit: "contain" });
    }
    if (tag === "VIDEO" || tag === "CANVAS") {
      let src: string | undefined;
      try {
        src = tag === "CANVAS" ? (c as HTMLCanvasElement).toDataURL() : (c as HTMLVideoElement).poster || undefined;
      } catch {}
      return this.add({ ...base, type: "image", name: tag === "VIDEO" ? "Video" : "Canvas", wMode: "fixed", hMode: "fixed", src, fit: "cover" });
    }
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
      const inp = c as HTMLInputElement;
      if (/checkbox|radio/.test(inp.type)) {
        return this.add({ ...base, type: "box", name: inp.type, wMode: "fixed", hMode: "fixed", stroke: "#888888", strokeWidth: 1.5, radius: inp.type === "radio" ? "full" : 3, fill: inp.checked ? "$primary" : "#FFFFFF" });
      }
      const value = inp.value || inp.placeholder || (tag === "SELECT" ? (c as HTMLSelectElement).selectedOptions[0]?.text : "") || "";
      const box: Node = { ...base, type: "box", name: tag === "SELECT" ? "Select" : "Input", wMode: "fixed", hMode: "fixed", layout: { ...this.layoutFor(c, cs, r), mode: "row", align: tag === "TEXTAREA" ? "start" : "center" } };
      this.boxStyle(cs, box, r);
      if (value) box.children.push(this.add({ id: uid("h"), type: "text", name: value.slice(0, 24), children: [], w: 100, h: 20, wMode: "fill", hMode: "hug", text: value, ...this.textProps(cs), ...(inp.value ? {} : { color: "#8A8F98" }) }));
      return this.add(box);
    }

    if (this.isTextLeaf(c)) {
      const text = ((c as HTMLElement).innerText ?? c.textContent ?? "").replace(/ /g, " ").trim();
      if (!text) return null;
      const lines = Math.round(r.height / (px(cs.lineHeight) || px(cs.fontSize) * 1.25 || 20));
      const t: Node = { ...base, children: [], type: "text", name: text.slice(0, 24), text, wMode: "hug", hMode: "hug", ...this.textProps(cs) };
      const boxy = this.hasBoxLook(cs);
      if (!boxy) {
        if (lines > 1 || Math.abs(r.width - parentInnerW) <= 1.5) t.wMode = Math.abs(r.width - parentInnerW) <= 1.5 ? "fill" : "fixed";
        return this.add(t);
      }
      // a styled text element (button, badge, link button): a box around the text
      const box: Node = { ...base, id: uid("h"), children: [], type: "box", name: this.label(c, "Text box"), wMode: cs.display === "block" && Math.abs(r.width - parentInnerW) <= 1.5 ? "fill" : "hug", hMode: "hug", layout: { ...this.layoutFor(c, cs, r), mode: "row", align: "center", justify: cs.textAlign === "center" || /flex/.test(cs.display) ? "center" : "start" } };
      if (/flex/.test(cs.display)) box.layout!.justify = /center/.test(cs.justifyContent) ? "center" : box.layout!.justify;
      this.boxStyle(cs, box, r);
      const inner = c.getBoundingClientRect();
      t.wMode = lines > 1 ? "fill" : "hug";
      t.w = Math.round(inner.width);
      box.children.push(this.add(t));
      if (px(cs.height) && Math.abs(px(cs.height) - r.height) < 1 && r.height > (px(cs.paddingTop) + px(cs.paddingBottom) + px(cs.fontSize) * 1.6)) {
        box.hMode = "fixed";
      }
      return this.add(box);
    }

    const n: Node = { ...base, type: "box", name: this.label(c, "Group"), wMode: "fixed", hMode: "hug", layout: this.layoutFor(c, cs, r) };
    this.boxStyle(cs, n, r);
    this.add(n);
    n.children = this.childrenOf(c, n, r, cs);
    if (!n.children.length) n.hMode = "fixed";
    if (parentL.mode === "row" && parseFloat(cs.flexGrow) > 0) n.wMode = "fill";
    else if (/inline/.test(cs.display) || (parentL.mode === "row" && !(Math.abs(r.width - parentInnerW) <= 1.5))) n.wMode = n.children.length ? "hug" : "fixed";
    if (n.wMode === "hug" && this.nodes[n.children[0]]?.wMode === "fill") n.wMode = "fixed";
    return n.id;
  }
}
