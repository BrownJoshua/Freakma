import { useEffect, useRef, useState } from "react";
import { commit, flushSave, getState, setState, toast, useStore } from "../model/store";
import type { Layout, Node, Theme } from "../model/types";
import { DEVICES, defaultLayout, frameOf, parentOf } from "../model/doc";
import { textSpec, FONT_CHOICES } from "../model/theme";
import { ICON_NAMES } from "../render/icons";
import {
  deleteSelection, detachComponent, duplicateSelection, makeComponent, patch, patchFn, reloadFromDisk, saveAsProject, selectParent, syncComponent, wrapSelection,
} from "../model/actions";
import { ColorPick, Ico, Num, Row, Section, Seg, Select, Text } from "./controls";
import { bridge } from "../platform";
import type { ClaudeEvent } from "../platform";

export function RightPanel() {
  const tab = useStore((s) => s.rightTab);
  return (
    <aside className="panel right">
      <div className="tabs">
        {(["design", "prototype", "claude"] as const).map((t) => (
          <button key={t} type="button" className={tab === t ? "on" : ""} onClick={() => setState({ rightTab: t })}>
            {t === "design" ? "Design" : t === "prototype" ? "Prototype" : "✦ Claude"}
          </button>
        ))}
      </div>
      <div className="panel-body">{tab === "design" ? <Inspector /> : tab === "prototype" ? <PrototypeTab /> : <ClaudeTab />}</div>
    </aside>
  );
}

/* ================= Design inspector ================= */

function Inspector() {
  const doc = useStore((s) => s.doc);
  const selection = useStore((s) => s.selection);
  const nodes = selection.map((id) => doc.nodes[id]).filter(Boolean) as Node[];
  if (!nodes.length) return <Nothing />;
  const n = nodes[0];
  const ids = nodes.map((x) => x.id);
  const t = doc.theme;
  const parent = parentOf(doc, n.id);
  const isTop = n.type === "frame";

  return (
    <div>
      <div className="insp-head">
        <input key={n.id} className="name" defaultValue={n.name} onBlur={(e) => e.target.value.trim() && e.target.value !== n.name && patch([n.id], { name: e.target.value.trim() })} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} aria-label="Layer name" />
        <span className="kind">{nodes.length > 1 ? `${nodes.length} selected` : n.component ? "Component" : n.type === "box" ? "Container" : n.type === "frame" ? "Screen" : n.type}</span>
      </div>
      <div className="actions">
        <button type="button" onClick={duplicateSelection} title="Duplicate (Ctrl+D)"><Ico name="plus" />Duplicate</button>
        <button type="button" onClick={() => wrapSelection("column")} title="Wrap in a stack (Ctrl+G)" disabled={isTop}><Ico name="list" />Group</button>
        <button type="button" onClick={selectParent} disabled={!parent} title="Select parent (Esc)"><Ico name="arrow-left" />Parent</button>
        <button type="button" className="danger" onClick={deleteSelection} title="Delete (Del)"><Ico name="trash" />Delete</button>
      </div>

      {isTop && (
        <Section title="Screen">
          <Row label="Device">
            <Select value={n.device ?? "desktop"} options={Object.entries(DEVICES).map(([k, d]) => ({ v: k, label: d.label }))} onChange={(v) => patchFn(ids, (x) => { const d = DEVICES[v]; x.device = v; x.w = d.w; x.h = d.h; x.hMode = d.hMode; })} />
          </Row>
          <Row label="Position">
            <Num value={n.x} onChange={(v) => patch(ids, { x: v })} suffix="X" />
            <Num value={n.y} onChange={(v) => patch(ids, { y: v })} suffix="Y" />
          </Row>
        </Section>
      )}

      <SizeSection n={n} ids={ids} isTop={isTop} />
      {n.layout && <LayoutSection n={n} ids={ids} />}
      {!n.layout && (n.type === "box" || n.type === "frame") && (
        <Section title="Auto layout">
          <button type="button" className="wide" onClick={() => patch(ids, { layout: defaultLayout("column", 12, 0) })}>Turn on auto layout</button>
        </Section>
      )}
      {n.type === "text" && <TextSection n={n} ids={ids} t={t} />}
      {n.type === "icon" && <IconSection n={n} ids={ids} t={t} />}
      {n.type === "image" && <ImageSection n={n} ids={ids} />}
      {n.type !== "text" && n.type !== "icon" && <FillSection n={n} ids={ids} t={t} />}
      <EffectsSection n={n} ids={ids} t={t} />

      {!isTop && (
        <Section title="Component">
          {n.component ? (
            <>
              <p className="hint">This is a copy of a saved component. Change it, then push the change to every copy.</p>
              <button type="button" className="wide" onClick={() => syncComponent(n.id)}>Update all copies from this one</button>
              <button type="button" className="wide ghost" onClick={() => detachComponent(n.id)}>Detach from component</button>
            </>
          ) : (
            <>
              <p className="hint">Save this as a reusable part. It appears at the top of Parts.</p>
              <button type="button" className="wide" onClick={makeComponent}>Create component</button>
            </>
          )}
        </Section>
      )}
    </div>
  );
}

