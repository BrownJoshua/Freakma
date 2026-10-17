import { useState } from "react";
import { canRedo, canUndo, commit, getState, redo, setState, undo, useStore } from "../model/store";
import type { Tool } from "../model/store";
import { getUser } from "../model/user";
import { addFrame, deviceList, downloadDoc, newDesign, openProject, quickAdd, saveAsProject, zoomToFit } from "../model/actions";
import { frameOf } from "../model/doc";
import { Ico } from "./controls";
import { isDesktop } from "../platform";

export function Toolbar({ onExport }: { onExport: () => void }) {
  const name = useStore((s) => s.doc.name);
  const saved = useStore((s) => s.saved);
  const dir = useStore((s) => s.projectDir);
  const zoom = useStore((s) => s.view.zoom);
  useStore((s) => s.rev);
  const [menu, setMenu] = useState<"file" | "screen" | "add" | null>(null);
  const tool = useStore((s) => s.tool);
  const peers = useStore((s) => s.peers);
  const collab = useStore((s) => s.collab);
  const live = useStore((s) => s.livePreview);

  const play = () => {
    const s = getState();
    const f = s.selection[0] ? frameOf(s.doc, s.selection[0]) : null;
    const first = s.doc.pages.find((p) => p.id === s.pageId)?.frames[0];
    setState({ play: f?.id ?? first ?? null });
  };
  const zoomBy = (k: number) => {
    const s = getState();
    const st = document.querySelector(".stage") as HTMLElement;
    const cx = st.clientWidth / 2, cy = st.clientHeight / 2;
    const z = Math.min(4, Math.max(0.05, s.view.zoom * k));
    setState({ view: { zoom: z, x: cx - (cx - s.view.x) * (z / s.view.zoom), y: cy - (cy - s.view.y) * (z / s.view.zoom) } });
  };

  return (
    <header className="toolbar" onClick={() => menu && setMenu(null)}>
      <div className="brand">
        <span className="logo">F</span>
        <div className="menu-wrap">
          <button type="button" onClick={(e) => (e.stopPropagation(), setMenu(menu === "file" ? null : "file"))}>File <Ico name="chevron-down" size={12} /></button>
          {menu === "file" && (
            <div className="menu">
              <button type="button" onClick={newDesign}><Ico name="plus" />New design</button>
              <button type="button" onClick={openProject}><Ico name="folder" />{isDesktop ? "Open project…" : "Open design file…"}</button>
              <button type="button" onClick={saveAsProject}><Ico name="download" />{isDesktop ? (dir ? "Save to another folder…" : "Save as project…") : "Download design file"}</button>
              {isDesktop && <button type="button" onClick={downloadDoc}><Ico name="file" />Download a copy (.json)</button>}
              <button type="button" onClick={() => setState({ dialog: "import" })}><Ico name="upload" />Import from Figma or HTML…</button>
              <button type="button" onClick={onExport}><Ico name="share" />Export screens…</button>
              <button type="button" onClick={() => setState({ dialog: "share" })}><Ico name="users" />Work together live…</button>
            </div>
          )}
        </div>
      </div>
      <input
        key={name}
        className="docname"
        defaultValue={name}
        onBlur={(e) => e.target.value.trim() && e.target.value !== name && commit((d) => void (d.name = e.target.value.trim()))}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        aria-label="Design name"
      />
      <span className={"saved" + (saved ? "" : " busy")} title={dir ?? "Saved in this browser"}>{saved ? (dir ? "Saved to folder" : "Saved") : "Saving…"}</span>

      <div className="tb-group">
        <div className="menu-wrap">
          <button type="button" className="primary" onClick={(e) => (e.stopPropagation(), setMenu(menu === "screen" ? null : "screen"))}><Ico name="plus" />Add screen</button>
          {menu === "screen" && (
            <div className="menu">
              <small className="menu-h">Auto layout: things stack and line up for you</small>
              {deviceList.map(([k, d]) => (
                <button type="button" key={k} onClick={() => addFrame(k)}><Ico name={k === "iphone" || k === "android" ? "phone" : "grid"} />{d.label}</button>
              ))}
              <small className="menu-h">Free-form: put things exactly where you drop them</small>
              <button type="button" onClick={() => addFrame("desktop", true)}><Ico name="frame" />Desktop · free-form</button>
              <button type="button" onClick={() => addFrame("iphone", true)}><Ico name="frame" />iPhone · free-form</button>
            </div>
          )}
        </div>
        <div className="tools" role="toolbar" aria-label="Tools">
          {TOOLS.map((t, i) =>
            t === "|" ? (
              <span key={i} className="sep" />
            ) : (
              <button key={t.id} type="button" className={tool === t.id ? "on" : ""} title={`${t.label} (${t.key})`} aria-pressed={tool === t.id} onClick={() => setState({ tool: t.id, editPath: null })}>
                <Ico name={t.icon} />
              </button>
            ),
          )}
        </div>
        <div className="menu-wrap">
          <button type="button" onClick={(e) => (e.stopPropagation(), setMenu(menu === "add" ? null : "add"))} title="Quick add into the selected spot"><Ico name="plus" />Insert <Ico name="chevron-down" size={12} /></button>
          {menu === "add" && (
            <div className="menu">
              <button type="button" onClick={() => quickAdd("text")}><Ico name="edit" />Text</button>
              <button type="button" onClick={() => quickAdd("button")}><Ico name="plus" />Button (B)</button>
              <button type="button" onClick={() => quickAdd("stack")}><Ico name="list" />Vertical stack</button>
              <button type="button" onClick={() => quickAdd("row")}><Ico name="more" />Row</button>
              <button type="button" onClick={() => quickAdd("image")}><Ico name="image" />Image</button>
            </div>
          )}
        </div>
      </div>

      <div className="tb-group right">
        <button type="button" title="Undo (Ctrl+Z)" disabled={!canUndo()} onClick={undo}><Ico name="arrow-left" /></button>
        <button type="button" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo()} onClick={redo}><Ico name="arrow-right" /></button>
        <span className="sep" />
        <button type="button" title="Zoom out" onClick={() => zoomBy(1 / 1.25)}><Ico name="minus" /></button>
        <button type="button" className="zoom" title="Fit everything (Shift+1)" onClick={zoomToFit}>{Math.round(zoom * 100)}%</button>
        <button type="button" title="Zoom in" onClick={() => zoomBy(1.25)}><Ico name="plus" /></button>
        <span className="sep" />
        <button type="button" className={"people-btn" + (collab.role !== "off" ? " live" : "")} title="Work together live" onClick={() => setState({ dialog: "share" })}>
          {collab.role !== "off" ? (
            <span className="avs">
              <span className="av" style={{ background: getUser().color }}>{(getUser().name || "Y")[0].toUpperCase()}</span>
              {Object.values(peers).slice(0, 4).map((p) => (
                <span key={p.id} className="av" style={{ background: p.color }} title={p.name}>{p.name[0]?.toUpperCase()}</span>
              ))}
            </span>
          ) : (
            <Ico name="users" />
          )}
          Share
        </button>
        <button type="button" className={live ? "on" : ""} title="Live preview beside the canvas (updates as you edit)" onClick={() => setState({ livePreview: !live })}><Ico name="eye" />Preview</button>
        <button type="button" onClick={onExport}><Ico name="download" />Export</button>
        <button type="button" className="primary" onClick={play} title="Play the prototype (F5)"><Ico name="play" />Play</button>
      </div>
    </header>
  );
}

const TOOLS: ({ id: Tool; icon: string; label: string; key: string } | "|")[] = [
  { id: "select", icon: "cursor", label: "Move and select", key: "V" },
  { id: "hand", icon: "hand", label: "Hand — pan the canvas", key: "H or hold Space" },
  "|",
  { id: "frame", icon: "frame", label: "Frame — draw a free-position screen or box", key: "F" },
  { id: "rect", icon: "square", label: "Rectangle", key: "R" },
  { id: "ellipse", icon: "circle", label: "Ellipse", key: "O" },
  { id: "line", icon: "line", label: "Line", key: "L" },
  { id: "arrow", icon: "arrow-right", label: "Arrow", key: "Shift+L" },
  { id: "pen", icon: "pen", label: "Pen — click for corners, drag for curves", key: "P" },
  { id: "pencil", icon: "pencil", label: "Pencil — draw freehand", key: "Shift+P" },
  { id: "text", icon: "type", label: "Text", key: "T" },
  "|",
  { id: "comment", icon: "message", label: "Comment", key: "C" },
];
