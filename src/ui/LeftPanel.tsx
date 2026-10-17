import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, PARTS } from "../parts/library";
import type { PartDef } from "../parts/library";
import { NodeView } from "../render/NodeView";
import { commit, getState, page, select, setState, useStore } from "../model/store";
import { insertComponent, insertPart, moveTo, focusNode } from "../model/actions";
import type { Fragment, Theme } from "../model/types";
import { THEMES, FONT_CHOICES, COLOR_LABELS, cloneTheme } from "../model/theme";
import { isDescendant, parentOf } from "../model/doc";
import { panelPointerDown } from "./dragState";
import { Ico, Num, Section, Select } from "./controls";
import { LibraryTab } from "./Library";
import { CommentsPanel } from "./Comments";

const TAB_LABELS = { parts: "Parts", layers: "Layers", library: "Library", theme: "Theme", comments: "Notes" } as const;
const TAB_TITLES = {
  parts: "Ready-made parts for web and mobile",
  layers: "Everything on the page, in order",
  library: "Your reference library: images, websites, saved designs",
  theme: "Colours, fonts and text styles",
  comments: "Comments on this design",
} as const;

export function LeftPanel() {
  const tab = useStore((s) => s.leftTab);
  const openComments = useStore((s) => (s.doc.comments ?? []).filter((c) => !c.resolved).length);
  return (
    <aside className="panel left">
      <div className="tabs">
        {(["parts", "layers", "library", "theme", "comments"] as const).map((t) => (
          <button key={t} type="button" className={tab === t ? "on" : ""} onClick={() => setState({ leftTab: t })} title={TAB_TITLES[t]}>
            {TAB_LABELS[t]}
            {t === "comments" && openComments > 0 && <small className="count">{openComments}</small>}
          </button>
        ))}
      </div>
      <div className="panel-body">
        {tab === "parts" ? <PartsTab /> : tab === "layers" ? <LayersTab /> : tab === "library" ? <LibraryTab /> : tab === "comments" ? <CommentsPanel /> : <ThemeTab />}
      </div>
    </aside>
  );
}

/* ---------------- parts ---------------- */

/** renders the real part at its natural size, then scales it to fit the tile */
export const Preview = memo(function Preview({ frag, theme, w }: { frag: Fragment; theme: Theme; w: number }) {
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ s: number; x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const box = inner.current?.parentElement;
    if (!box) return;
    const fitNow = () => {
      const el = inner.current?.firstElementChild as HTMLElement | null;
      if (!el) return;
      const W = box.clientWidth, H = box.clientHeight;
      if (W < 20 || H < 20) return;
      const cw = Math.max(el.offsetWidth, 1), ch = Math.max(el.offsetHeight, 1);
      const s = Math.max(0.02, Math.min(1, (W - 10) / cw, (H - 10) / ch));
      setFit({ s, x: (W - cw * s) / 2, y: (H - ch * s) / 2 });
    };
    fitNow();
    // panels can be laid out (or resized) after the first paint: refit when the tile changes size
    const ro = new ResizeObserver(fitNow);
    ro.observe(box);
    return () => ro.disconnect();
  }, [frag, theme]);
  const hug = frag.nodes[frag.root].wMode !== "fill";
  return (
    <div className="pv" style={{ background: theme.colors.background }}>
      <div
        ref={inner}
        className="pv-in"
        style={{ width: w, transform: fit ? `translate(${fit.x}px, ${fit.y}px) scale(${fit.s})` : "scale(0.25)", visibility: fit ? "visible" : "hidden", fontFamily: theme.fonts.body, color: theme.colors.text, display: "flex", alignItems: "flex-start" }}
      >
        <NodeView id={frag.root} nodes={frag.nodes} theme={theme} parentLayout={{ mode: hug ? "row" : "column", gap: 0, padding: [0, 0, 0, 0], align: "start", justify: "start", wrap: false, columns: 1 }} />
      </div>
    </div>
  );
});

function PartTile({ p, theme }: { p: PartDef; theme: Theme }) {
  const frag = useMemo(() => p.make(), [p]);
  return (
    <button
      type="button"
      className="tile"
      title={`${p.name} — drag onto a screen, or click to add`}
      onPointerDown={(e) => panelPointerDown(e, { kind: "part", id: p.id }, p.name, () => insertPart(p))}
      onClick={(e) => e.detail === 0 && insertPart(p)}
    >
      <Preview frag={frag} theme={theme} w={p.previewW} />
      <span>{p.name}</span>
    </button>
  );
}

