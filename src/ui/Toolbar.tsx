import { useState } from "react";
import { canRedo, canUndo, commit, getState, redo, setState, undo, useStore } from "../model/store";
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
  const [menu, setMenu] = useState<"file" | "screen" | null>(null);

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
              <button type="button" onClick={onExport}><Ico name="share" />Export screens…</button>
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
              {deviceList.map(([k, d]) => (
                <button type="button" key={k} onClick={() => addFrame(k)}><Ico name={k === "iphone" || k === "android" ? "phone" : "grid"} />{d.label}</button>
              ))}
            </div>
          )}
        </div>
        <button type="button" title="Add text (T)" onClick={() => quickAdd("text")}><Ico name="edit" />Text</button>
        <button type="button" title="Add button (B)" onClick={() => quickAdd("button")}><Ico name="plus" />Button</button>
        <button type="button" title="Add vertical stack" onClick={() => quickAdd("stack")}><Ico name="list" />Stack</button>
        <button type="button" title="Add row" onClick={() => quickAdd("row")}><Ico name="more" />Row</button>
        <button type="button" title="Add image" onClick={() => quickAdd("image")}><Ico name="image" />Image</button>
      </div>

      <div className="tb-group right">
        <button type="button" title="Undo (Ctrl+Z)" disabled={!canUndo()} onClick={undo}><Ico name="arrow-left" /></button>
        <button type="button" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo()} onClick={redo}><Ico name="arrow-right" /></button>
        <span className="sep" />
        <button type="button" title="Zoom out" onClick={() => zoomBy(1 / 1.25)}><Ico name="minus" /></button>
        <button type="button" className="zoom" title="Fit everything (Shift+1)" onClick={zoomToFit}>{Math.round(zoom * 100)}%</button>
        <button type="button" title="Zoom in" onClick={() => zoomBy(1.25)}><Ico name="plus" /></button>
        <span className="sep" />
        <button type="button" onClick={onExport}><Ico name="download" />Export</button>
        <button type="button" className="primary" onClick={play}><Ico name="play" />Play</button>
      </div>
    </header>
  );
}