function Nothing() {
  return (
    <div className="nothing">
      <h3>Nothing selected</h3>
      <p>Click anything on a screen to change it here.</p>
      <ul>
        <li><b>Drag</b> parts from the left onto a screen</li>
        <li><b>Click</b> once to pick a part, again to go inside it</li>
        <li><b>Double-click</b> text to type</li>
        <li><b>Drag</b> a selected item to move it; it snaps into the layout</li>
        <li><b>Space + drag</b> or empty-area drag to pan, <b>Ctrl + scroll</b> to zoom</li>
      </ul>
      <h3>Shortcuts</h3>
      <ul className="keys">
        <li><kbd>Ctrl Z</kbd> undo · <kbd>Ctrl Shift Z</kbd> redo</li>
        <li><kbd>Ctrl D</kbd> duplicate · <kbd>Del</kbd> delete</li>
        <li><kbd>Ctrl C</kbd> / <kbd>Ctrl V</kbd> copy, paste</li>
        <li><kbd>Ctrl G</kbd> group into a stack</li>
        <li><kbd>Alt ↑ ↓</kbd> move earlier or later</li>
        <li><kbd>Esc</kbd> select parent · <kbd>Enter</kbd> select inside</li>
        <li><kbd>T</kbd> add text · <kbd>B</kbd> add button · <kbd>P</kbd> play</li>
      </ul>
    </div>
  );
}

function SizeSection({ n, ids, isTop }: { n: Node; ids: string[]; isTop: boolean }) {
  const modes = (axis: "w" | "h") => [
    { v: "fixed" as const, label: "Fixed", title: "Exact size in pixels" },
    { v: "fill" as const, label: "Fill", title: "Stretch to the space available" },
    { v: "hug" as const, label: "Hug", title: "Shrink to fit the content" },
  ].filter((o) => !(isTop && axis === "w" && o.v !== "fixed") && !(isTop && o.v === "fill"));
  return (
    <Section title="Size">
      <Row label="Width">
        {n.type !== "icon" && <Seg value={n.wMode} options={modes("w")} onChange={(v) => patch(ids, { wMode: v })} />}
        <Num value={n.w} min={1} onChange={(v) => patchFn(ids, (x) => { x.w = v; x.wMode = "fixed"; if (x.type === "icon") x.h = v; })} width={64} />
      </Row>
      {n.type !== "icon" && (
        <Row label="Height">
          <Seg value={n.hMode} options={modes("h")} onChange={(v) => patch(ids, { hMode: v })} />
          <Num value={n.h} min={1} onChange={(v) => patch(ids, { h: v, hMode: "fixed" })} width={64} />
        </Row>
      )}
    </Section>
  );
}

