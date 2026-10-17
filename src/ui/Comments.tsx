import { useState } from "react";
import { commit, getState, setState, useStore } from "../model/store";
import { frameOf, uid } from "../model/doc";
import type { Comment, Doc } from "../model/types";
import { getUser, saveUser } from "../model/user";
import { Ico } from "./controls";

/** world position of a comment (screen comments move with their screen) */
export function commentWorld(doc: Doc, c: Comment) {
  const f = c.frame ? doc.nodes[c.frame] : undefined;
  return { x: (f?.x ?? 0) + c.x, y: (f?.y ?? 0) + c.y };
}

export function newComment(stage: HTMLElement, cx: number, cy: number) {
  const s = getState();
  const r = stage.getBoundingClientRect();
  const wx = (cx - r.left - s.view.x) / s.view.zoom, wy = (cy - r.top - s.view.y) / s.view.zoom;
  let frame: string | undefined;
  for (const e of document.elementsFromPoint(cx, cy)) {
    const id = (e as HTMLElement).dataset?.nodeId;
    if (id) {
      frame = frameOf(s.doc, id)?.id;
      break;
    }
  }
  const f = frame ? s.doc.nodes[frame] : undefined;
  const u = getUser();
  const c: Comment = { id: uid("cm"), frame, x: Math.round(wx - (f?.x ?? 0)), y: Math.round(wy - (f?.y ?? 0)), author: u.name || "Guest", color: u.color, text: "", at: Date.now(), replies: [] };
  commit((d) => void (d.comments = [...(d.comments ?? []), c]), { openComment: c.id });
}

export function CommentPins({ zoom }: { zoom: number }) {
  const doc = useStore((s) => s.doc);
  const open = useStore((s) => s.openComment);
  const pageId = useStore((s) => s.pageId);
  const pg = doc.pages.find((p) => p.id === pageId);
  return (
    <>
      {(doc.comments ?? [])
        .filter((c) => !c.resolved || c.id === open)
        .filter((c) => !c.frame || pg?.frames.includes(c.frame))
        .map((c, i) => {
          const p = commentWorld(doc, c);
          return (
            <button
              key={c.id}
              type="button"
              className={"pin" + (open === c.id ? " on" : "")}
              style={{ left: p.x, top: p.y, transform: `translate(0, -100%) scale(${1 / zoom})`, background: c.color }}
              title={c.text || "New comment"}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setState({ openComment: open === c.id ? null : c.id });
              }}
            >
              {(c.author || "?")[0].toUpperCase()}
              <small>{i + 1}</small>
            </button>
          );
        })}
    </>
  );
}

const when = (t: number) => {
  const d = Math.round((Date.now() - t) / 60000);
  return d < 1 ? "just now" : d < 60 ? `${d} min ago` : d < 1440 ? `${Math.round(d / 60)} h ago` : new Date(t).toLocaleDateString();
};

/** the open comment's thread, floating next to its pin */
export function CommentThread() {
  const id = useStore((s) => s.openComment);
  const doc = useStore((s) => s.doc);
  const view = useStore((s) => s.view);
  const [draft, setDraft] = useState("");
  const [name, setName] = useState(getUser().name);
  const c = (doc.comments ?? []).find((x) => x.id === id);
  if (!c) return null;
  const p = commentWorld(doc, c);
  const left = p.x * view.zoom + view.x + 18, top = p.y * view.zoom + view.y - 12;
  const update = (fn: (c: Comment) => void) => commit((d) => {
    const x = d.comments?.find((y) => y.id === c.id);
    if (x) fn(x);
  });
  const remove = () => commit((d) => void (d.comments = (d.comments ?? []).filter((y) => y.id !== c.id)), { openComment: null });
  const needName = !getUser().name;
  const send = () => {
    const text = draft.trim();
    if (!text) return;
    if (needName && name.trim()) saveUser({ ...getUser(), name: name.trim() });
    const u = getUser();
    if (!c.text) update((x) => Object.assign(x, { text, author: u.name || "Guest", color: u.color }));
    else update((x) => x.replies.push({ author: u.name || "Guest", color: u.color, text, at: Date.now() }));
    setDraft("");
  };
  return (
    <div className="thread" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
      <header>
        <span>{c.resolved ? "Resolved" : "Comment"}</span>
        {c.text && <button type="button" title={c.resolved ? "Reopen" : "Resolve"} onClick={() => update((x) => void (x.resolved = !x.resolved))}><Ico name="check" />{c.resolved ? "Reopen" : "Resolve"}</button>}
        <button type="button" title="Delete" onClick={remove}><Ico name="trash" /></button>
        <button type="button" title="Close" onClick={() => (c.text ? setState({ openComment: null }) : remove())}><Ico name="close" /></button>
      </header>
      {c.text && (
        <div className="msgs">
          {[{ author: c.author, color: c.color, text: c.text, at: c.at }, ...c.replies].map((m, i) => (
            <div key={i} className="msg">
              <b style={{ color: m.color }}>{m.author}</b> <span className="t">{when(m.at)}</span>
              <p>{m.text}</p>
            </div>
          ))}
        </div>
      )}
      {needName && <input className="txt" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />}
      <textarea
        autoFocus
        className="txt"
        rows={2}
        placeholder={c.text ? "Reply…" : "Add a comment…"}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
          if (e.key === "Escape") c.text ? setState({ openComment: null }) : remove();
        }}
      />
      <button type="button" className="wide primary" disabled={!draft.trim()} onClick={send}>{c.text ? "Reply" : "Post"}</button>
    </div>
  );
}

export function CommentsPanel() {
  const comments = useStore((s) => s.doc.comments ?? []);
  const doc = useStore((s) => s.doc);
  const [showResolved, setShowResolved] = useState(false);
  const list = comments.filter((c) => c.text && (showResolved || !c.resolved));
  const go = (c: Comment) => {
    const p = commentWorld(doc, c);
    const pg = doc.pages.find((x) => c.frame && x.frames.includes(c.frame));
    const st = document.querySelector(".stage") as HTMLElement | null;
    const z = Math.max(getState().view.zoom, 0.5);
    setState({ pageId: pg?.id ?? getState().pageId, openComment: c.id, view: { zoom: z, x: (st?.clientWidth ?? 800) / 2 - p.x * z, y: (st?.clientHeight ?? 600) / 2 - p.y * z } });
  };
  return (
    <>
      <div className="row">
        <button type="button" className="wide primary" onClick={() => setState({ tool: "comment" })}><Ico name="plus" />Add comment (C)</button>
      </div>
      <label className="opt"><input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />Show resolved</label>
      {list.length === 0 && <p className="hint">No comments yet. Press C, then click anywhere on a screen to leave a note for yourself or your team.</p>}
      <div className="clist">
        {list.map((c) => (
          <button key={c.id} type="button" className={"citem" + (c.resolved ? " done" : "")} onClick={() => go(c)}>
            <span className="dot" style={{ background: c.color }}>{(c.author || "?")[0]}</span>
            <span className="body">
              <b>{c.author}</b> <small>{when(c.at)}{c.frame && doc.nodes[c.frame] ? ` · ${doc.nodes[c.frame].name}` : ""}</small>
              <span>{c.text}</span>
              {c.replies.length > 0 && <small>{c.replies.length} repl{c.replies.length === 1 ? "y" : "ies"}</small>}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
