import type { Fragment, Layout, Node } from "../model/types";
import { defaultLayout, uid } from "../model/doc";

type Pad = number | [number, number] | [number, number, number, number];
export interface BoxOpts extends Partial<Omit<Node, "layout" | "children">> {
  gap?: number;
  pad?: Pad;
  align?: Layout["align"];
  justify?: Layout["justify"];
  wrap?: boolean;
  columns?: number;
}

const pad4 = (p: Pad | undefined): [number, number, number, number] => {
  if (p === undefined) return [0, 0, 0, 0];
  if (typeof p === "number") return [p, p, p, p];
  if (p.length === 2) return [p[0], p[1], p[0], p[1]];
  return p;
};

/** a tiny DSL for writing parts: every call creates a node and returns its id */
export class Builder {
  nodes: Record<string, Node> = {};

  private add(n: Node): string {
    this.nodes[n.id] = n;
    return n.id;
  }

  private box(mode: Layout["mode"], o: BoxOpts, children: string[]): string {
    const { gap, pad, align, justify, wrap, columns, ...rest } = o;
    const layout: Layout = { ...defaultLayout(mode, gap ?? 12, 0), padding: pad4(pad), align: align ?? "start", justify: justify ?? "start", wrap: wrap ?? false, columns: columns ?? 3 };
    return this.add({ id: uid(), type: "box", name: rest.name ?? (mode === "row" ? "Row" : mode === "grid" ? "Grid" : "Stack"), children, w: 200, h: 48, wMode: "fill", hMode: "hug", layout, ...rest });
  }

  col(o: BoxOpts, children: string[] = []) {
    return this.box("column", o, children);
  }
  row(o: BoxOpts, children: string[] = []) {
    return this.box("row", { align: "center", ...o }, children);
  }
  grid(o: BoxOpts, children: string[] = []) {
    return this.box("grid", o, children);
  }

  text(text: string, style = "body", o: Partial<Node> = {}) {
    return this.add({ id: uid(), type: "text", name: o.name ?? (text.length > 24 ? text.slice(0, 24) + "…" : text), children: [], w: 120, h: 20, wMode: "hug", hMode: "hug", text, textStyle: style, ...o });
  }

  icon(icon: string, size = 20, color = "$text", o: Partial<Node> = {}) {
    return this.add({ id: uid(), type: "icon", name: `Icon · ${icon}`, children: [], w: size, h: size, wMode: "fixed", hMode: "fixed", icon, color, ...o });
  }

  img(o: Partial<Node> = {}) {
    return this.add({ id: uid(), type: "image", name: "Image", children: [], w: 320, h: 180, wMode: "fill", hMode: "fixed", fit: "cover", radius: "md", ...o });
  }

  /* ----- composite helpers shared by many parts ----- */

  button(label: string, variant: "primary" | "secondary" | "outline" | "ghost" | "danger" = "primary", o: BoxOpts & { icon?: string; trailing?: string } = {}) {
    const { icon, trailing, ...rest } = o;
    const fg = { primary: "$onPrimary", secondary: "$onPrimarySoft", outline: "$text", ghost: "$primary", danger: "#FFFFFF" }[variant];
    const bg = { primary: "$primary", secondary: "$primarySoft", outline: "$surface", ghost: undefined, danger: "$danger" }[variant];
    const kids: string[] = [];
    if (icon) kids.push(this.icon(icon, 18, fg));
    if (label) kids.push(this.text(label, "button", { color: fg }));
    if (trailing) kids.push(this.icon(trailing, 18, fg));
    return this.row(
      { name: `Button · ${label || icon}`, gap: 8, pad: [0, label ? 18 : 0], justify: "center", wMode: label ? "hug" : "fixed", w: 44, hMode: "fixed", h: 44, fill: bg, radius: "md", stroke: variant === "outline" ? "$border" : undefined, strokeWidth: variant === "outline" ? 1 : undefined, ...rest },
      kids,
    );
  }

  field(label: string, placeholder: string, o: { icon?: string; trailing?: string; value?: string; multiline?: boolean; help?: string } = {}) {
    const inner: string[] = [];
    if (o.icon) inner.push(this.icon(o.icon, 18, "$textMuted"));
    inner.push(this.text(o.value ?? placeholder, "body", { color: o.value ? "$text" : "$textMuted", wMode: "fill", name: o.value ? "Value" : "Placeholder" }));
    if (o.trailing) inner.push(this.icon(o.trailing, 18, "$textMuted"));
    const box = o.multiline
      ? this.col({ name: "Input", pad: [10, 12], hMode: "fixed", h: 96, fill: "$surface", stroke: "$border", strokeWidth: 1, radius: "sm" }, inner)
      : this.row({ name: "Input", gap: 8, pad: [0, 12], hMode: "fixed", h: 44, fill: "$surface", stroke: "$border", strokeWidth: 1, radius: "sm" }, inner);
    const kids = label ? [this.text(label, "label")] : [];
    kids.push(box);
    if (o.help) kids.push(this.text(o.help, "caption", { color: "$textMuted" }));
    return this.col({ name: `Field · ${label || placeholder}`, gap: 6 }, kids);
  }