function LayoutSection({ n, ids }: { n: Node; ids: string[] }) {
  const L = n.layout!;
  const set = (p: Partial<Layout>) => patchFn(ids, (x) => void (x.layout = { ...(x.layout ?? L), ...p }));
  const same = L.padding.every((v) => v === L.padding[0]);
  const [split, setSplit] = useState(!same);
  return (
    <Section title="Auto layout" right={<button type="button" className="mini" onClick={() => patch(ids, { layout: undefined })} title="Turn off">Off</button>}>
      <Row label="Direction">
        <Seg value={L.mode} options={[{ v: "column", icon: "arrow-right", title: "Stack vertically", label: "Down" }, { v: "row", icon: "arrow-right", title: "Side by side", label: "Across" }, { v: "grid", icon: "grid", title: "Grid", label: "Grid" }]} onChange={(v) => set({ mode: v })} />
      </Row>
      {L.mode === "grid" && (
        <Row label="Columns">
          <Num value={L.columns} min={1} max={12} onChange={(v) => set({ columns: v })} />
        </Row>
      )}
      <Row label="Gap">
        <Num value={L.gap} min={0} onChange={(v) => set({ gap: v })} suffix="px" />
        <div className="chips">{[0, 8, 16, 24, 32].map((g) => <button type="button" key={g} className={L.gap === g ? "on" : ""} onClick={() => set({ gap: g })}>{g}</button>)}</div>
      </Row>
      <Row label="Padding">
        {split ? (
          <div className="pad4">
            {(["Top", "Right", "Bottom", "Left"] as const).map((lab, i) => (
              <Num key={lab} value={L.padding[i]} min={0} onChange={(v) => { const p = [...L.padding] as Layout["padding"]; p[i] = v; set({ padding: p }); }} suffix={lab[0]} />
            ))}
          </div>
        ) : (
          <>
            <Num value={L.padding[0]} min={0} onChange={(v) => set({ padding: [v, v, v, v] })} suffix="px" />
            <div className="chips">{[0, 16, 24, 32].map((g) => <button type="button" key={g} className={same && L.padding[0] === g ? "on" : ""} onClick={() => set({ padding: [g, g, g, g] })}>{g}</button>)}</div>
          </>
        )}
        <button type="button" className="mini" onClick={() => setSplit(!split)} title="Set each side">{split ? "All" : "Sides"}</button>
      </Row>
      <Row label={L.mode === "row" ? "Vertical" : "Horizontal"}>
        <Seg value={L.align} options={[{ v: "start", label: L.mode === "row" ? "Top" : "Left" }, { v: "center", label: "Center" }, { v: "end", label: L.mode === "row" ? "Bottom" : "Right" }]} onChange={(v) => set({ align: v })} />
      </Row>
      {L.mode !== "grid" && (
        <Row label={L.mode === "row" ? "Horizontal" : "Vertical"}>
          <Seg value={L.justify} options={[{ v: "start", label: "Start" }, { v: "center", label: "Center" }, { v: "end", label: "End" }, { v: "between", label: "Spread" }]} onChange={(v) => set({ justify: v })} />
        </Row>
      )}
      {L.mode === "row" && (
        <Row label="Wrap">
          <Seg value={L.wrap ? "y" : "n"} options={[{ v: "n", label: "One line" }, { v: "y", label: "Wrap" }]} onChange={(v) => set({ wrap: v === "y" })} />
        </Row>
      )}
    </Section>
  );
}

