import { useEffect, useState } from "react";
import { Toolbar } from "./ui/Toolbar";
import { LeftPanel } from "./ui/LeftPanel";
import { RightPanel } from "./ui/RightPanel";
import { Canvas } from "./ui/Canvas";
import { Play } from "./ui/Play";
import { ExportDialog } from "./ui/ExportDialog";
import { flushSave, getState, redo, select, setState, undo, useStore } from "./model/store";
import {
  copySelection, deleteSelection, duplicateSelection, initDesktop, paste, quickAdd, reorder, saveAsProject, selectParent, wrapSelection, zoomToFit, patchFn,
} from "./model/actions";
import { frameOf } from "./model/doc";

const typing = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName));
};

export function App() {
  const play = useStore((s) => s.play);
  const toastMsg = useStore((s) => s.toast);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    initDesktop();
    setTimeout(zoomToFit, 120);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e) || getState().play) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const s = getState();
      if (mod && k === "z") return e.preventDefault(), e.shiftKey ? redo() : undo();
      if (mod && k === "y") return e.preventDefault(), redo();
      if (mod && k === "s") return e.preventDefault(), s.projectDir ? flushSave() : saveAsProject();
      if (mod && k === "d") return e.preventDefault(), duplicateSelection();
      if (mod && k === "c") return copySelection();
      if (mod && k === "v") return paste();
      if (mod && k === "g") return e.preventDefault(), wrapSelection(e.shiftKey ? "row" : "column");
      if (mod && k === "e") return e.preventDefault(), setExporting(true);
      if (mod && k === "a") {
        e.preventDefault();
        const id = s.selection[0];
        const f = id ? frameOf(s.doc, id) : null;
        const p = f ? s.doc.nodes[f.id] : null;
        if (p) select(p.children);
        return;
      }
      if (k === "delete" || k === "backspace") return e.preventDefault(), deleteSelection();
      if (k === "escape") return s.selection.length ? selectParent() : undefined;
      if (k === "enter") {
        const n = s.selection[0] ? s.doc.nodes[s.selection[0]] : null;
        if (n?.type === "text") return e.preventDefault(), setState({ editingText: n.id });
        if (n?.children.length) return e.preventDefault(), select([n.children[0]]);
        return;
      }
      if (e.altKey && (k === "arrowup" || k === "arrowleft")) return e.preventDefault(), reorder(-1);
      if (e.altKey && (k === "arrowdown" || k === "arrowright")) return e.preventDefault(), reorder(1);
      if (k.startsWith("arrow")) {
        const ids = s.selection.filter((id) => s.doc.nodes[id]?.type === "frame");
        if (!ids.length) return;
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        return patchFn(ids, (n) => {
          if (k === "arrowleft") n.x = (n.x ?? 0) - d;
          if (k === "arrowright") n.x = (n.x ?? 0) + d;
          if (k === "arrowup") n.y = (n.y ?? 0) - d;
          if (k === "arrowdown") n.y = (n.y ?? 0) + d;
        });
      }
      if (mod) return;
      if (k === "t") return quickAdd("text");
      if (k === "b") return quickAdd("button");
      if (k === "p") {
        const f = s.selection[0] ? frameOf(s.doc, s.selection[0]) : null;
        return setState({ play: f?.id ?? s.doc.pages.find((p) => p.id === s.pageId)?.frames[0] ?? null });
      }
      if (e.shiftKey && k === "!") return zoomToFit();
      if (e.shiftKey && e.code === "Digit1") return zoomToFit();
    };
    addEventListener("keydown", onKey);
    const beforeUnload = () => void flushSave();
    addEventListener("beforeunload", beforeUnload);
    return () => {
      removeEventListener("keydown", onKey);
      removeEventListener("beforeunload", beforeUnload);
    };
  }, []);

  return (
    <div className="app">
      <Toolbar onExport={() => setExporting(true)} />
      <div className="main">
        <LeftPanel />
        <Canvas />
        <RightPanel />
      </div>
      {play && <Play />}
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </div>
  );
}