function PartsTab() {
  const theme = useStore((s) => s.doc.theme);
  const comps = useStore((s) => s.doc.components);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({ Screens: true, "Button styles": true, "Box styles": true, "Field styles": true, Tables: true });
  const filtered = q ? PARTS.filter((p) => (p.name + " " + p.cat).toLowerCase().includes(q.toLowerCase())) : PARTS;
  return (
    <>
      <label className="search">
        <Ico name="search" size={14} />
        <input placeholder="Search parts (button, table, login…)" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <p className="hint">Drag a part onto a screen: it snaps into place (hold Ctrl to drop it exactly where you let go). Click a part to add it to the selected spot. Empty space on the canvas makes a new screen.</p>
      {comps.length > 0 && !q && (
        <div className="cat">
          <h4>My reusable blocks</h4>
          <div className="tiles">
            {comps.map((c) => (
              <button
                key={c.id}
                type="button"
                className="tile"
                title={`${c.name} — drag onto a screen, or click to add`}
                onPointerDown={(e) => panelPointerDown(e, { kind: "component", id: c.id }, c.name, () => insertComponent(c.id))}
                onClick={(e) => e.detail === 0 && insertComponent(c.id)}
              >
                <Preview frag={c.fragment} theme={theme} w={420} />
                <span>{c.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {CATEGORIES.map((cat) => {
        const items = filtered.filter((p) => p.cat === cat);
        if (!items.length) return null;
        const isOpen = q ? true : open[cat] ?? false;
        return (
          <div className="cat" key={cat}>
            <h4>
              <button type="button" onClick={() => setOpen({ ...open, [cat]: !isOpen })} aria-expanded={isOpen}>
                <Ico name={isOpen ? "chevron-down" : "chevron-right"} size={12} />
                {cat}
                <small>{items.length}</small>
              </button>
            </h4>
            {isOpen && (
              <div className="tiles">
                {items.map((p) => (
                  <PartTile key={p.id} p={p} theme={theme} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/* ---------------- layers ---------------- */

const TYPE_ICON: Record<string, string> = { frame: "grid", box: "list", text: "edit", image: "image", icon: "star" };

type LayerDrop = { id: string; where: "before" | "inside" };

/** drag a layer onto another: upper half = before it, lower half of a container = inside it */
function startLayerDrag(e: React.PointerEvent, dragId: string, setDrop: (d: LayerDrop | null) => void) {
  if (e.button !== 0) return;
  const start = { x: e.clientX, y: e.clientY };
  let moving = false;
  let cur: LayerDrop | null = null;
  const mv = (ev: PointerEvent) => {
    if (!moving && Math.abs(ev.clientY - start.y) < 4) return;
    moving = true;
    const row = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest("[data-layer-id]") as HTMLElement | null;
    const id = row?.dataset.layerId;
    const doc = getState().doc;
    if (!row || !id || id === dragId || isDescendant(doc, id, dragId)) cur = null;
    else {
      const r = row.getBoundingClientRect();
      const n = doc.nodes[id];
      const lower = ev.clientY > r.top + r.height / 2;
      cur = n.layout && (lower || n.type === "frame") ? { id, where: "inside" } : n.type === "frame" ? null : { id, where: "before" };
    }
    setDrop(cur);
  };
  const up = () => {
    removeEventListener("pointermove", mv);
    removeEventListener("pointerup", up);
    setDrop(null);
    if (!moving || !cur) return;
    const doc = getState().doc;
    if (cur.where === "inside") moveTo(dragId, cur.id, doc.nodes[cur.id].children.length);
    else {
      const p = parentOf(doc, cur.id);
      if (p) moveTo(dragId, p.id, p.children.indexOf(cur.id));
    }
  };
  addEventListener("pointermove", mv);
  addEventListener("pointerup", up);
}

function LayersTab() {
  const doc = useStore((s) => s.doc);
  const pg = useStore((s) => page(s));
  const selection = useStore((s) => s.selection);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drop, setDrop] = useState<LayerDrop | null>(null);

  const rows: JSX.Element[] = [];
  const walk = (id: string, depth: number) => {
    const n = doc.nodes[id];
    if (!n) return;
    const kids = n.children.length > 0;
    const isClosed = closed[id] ?? depth > 1;
    rows.push(
      <div
        key={id}
        className={"layer" + (selection.includes(id) ? " on" : "") + (n.hidden ? " dim" : "") + (drop?.id === id ? " drop-" + drop.where : "")}
        style={{ paddingLeft: 6 + depth * 14 }}
        data-layer-id={id}
        onPointerDown={(e) => n.type !== "frame" && !(e.target as HTMLElement).closest("button,input") && startLayerDrag(e, id, setDrop)}
        onClick={(e) => {
          select(e.shiftKey ? [...getState().selection, id] : [id]);
          if (n.type === "frame") focusNode(id);
        }}
        onDoubleClick={() => setRenaming(id)}
      >
        <button type="button" className="tw" onClick={(e) => (e.stopPropagation(), setClosed({ ...closed, [id]: !isClosed }))} style={{ visibility: kids ? "visible" : "hidden" }} aria-label={isClosed ? "Expand" : "Collapse"}>
          <Ico name={isClosed ? "chevron-right" : "chevron-down"} size={12} />
        </button>
        <Ico name={n.component ? "box" : TYPE_ICON[n.type]} size={13} />
        {renaming === id ? (
          <input
            autoFocus
            defaultValue={n.name}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v) commit((d) => void (d.nodes[id].name = v));
              setRenaming(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          />
        ) : (
          <span className="nm">{n.name}</span>
        )}
        <button type="button" className="eye" title={n.hidden ? "Show" : "Hide"} onClick={(e) => (e.stopPropagation(), commit((d) => void (d.nodes[id].hidden = !n.hidden)))}>
          <Ico name={n.hidden ? "close" : "eye"} size={13} />
        </button>
        <button type="button" className="eye" title={n.locked ? "Unlock" : "Lock"} onClick={(e) => (e.stopPropagation(), commit((d) => void (d.nodes[id].locked = !n.locked)))}>
          <Ico name="lock" size={13} />
        </button>
      </div>,
    );
    if (kids && !isClosed) n.children.forEach((c) => walk(c, depth + 1));
  };
  pg.frames.forEach((f) => walk(f, 0));

  return (
    <>
      <div className="pages">
        {doc.pages.map((p) => (
          <button key={p.id} type="button" className={p.id === pg.id ? "on" : ""} onClick={() => setState({ pageId: p.id, selection: [] })}>
            {p.name}
          </button>
        ))}
        <button
          type="button"
          title="Add page"
          onClick={() => {
            const id = "p" + Date.now().toString(36);
            commit((d) => void d.pages.push({ id, name: `Page ${d.pages.length + 1}`, frames: [] }), { pageId: id, selection: [] });
          }}
        >
          <Ico name="plus" size={12} />
        </button>
      </div>
      <div className="layers">{rows.length ? rows : <p className="hint">No screens on this page yet.</p>}</div>
      <p className="hint">Drag layers to reorder. Double-click to rename.</p>
    </>
  );
}

/* ---------------- theme ---------------- */

function ThemeTab() {
  const theme = useStore((s) => s.doc.theme);
  const set = (fn: (t: Theme) => void) => commit((d) => fn(d.theme));
  return (
    <>
      <Section title="Start from a style">
        <div className="presets">
          {THEMES.map((t) => (
            <button key={t.name} type="button" className={"preset" + (t.name === theme.name ? " on" : "")} onClick={() => commit((d) => void (d.theme = cloneTheme(t)))}>
              <span className="dots">
                {["primary", "primarySoft", "surface", "text"].map((k) => (
                  <i key={k} style={{ background: t.colors[k] }} />
                ))}
              </span>
              <span style={{ fontFamily: t.fonts.heading }}>{t.name}</span>
            </button>
          ))}
        </div>
        <p className="hint">Every part uses these colours and fonts, so changing them restyles the whole design.</p>
      </Section>
      <Section title="Colours">
        <div className="tokens">
          {Object.entries(theme.colors).map(([k, v]) => (
            <label key={k} className="token">
              <input type="color" value={/^#[0-9a-f]{6}$/i.test(v) ? v : "#000000"} onChange={(e) => set((t) => void (t.colors[k] = e.target.value))} />
              <span>{COLOR_LABELS[k] ?? k}</span>
              <code>{v}</code>
            </label>
          ))}
        </div>
      </Section>
      <Section title="Fonts">
        {(["heading", "body", "mono"] as const).map((k) => (
          <div className="row" key={k}>
            <span className="row-l">{k === "heading" ? "Headings" : k === "body" ? "Body" : "Numbers"}</span>
            <div className="row-c">
              <Select value={theme.fonts[k]} options={FONT_CHOICES.map((f) => ({ v: f, label: f }))} onChange={(v) => set((t) => void (t.fonts[k] = v))} />
            </div>
          </div>
        ))}
      </Section>
      <Section title="Text styles">
        <div className="tstyles">
          <div className="th"><span>Style</span><span>Size</span><span>Weight</span><span>Line</span></div>
          {Object.entries(theme.text).map(([k, s]) => (
            <div key={k} className="tr">
              <span style={{ fontFamily: theme.fonts[s.font], fontWeight: s.weight }}>{s.label}</span>
              <Num value={s.size} min={6} max={160} onChange={(v) => set((t) => void (t.text[k].size = v))} />
              <Num value={s.weight} min={100} max={900} step={100} onChange={(v) => set((t) => void (t.text[k].weight = v))} />
              <Num value={s.lineHeight} min={0.8} max={3} step={0.05} onChange={(v) => set((t) => void (t.text[k].lineHeight = v))} />
            </div>
          ))}
        </div>
      </Section>
      <Section title="Corners">
        {(["sm", "md", "lg"] as const).map((k) => (
          <div className="row" key={k}>
            <span className="row-l">{k === "sm" ? "Small" : k === "md" ? "Medium" : "Large"}</span>
            <div className="row-c">
              <Num value={theme.radius[k]} min={0} max={64} suffix="px" onChange={(v) => set((t) => void (t.radius[k] = v))} />
            </div>
          </div>
        ))}
      </Section>
      <Section title="Canvas">
        <div className="row">
          <span className="row-l">Background</span>
          <div className="row-c">
            <input type="color" value={theme.canvas} onChange={(e) => set((t) => void (t.canvas = e.target.value))} />
          </div>
        </div>
      </Section>
    </>
  );
}