function TextSection({ n, ids, t }: { n: Node; ids: string[]; t: Theme }) {
  const spec = textSpec(t, n);
  return (
    <Section title="Text">
      <Text value={n.text} multiline onChange={(v) => patch(ids, { text: v })} />
      <Row label="Style">
        <Select value={n.textStyle ?? "body"} options={Object.entries(t.text).map(([k, s]) => ({ v: k, label: `${s.label} · ${s.size}` }))} onChange={(v) => patchFn(ids, (x) => { x.textStyle = v; delete x.fontSize; delete x.fontWeight; delete x.lineHeight; delete x.fontFamily; })} />
      </Row>
      <Row label="Font">
        <Select value={n.fontFamily ?? ""} options={[{ v: "", label: `Theme (${spec.family})` }, ...FONT_CHOICES.map((f) => ({ v: f, label: f }))]} onChange={(v) => patchFn(ids, (x) => { if (v) x.fontFamily = v; else delete x.fontFamily; })} />
      </Row>
      <Row label="Size · weight">
        <Num value={spec.size} min={6} max={200} onChange={(v) => patch(ids, { fontSize: v })} suffix="px" />
        <Select value={String(spec.weight)} options={[300, 400, 500, 600, 700, 800].map((w) => ({ v: String(w), label: ({ 300: "Light", 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold", 800: "Extra bold" } as Record<number, string>)[w] }))} onChange={(v) => patch(ids, { fontWeight: Number(v) })} />
      </Row>
      <Row label="Line height">
        <Num value={spec.lineHeight} min={0.8} max={3} step={0.05} onChange={(v) => patch(ids, { lineHeight: v })} />
      </Row>
      <Row label="Align">
        <Seg value={n.textAlign ?? "left"} options={[{ v: "left", label: "Left" }, { v: "center", label: "Center" }, { v: "right", label: "Right" }]} onChange={(v) => patch(ids, { textAlign: v })} />
      </Row>
      <Row label="Style">
        <div className="chips">
          <button type="button" className={n.fontWeight && n.fontWeight >= 600 ? "on" : ""} onClick={() => patch(ids, { fontWeight: spec.weight >= 600 ? 400 : 700 })}><b>B</b></button>
          <button type="button" className={n.italic ? "on" : ""} onClick={() => patch(ids, { italic: !n.italic })}><i>I</i></button>
          <button type="button" className={n.underline ? "on" : ""} onClick={() => patch(ids, { underline: !n.underline })}><u>U</u></button>
          <button type="button" className={spec.uppercase ? "on" : ""} onClick={() => patch(ids, { uppercase: !spec.uppercase })}>AA</button>
        </div>
      </Row>
      <div className="sub">Colour</div>
      <ColorPick value={n.color ?? "$text"} theme={t} allowNone={false} onChange={(v) => patch(ids, { color: v })} />
    </Section>
  );
}

function IconSection({ n, ids, t }: { n: Node; ids: string[]; t: Theme }) {
  const [q, setQ] = useState("");
  return (
    <Section title="Icon">
      <input className="txt" placeholder="Search icons" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="icons">
        {ICON_NAMES.filter((k) => k.includes(q.toLowerCase())).map((k) => (
          <button key={k} type="button" title={k} className={n.icon === k ? "on" : ""} onClick={() => patch(ids, { icon: k, name: `Icon · ${k}` })}>
            <Ico name={k} size={18} />
          </button>
        ))}
      </div>
      <div className="sub">Colour</div>
      <ColorPick value={n.color ?? "$text"} theme={t} allowNone={false} onChange={(v) => patch(ids, { color: v })} />
    </Section>
  );
}

function ImageSection({ n, ids }: { n: Node; ids: string[] }) {
  const file = useRef<HTMLInputElement>(null);
  return (
    <Section title="Image">
      <input
        ref={file}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const r = new FileReader();
          r.onload = () => patch(ids, { src: String(r.result), name: f.name.replace(/\.[^.]+$/, "") });
          r.readAsDataURL(f);
        }}
      />
      <button type="button" className="wide" onClick={() => file.current?.click()}><Ico name="upload" />{n.src ? "Replace image" : "Upload image"}</button>
      <Row label="Or URL"><Text value={n.src?.startsWith("data:") ? "" : n.src} placeholder="https://…" onChange={(v) => patch(ids, { src: v || undefined })} /></Row>
      <Row label="Fit">
        <Seg value={n.fit ?? "cover"} options={[{ v: "cover", label: "Fill & crop" }, { v: "contain", label: "Fit whole" }]} onChange={(v) => patch(ids, { fit: v })} />
      </Row>
      <p className="hint">You can also drag image files from your computer straight onto a screen.</p>
    </Section>
  );
}

function FillSection({ n, ids, t }: { n: Node; ids: string[]; t: Theme }) {
  return (
    <Section title="Fill">
      <ColorPick value={n.fill} theme={t} onChange={(v) => patch(ids, { fill: v })} />
    </Section>
  );
}

function EffectsSection({ n, ids, t }: { n: Node; ids: string[]; t: Theme }) {
  const r = n.radius;
  return (
    <Section title="Border & effects">
      <Row label="Corners">
        <Seg value={typeof r === "number" ? undefined : r ?? "none"} options={[{ v: "none", label: "0" }, { v: "sm", label: "S" }, { v: "md", label: "M" }, { v: "lg", label: "L" }, { v: "full", label: "Pill" }]} onChange={(v) => patch(ids, { radius: v })} />
        <Num value={typeof r === "number" ? r : undefined} min={0} onChange={(v) => patch(ids, { radius: v })} width={52} />
      </Row>
      <Row label="Shadow">
        <Seg value={n.shadow ?? "none"} options={[{ v: "none", label: "None" }, { v: "sm", label: "S" }, { v: "md", label: "M" }, { v: "lg", label: "L" }]} onChange={(v) => patch(ids, { shadow: v })} />
      </Row>
      <Row label="Opacity">
        <input type="range" min={0} max={1} step={0.05} value={n.opacity ?? 1} onChange={(e) => patch(ids, { opacity: Number(e.target.value) })} />
        <span className="val">{Math.round((n.opacity ?? 1) * 100)}%</span>
      </Row>
      {n.type !== "text" && n.type !== "icon" && (
        <>
          <Row label="Border">
            <Num value={n.stroke ? n.strokeWidth ?? 1 : 0} min={0} max={20} onChange={(v) => patchFn(ids, (x) => { x.strokeWidth = v; if (v > 0 && !x.stroke) x.stroke = "$border"; if (v === 0) delete x.stroke; })} suffix="px" />
          </Row>
          {n.stroke && <ColorPick value={n.stroke} theme={t} allowNone={false} onChange={(v) => patch(ids, { stroke: v })} />}
          <Row label="Clip content">
            <Seg value={n.clip ? "y" : "n"} options={[{ v: "n", label: "No" }, { v: "y", label: "Yes" }]} onChange={(v) => patch(ids, { clip: v === "y" })} />
          </Row>
        </>
      )}
    </Section>
  );
}

/* ================= Prototype ================= */

function PrototypeTab() {
  const doc = useStore((s) => s.doc);
  const selection = useStore((s) => s.selection);
  const n = selection[0] ? doc.nodes[selection[0]] : undefined;
  const frames = doc.pages.flatMap((p) => p.frames).map((id) => doc.nodes[id]).filter(Boolean);
  const links = Object.values(doc.nodes).filter((x) => x.link);
  const start = n ? frameOf(doc, n.id)?.id : frames[0]?.id;
  return (
    <div>
      <Section title="On click">
        {n && n.type !== "frame" ? (
          <>
            <p className="hint">When someone clicks “{n.name}” in Play mode, go to:</p>
            <Select value={n.link ?? ""} options={[{ v: "", label: "Nothing" }, ...frames.filter((f) => f.id !== frameOf(doc, n.id)?.id).map((f) => ({ v: f.id, label: f.name }))]} onChange={(v) => patchFn([n.id], (x) => { if (v) x.link = v; else delete x.link; })} />
          </>
        ) : (
          <p className="hint">Select a button or any element inside a screen, then choose which screen it opens.</p>
        )}
      </Section>
      <Section title="Play">
        <button type="button" className="wide primary" disabled={!start} onClick={() => setState({ play: start ?? null })}><Ico name="play" />Play from {start ? doc.nodes[start].name : "first screen"}</button>
        <p className="hint">Clickable elements are highlighted while you play. Press Esc to stop.</p>
      </Section>
      <Section title={`Links · ${links.length}`}>
        {links.length ? (
          <ul className="links">
            {links.map((l) => (
              <li key={l.id}>
                <button type="button" onClick={() => setState({ selection: [l.id] })}>{l.name}</button>
                <Ico name="arrow-right" size={12} />
                <span>{doc.nodes[l.link!]?.name ?? "missing"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">No links yet.</p>
        )}
      </Section>
    </div>
  );
}

/* ================= Claude ================= */

const SUGGESTIONS = [
  "Create a login screen for web and a matching mobile version",
  "Fill the selected table with realistic Indian GST invoice data",
  "Make a mobile version of the selected screen",
  "Tidy the spacing on this screen so everything lines up",
  "Switch the theme to a dark style",
  "Add an empty state and an error state for this screen",
];

interface LogLine { kind: ClaudeEvent["kind"]; text: string }

function ClaudeTab() {
  const dir = useStore((s) => s.projectDir);
  const selection = useStore((s) => s.selection);
  const [prompt, setPrompt] = useState("");
  const [cont, setCont] = useState(true);
  const [useSel, setUseSel] = useState(true);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [check, setCheck] = useState<{ ok: boolean; version?: string; error?: string } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bridge) return;
    bridge.claudeCheck().then(setCheck);
    return bridge.onClaude((e) => {
      if (e.kind === "done" || e.kind === "error") {
        setBusy(false);
        if (e.kind === "done") reloadFromDisk().then(() => toast("Claude finished — Ctrl+Z undoes its changes"));
      }
      setLog((l) => [...l, { kind: e.kind, text: e.kind === "done" ? `Done${e.cost ? ` · $${e.cost.toFixed(3)}` : ""}${e.text ? ` — ${e.text}` : ""}` : e.text ?? "" }].slice(-200));
    });
  }, []);
  useEffect(() => logRef.current?.scrollTo(0, 1e9), [log]);

  if (!bridge) {
    return (
      <div className="nothing">
        <h3>Claude works in the desktop app</h3>
        <p>Run Freakma as a desktop app (<code>npm run app</code>, or the Windows installer) to connect Claude Code. It edits your design file directly and you see the changes live.</p>
      </div>
    );
  }
  if (check && !check.ok) {
    return (
      <div className="nothing">
        <h3>Claude Code not found</h3>
        <p>Install Claude Code, then open a terminal and run <code>claude</code> once to sign in. Restart Freakma afterwards.</p>
        <p className="hint">{check.error}</p>
        <button type="button" className="wide" onClick={() => bridge!.claudeCheck().then(setCheck)}>Check again</button>
      </div>
    );
  }
  if (!dir) {
    return (
      <div className="nothing">
        <h3>Save the design to a folder first</h3>
        <p>Claude Code works on files. Pick a folder; Freakma saves <code>design.freakma.json</code> and a <code>CLAUDE.md</code> guide there and keeps them up to date.</p>
        <button type="button" className="wide primary" onClick={saveAsProject}><Ico name="folder" />Choose project folder</button>
      </div>
    );
  }

  const run = async (text: string) => {
    if (!text.trim() || busy) return;
    const s = getState();
    let context = "";
    if (useSel && s.selection.length) {
      const frame = frameOf(s.doc, s.selection[0]);
      context = `\n\nContext: the designer has selected node id(s) ${s.selection.map((id) => `"${id}" (${s.doc.nodes[id]?.name})`).join(", ")}${frame ? ` in the screen "${frame.name}" (id "${frame.id}")` : ""}. "This" or "selected" refers to that.`;
    }
    setBusy(true);
    setLog((l) => [...l, { kind: "start", text }]);
    await flushSave();
    try {
      await bridge!.claudeRun(dir, `${text}${context}\n\nEdit design.freakma.json in this folder. Read CLAUDE.md first for the file format.`, { continue: cont });
    } catch (e) {
      setBusy(false);
      setLog((l) => [...l, { kind: "error", text: String((e as Error).message ?? e) }]);
    }
    setPrompt("");
  };

  return (
    <div className="claude">
      <p className="hint">Connected to Claude Code{check?.version ? ` ${check.version}` : ""} · project: <code>{dir}</code></p>
      <div className="log" ref={logRef}>
        {log.length === 0 && <p className="hint">Ask for a screen, a change, or a whole flow. Claude edits the design file and the canvas updates when it's done.</p>}
        {log.map((l, i) => (
          <div key={i} className={"ll " + l.kind}>{l.kind === "tool" ? <Ico name="wrench" size={12} /> : null}{l.text}</div>
        ))}
        {busy && <div className="ll busy">Claude is working…</div>}
      </div>
      <textarea
        className="prompt"
        rows={4}
        placeholder="e.g. Make a purchase order approval screen for mobile"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) run(prompt);
          e.stopPropagation();
        }}
      />
      <label className="opt"><input type="checkbox" checked={useSel} onChange={(e) => setUseSel(e.target.checked)} />About the selection{selection.length ? ` (${selection.length})` : ""}</label>
      <label className="opt"><input type="checkbox" checked={cont} onChange={(e) => setCont(e.target.checked)} />Continue the same conversation</label>
      <div className="btns">
        {busy ? (
          <button type="button" className="wide" onClick={() => bridge!.claudeStop()}>Stop</button>
        ) : (
          <button type="button" className="wide primary" disabled={!prompt.trim()} onClick={() => run(prompt)}>Ask Claude <kbd>Ctrl ↵</kbd></button>
        )}
      </div>
      <div className="sugg">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" onClick={() => setPrompt(s)}>{s}</button>
        ))}
      </div>
    </div>
  );
}
