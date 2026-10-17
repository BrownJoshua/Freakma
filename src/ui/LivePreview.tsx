/* Live preview: the screen you are working on, rendered like the finished thing and updated
 * on every edit. Docked beside the canvas, or popped out into its own window (for a second
 * monitor). Links are clickable, so the prototype can be tried while designing; clicking
 * anything else selects it in the editor. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { NodeView } from "../render/NodeView";
import { getState, select, setState, subscribe, useStore } from "../model/store";
import { frameOf, pathTo } from "../model/doc";
import type { Doc } from "../model/types";
import { bridge } from "../platform";
import { Ico } from "./controls";

type Zoom = "fit" | 0.5 | 1;

/** the screen the editor is on: the selection's screen, else the first on the page */
function editorFrame(doc: Doc, selection: string[], pageId: string) {
  const f = selection[0] ? frameOf(doc, selection[0]) : null;
  return f?.id ?? doc.pages.find((p) => p.id === pageId)?.frames[0] ?? doc.pages[0]?.frames[0] ?? null;
}

export function PreviewView({ popped, onSelect }: { popped?: boolean; onSelect: (id: string) => void }) {
  const doc = useStore((s) => s.doc);
  const selection = useStore((s) => s.selection);
  const pageId = useStore((s) => s.pageId);
  const target = editorFrame(doc, selection, pageId);
  const [follow, setFollow] = useState(true);
  const [cur, setCur] = useState<string | null>(target);
  const [history, setHistory] = useState<string[]>([]);
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [device, setDevice] = useState(true);
  const [boxW, setBoxW] = useState(400);
  const boxRef = useRef<HTMLDivElement>(null);

  // follow the editor: when you pick another screen there, the preview switches to it
  useEffect(() => {
    if (follow && target) setCur(target);
  }, [follow, target]);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    setBoxW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const frames = useMemo(() => doc.pages.flatMap((p) => p.frames).map((id) => doc.nodes[id]).filter(Boolean), [doc]);
  const f = cur ? doc.nodes[cur] : undefined;
  const linked = useMemo(() => Object.values(doc.nodes).filter((n) => n.link).map((n) => n.id), [doc]);

  if (!f) {
    return (
      <div className="lp">
        <div className="lp-empty">
          <Ico name="eye" size={26} />
          <p>Add a screen and it shows up here, live.</p>
        </div>
      </div>
    );
  }

  const phone = f.w < 800;
  const bezel = device ? (phone ? 24 : 0) : 0;
  const scale = zoom === "fit" ? Math.min(1, (boxW - 32 - bezel) / f.w) : zoom;
  const go = (id: string) => {
    setHistory((h) => [...h, f.id]);
    setCur(id);
    setFollow(false);
  };
  const back = () => {
    const h = [...history];
    const p = h.pop();
    setHistory(h);
    if (p) setCur(p);
  };

  return (
    <div className={"lp" + (popped ? " popped" : "")}>
      <div className="lp-bar">
        <button type="button" className="ib" onClick={back} disabled={!history.length} title="Back"><Ico name="arrow-left" size={14} /></button>
        <select
          value={f.id}
          onChange={(e) => {
            setCur(e.target.value);
            setFollow(false);
          }}
          aria-label="Screen"
        >
          {frames.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <button type="button" className={"ib" + (follow ? " on" : "")} onClick={() => setFollow(!follow)} title={follow ? "Following the editor: picking a screen there shows it here" : "Follow the screen you're editing"}>
          <Ico name="link" size={14} />
        </button>
        <select value={String(zoom)} onChange={(e) => setZoom(e.target.value === "fit" ? "fit" : (Number(e.target.value) as Zoom))} aria-label="Zoom" className="lp-zoom">
          <option value="fit">Fit</option>
          <option value="0.5">50%</option>
          <option value="1">100%</option>
        </select>
        <button type="button" className={"ib" + (device ? " on" : "")} onClick={() => setDevice(!device)} title="Show the device frame"><Ico name={phone ? "phone" : "globe"} size={14} /></button>
        {!popped && (
          <>
            <button type="button" className="ib" onClick={popOut} title="Open in its own window (for a second screen)"><Ico name="share" size={14} /></button>
            <button type="button" className="ib" onClick={() => setState({ livePreview: false })} title="Close the live preview"><Ico name="close" size={14} /></button>
          </>
        )}
      </div>
      <div
        className="lp-stage"
        ref={boxRef}
        onClick={(e) => {
          const t = (e.target as HTMLElement).closest("[data-node-id]") as HTMLElement | null;
          if (!t) return;
          const path = pathTo(doc, t.dataset.nodeId!).reverse();
          const hit = path.map((id) => doc.nodes[id]).find((n) => n?.link && doc.nodes[n.link]);
          if (hit) go(hit.link!);
          else onSelect(t.dataset.nodeId!);
        }}
      >
        <style>
          {linked.map((id) => `.lp-stage [data-node-id="${id}"]{cursor:pointer}`).join("") +
            selection.map((id) => `.lp-stage [data-node-id="${id}"]{outline:2px solid #2f80ff;outline-offset:1px}`).join("")}
        </style>
        <div className={"lp-device" + (device ? (phone ? " phone" : " browser") : "")} style={{ width: f.w * scale + bezel }}>
          {device && !phone && (
            <div className="lp-chrome">
              <i /><i /><i />
              <span>{f.name}</span>
            </div>
          )}
          <ScaledScreen scale={scale} width={f.w}>
            <NodeView id={f.id} nodes={doc.nodes} theme={doc.theme} top />
          </ScaledScreen>
        </div>
        <p className="lp-hint">{linked.length ? "Click links to try the flow · click anything else to select it" : "Click anything to select it in the editor"}</p>
      </div>
    </div>
  );
}

/** scales its content and takes up exactly the scaled size, whatever the content's height */
function ScaledScreen({ scale, width, children }: { scale: number; width: number; children: React.ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el);
    setH(el.offsetHeight);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="lp-screen" style={{ width: width * scale, height: h * scale }}>
      <div ref={inner} style={{ width, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
        {children}
      </div>
    </div>
  );
}

/* ---------------- docked pane ---------------- */

export function LivePreviewPane() {
  const [w, setW] = useState(() => Number(localStorage.getItem("freakma:preview-w")) || 420);
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX, w0 = w;
    const mv = (ev: PointerEvent) => setW(Math.max(280, Math.min(1100, w0 - (ev.clientX - x0))));
    const up = () => {
      removeEventListener("pointermove", mv);
      removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      setW((v) => (localStorage.setItem("freakma:preview-w", String(v)), v));
    };
    document.body.style.cursor = "col-resize";
    addEventListener("pointermove", mv);
    addEventListener("pointerup", up);
  };
  return (
    <aside className="lp-pane" style={{ width: w }}>
      <div className="lp-resize" onPointerDown={startResize} title="Drag to resize" />
      <PreviewView onSelect={(id) => select([id])} />
    </aside>
  );
}

/* ---------------- pop-out window, kept in sync over a BroadcastChannel ---------------- */

const CHANNEL = "freakma-live";

export function popOut() {
  if (bridge?.openPreview) bridge.openPreview();
  else window.open(location.href.split("#")[0] + "#preview", "freakma-preview", "width=520,height=940");
}

/** editor side: answer new preview windows and stream every change to them */
export function startLiveBroadcast() {
  if (typeof BroadcastChannel === "undefined") return;
  const ch = new BroadcastChannel(CHANNEL);
  const snapshot = () => {
    const s = getState();
    return { t: "state", doc: s.doc, selection: s.selection, pageId: s.pageId };
  };
  let last = { doc: getState().doc, selection: getState().selection, pageId: getState().pageId };
  let timer: ReturnType<typeof setTimeout> | null = null;
  ch.onmessage = (e) => {
    if (e.data?.t === "hello") ch.postMessage(snapshot());
    if (e.data?.t === "select" && getState().doc.nodes[e.data.id]) select([e.data.id]);
  };
  subscribe(() => {
    const s = getState();
    if (s.doc === last.doc && s.selection === last.selection && s.pageId === last.pageId) return;
    last = { doc: s.doc, selection: s.selection, pageId: s.pageId };
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      ch.postMessage(snapshot());
    }, 40);
  });
}

/** the pop-out window's whole UI */
export function PreviewWindow() {
  const [ready, setReady] = useState(false);
  const chRef = useRef<BroadcastChannel | null>(null);
  const got = useRef(false);
  useEffect(() => {
    document.title = "Freakma · Live preview";
    const ch = new BroadcastChannel(CHANNEL);
    chRef.current = ch;
    ch.onmessage = (e) => {
      if (e.data?.t !== "state") return;
      setState({ doc: e.data.doc, selection: e.data.selection, pageId: e.data.pageId });
      got.current = true;
      setReady(true);
    };
    ch.postMessage({ t: "hello" });
    // the editor may open after this window (or reload): keep asking until it answers
    const retry = setInterval(() => !got.current && ch.postMessage({ t: "hello" }), 1500);
    return () => {
      clearInterval(retry);
      ch.close();
    };
  }, []);
  return (
    <div className="lp-window">
      {ready ? <PreviewView popped onSelect={(id) => chRef.current?.postMessage({ t: "select", id })} /> : <div className="lp-empty"><p>Waiting for the Freakma editor…</p></div>}
    </div>
  );
}
