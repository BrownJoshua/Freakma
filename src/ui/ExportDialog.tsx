import { useState } from "react";
import { toPng, toSvg } from "html-to-image";
import { getState, toast, useStore } from "../model/store";
import { frameOf } from "../model/doc";
import { fileSlug, frameToHTML, frameToReact, frameToSpec } from "../export/code";
import { downloadDoc, downloadText } from "../model/actions";
import { bridge } from "../platform";
import { Ico } from "./controls";

async function save(name: string, data: string, base64 = false, mime = "text/plain") {
  const dir = getState().projectDir;
  if (bridge && dir) {
    const p = await bridge.writeExport(dir, name, data, base64);
    toast(`Saved ${p}`);
    return;
  }
  if (base64) {
    const a = document.createElement("a");
    a.href = `data:${mime};base64,${data}`;
    a.download = name;
    a.click();
  } else downloadText(name, data, mime);
}

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const doc = useStore((s) => s.doc);
  const frames = doc.pages.flatMap((p) => p.frames).map((id) => doc.nodes[id]).filter(Boolean);
  const s = getState();
  const pre = s.selection[0] ? frameOf(s.doc, s.selection[0])?.id : undefined;
  const [fid, setFid] = useState(pre ?? frames[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const f = doc.nodes[fid];

  const image = async (kind: "png" | "svg") => {
    const el = document.querySelector(`.stage [data-node-id="${fid}"]`) as HTMLElement | null;
    if (!el) return toast("Open the page that holds this screen first");
    setBusy(true);
    try {
      if (kind === "png") {
        const url = await toPng(el, { pixelRatio: 2, cacheBust: true });
        await save(`${fileSlug(f.name)}.png`, url.split(",")[1], true, "image/png");
      } else {
        const url = await toSvg(el, { cacheBust: true });
        await save(`${fileSlug(f.name)}.svg`, decodeURIComponent(url.split(",")[1]), false, "image/svg+xml");
      }
    } catch (e) {
      toast("Image export failed: " + String((e as Error).message ?? e));
    }
    setBusy(false);
  };

  const all = async () => {
    for (const fr of frames) await save(`${fileSlug(fr.name)}.html`, frameToHTML(doc, fr.id), false, "text/html");
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Export" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Export</h2>
          <button type="button" className="x" onClick={onClose} aria-label="Close"><Ico name="close" /></button>
        </header>
        {frames.length === 0 ? (
          <p>Add a screen first.</p>
        ) : (
          <>
            <label className="field">
              Screen
              <select value={fid} onChange={(e) => setFid(e.target.value)}>
                {frames.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
            <div className="exp-grid">
              <button type="button" disabled={busy} onClick={() => image("png")}><Ico name="image" /><b>PNG image</b><span>2× resolution, for sharing</span></button>
              <button type="button" disabled={busy} onClick={() => image("svg")}><Ico name="image" /><b>SVG</b><span>Vector, for print or slides</span></button>
              <button type="button" onClick={() => save(`${fileSlug(f.name)}.html`, frameToHTML(doc, fid), false, "text/html")}><Ico name="globe" /><b>HTML page</b><span>One file, opens in any browser</span></button>
              <button type="button" onClick={() => save(`${fileSlug(f.name)}.jsx`, frameToReact(doc, fid))}><Ico name="file" /><b>React component</b><span>JSX with inline styles</span></button>
              <button type="button" onClick={() => save(`${fileSlug(f.name)}-spec.md`, `# ${f.name}\n\n${frameToSpec(doc, fid)}\n`)}><Ico name="list" /><b>Spec for AI / developers</b><span>Plain-language structure</span></button>
              <button type="button" onClick={all}><Ico name="folder" /><b>All screens as HTML</b><span>Linked together like the prototype</span></button>
              <button type="button" onClick={downloadDoc}><Ico name="download" /><b>Design file</b><span>.freakma.json, opens in Freakma</span></button>
            </div>
            <p className="hint">{bridge && s.projectDir ? `Files are saved to ${s.projectDir}\\exports` : "Files download through your browser."}</p>
          </>
        )}
      </div>
    </div>
  );
}