  check(label: string, on = true) {
    const box = this.row({ name: "Box", wMode: "fixed", w: 20, hMode: "fixed", h: 20, justify: "center", radius: 4, fill: on ? "$primary" : "$surface", stroke: on ? undefined : "$textMuted", strokeWidth: on ? undefined : 2 }, on ? [this.icon("check", 14, "$onPrimary")] : []);
    return this.row({ name: `Checkbox · ${label}`, gap: 10, wMode: "hug", hMode: "fixed", h: 32 }, [box, this.text(label, "body")]);
  }

  radio(label: string, on = false) {
    const dot = this.row({ name: "Ring", wMode: "fixed", w: 20, hMode: "fixed", h: 20, justify: "center", radius: "full", stroke: on ? "$primary" : "$textMuted", strokeWidth: 2 }, on ? [this.row({ name: "Dot", wMode: "fixed", w: 10, hMode: "fixed", h: 10, radius: "full", fill: "$primary" })] : []);
    return this.row({ name: `Radio · ${label}`, gap: 10, wMode: "hug", hMode: "fixed", h: 32 }, [dot, this.text(label, "body")]);
  }

  toggle(label: string, on = true) {
    const knob = this.row({ name: "Knob", wMode: "fixed", w: 22, hMode: "fixed", h: 22, radius: "full", fill: on ? "$onPrimary" : "$textMuted" });
    const track = this.row({ name: "Track", wMode: "fixed", w: 48, hMode: "fixed", h: 28, radius: "full", pad: [0, 3], justify: on ? "end" : "start", fill: on ? "$primary" : "$surfaceAlt", stroke: on ? undefined : "$textMuted", strokeWidth: on ? undefined : 1 }, [knob]);
    return this.row({ name: `Switch · ${label}`, gap: 12, justify: "between", hMode: "fixed", h: 40 }, [this.text(label, "body"), track]);
  }

  chip(label: string, on = false, icon?: string) {
    const kids = [];
    if (on) kids.push(this.icon("check", 16, "$onPrimarySoft"));
    else if (icon) kids.push(this.icon(icon, 16, "$textMuted"));
    kids.push(this.text(label, "label", { color: on ? "$onPrimarySoft" : "$text" }));
    return this.row({ name: `Chip · ${label}`, gap: 6, pad: [0, 12], wMode: "hug", hMode: "fixed", h: 34, radius: "sm", fill: on ? "$primarySoft" : "$surface", stroke: on ? undefined : "$border", strokeWidth: on ? undefined : 1 }, kids);
  }

  badge(label: string, tone: "success" | "warning" | "danger" | "neutral" | "primary" = "neutral") {
    const map = { success: ["$successSoft", "$success"], warning: ["$warningSoft", "$warning"], danger: ["$dangerSoft", "$danger"], neutral: ["$surfaceAlt", "$textMuted"], primary: ["$primarySoft", "$onPrimarySoft"] }[tone];
    return this.row({ name: `Badge · ${label}`, pad: [3, 10], wMode: "hug", radius: "full", fill: map[0] }, [this.text(label, "caption", { color: map[1], fontWeight: 600 })]);
  }

  avatar(initials: string, size = 40) {
    return this.row({ name: "Avatar", wMode: "fixed", w: size, hMode: "fixed", h: size, justify: "center", radius: "full", fill: "$primarySoft" }, [this.text(initials, "label", { color: "$onPrimarySoft" })]);
  }

  divider() {
    return this.row({ name: "Divider", hMode: "fixed", h: 1, fill: "$border" });
  }

  /** a progress bar; set the Value's width to change the amount */
  bar(pct: number, tone = "$primary", width = 280) {
    const inner = this.row({ name: "Value", wMode: "fixed", w: Math.round((pct / 100) * width), hMode: "fill", radius: "full", fill: tone });
    return this.row({ name: "Progress", wMode: "fixed", w: width, hMode: "fixed", h: 8, radius: "full", fill: "$surfaceAlt", align: "start" }, [inner]);
  }

  card(children: string[], o: BoxOpts = {}) {
    return this.col({ name: "Card", gap: 12, pad: 20, fill: "$surface", radius: "md", stroke: "$border", strokeWidth: 1, ...o }, children);
  }

  done(root: string): Fragment {
    this.nodes[root].part = true;
    return { root, nodes: this.nodes };
  }
}

export const make = (fn: (b: Builder) => string): Fragment => {
  const b = new Builder();
  return b.done(fn(b));
};
