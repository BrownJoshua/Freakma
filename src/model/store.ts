import { useSyncExternalStore } from "react";
import type { Doc, Fragment, Node } from "./types";
import { allFrames, newDoc, normalize, parentOf } from "./doc";
import { applyPatch, diff } from "./patch";
import type { Patch } from "./patch";

export type LeftTab = "parts" | "layers" | "library" | "theme" | "comments";
export type Tool = "select" | "hand" | "frame" | "rect" | "ellipse" | "line" | "arrow" | "pen" | "pencil" | "text" | "comment";

export interface Peer {
  id: string;
  name: string;
  color: string;
  cursor?: { x: number; y: number };
  selection: string[];
  page?: string;
}
export type RightTab = "design" | "prototype" | "claude";

export interface DropHint {
  parentId: string;
  index: number;
  /** indicator line in stage coordinates */
  line: { x: number; y: number; w: number; h: number };
  /** drop point inside a free container, in its own coordinates */
  at?: { x: number; y: number };
}

export interface State {
  doc: Doc;
  pageId: string;
  selection: string[];
  hover: string | null;
  view: { x: number; y: number; zoom: number };
  leftTab: LeftTab;
  rightTab: RightTab;
  editingText: string | null;
  dropHint: DropHint | null;
  play: string | null;
  projectDir: string | null;
  saved: boolean;
  toast: string | null;
  tool: Tool;
  /** smart-guide lines while dragging, in stage pixels */
  guides: { x: number[]; y: number[] };
  marquee: { x: number; y: number; w: number; h: number } | null;
  /** vector whose points are being edited */
  editPath: string | null;
  openComment: string | null;
  peers: Record<string, Peer>;
  collab: { role: "off" | "host" | "guest"; status: string; address?: string; code?: string };
  /** the live preview pane beside the canvas */
  livePreview: boolean;
  /** draw prototype wires even outside the Prototype tab */
  showWires: boolean;
  /** which modal is open */
  dialog: "import" | "share" | null;
  /** text waiting to be put into the Claude prompt box */
  claudeDraft: string | null;
  /** bumps on every change so overlays re-measure */
  rev: number;
}

const LOCAL_KEY = "freakma:doc";

function initialDoc(): Doc {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch {}
  return newDoc();
}

const doc0 = initialDoc();
let state: State = {
  doc: doc0,
  pageId: doc0.pages[0].id,
  selection: [],
  hover: null,
  view: { x: 80, y: 80, zoom: 0.5 },
  leftTab: "parts",
  rightTab: "design",
  editingText: null,
  dropHint: null,
  play: null,
  projectDir: null,
  saved: true,
  toast: null,
  tool: "select",
  guides: { x: [], y: [] },
  marquee: null,
  editPath: null,
  openComment: null,
  peers: {},
  collab: { role: "off", status: "" },
  dialog: null,
  claudeDraft: null,
  showWires: false,
  livePreview: (() => {
    try {
      return localStorage.getItem("freakma:live") === "1";
    } catch {
      return false;
    }
  })(),
  rev: 0,
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const getState = () => state;
/** run after every state change */
export const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

export function setState(patch: Partial<State> | ((s: State) => Partial<State>)) {
  const p = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...p, rev: state.rev + 1 };
  emit();
}

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => sel(state),
  );
}

/* ---------------- history ----------------
 * Undo steps are patches (what changed), not whole snapshots, so undoing your own
 * edit never throws away what a collaborator did elsewhere in the file. */

interface Step {
  fwd: Patch;
  back: Patch;
}
const past: Step[] = [];
const future: Step[] = [];
let gestureStart: Doc | null = null;
const clone = (d: Doc): Doc => JSON.parse(JSON.stringify(d));

type ChangeListener = (p: Patch) => void;
const changeListeners = new Set<ChangeListener>();
/** fires for every local change (not for remote ones), e.g. to send it to collaborators */
export const onLocalChange = (cb: ChangeListener) => {
  changeListeners.add(cb);
  return () => changeListeners.delete(cb);
};
const announce = (p: Patch) => changeListeners.forEach((l) => l(p));

function changed() {
  scheduleSave();
}

/** every edit goes through here: one undo step per call */
export function commit(mutate: (doc: Doc) => void, extra?: Partial<State>) {
  const before = state.doc;
  const doc = clone(before);
  mutate(doc);
  const d = diff(before, doc);
  if (!d) {
    if (extra) setState(extra);
    return;
  }
  if (!gestureStart) {
    past.push(d);
    if (past.length > 200) past.shift();
    future.length = 0;
  }
  setState({ doc, saved: false, ...extra });
  announce(d.fwd);
  changed();
}

/** live edits while dragging: one undo step for the whole gesture */
export function beginGesture() {
  if (!gestureStart) gestureStart = clone(state.doc);
}
export function live(mutate: (doc: Doc) => void) {
  const before = state.doc;
  const doc = clone(before);
  mutate(doc);
  const d = diff(before, doc);
  if (!d) return;
  setState({ doc, saved: false });
  announce(d.fwd);
}
export function endGesture() {
  if (gestureStart) {
    const d = diff(gestureStart, state.doc);
    if (d) {
      past.push(d);
      future.length = 0;
      changed();
    }
  }
  gestureStart = null;
}

function step(from: Step[], to: Step[], dir: "fwd" | "back") {
  const s = from.pop();
  if (!s) return;
  to.push(s);
  const doc = applyPatch(clone(state.doc), s[dir]);
  setState({ doc, selection: state.selection.filter((id) => doc.nodes[id]), saved: false, editingText: null });
  announce(s[dir]);
  changed();
}
export const undo = () => step(past, future, "back");
export const redo = () => step(future, past, "fwd");
export const canUndo = () => past.length > 0;
export const canRedo = () => future.length > 0;

/** an edit from a collaborator: applied as-is, not added to this person's undo */
export function applyRemote(p: Patch) {
  const doc = applyPatch(clone(state.doc), p);
  setState({ doc, selection: state.selection.filter((id) => doc.nodes[id]) });
  scheduleSave();
}

/** replace the whole document (open file, reload after Claude) */
export function loadDoc(doc: Doc, opts: { keepHistory?: boolean; projectDir?: string | null; silent?: boolean } = {}) {
  const d = diff(state.doc, doc);
  if (opts.keepHistory && d) {
    past.push(d);
    future.length = 0;
  } else if (!opts.keepHistory) {
    past.length = 0;
    future.length = 0;
  }
  const pageId = doc.pages.find((p) => p.id === state.pageId)?.id ?? doc.pages[0].id;
  setState({
    doc,
    pageId,
    selection: state.selection.filter((id) => doc.nodes[id]),
    editingText: null,
    saved: true,
    ...(opts.projectDir !== undefined ? { projectDir: opts.projectDir } : {}),
  });
  if (d && !opts.silent) announce(d.fwd);
  saveLocal();
}

/* ---------------- saving ---------------- */

type Saver = (doc: Doc) => Promise<void>;
let diskSaver: Saver | null = null;
export const setDiskSaver = (s: Saver | null) => (diskSaver = s);

let timer: ReturnType<typeof setTimeout> | null = null;
function saveLocal() {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(state.doc));
  } catch {}
}
function scheduleSave() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(flushSave, 700);
}
export async function flushSave() {
  if (timer) clearTimeout(timer);
  timer = null;
  saveLocal();
  if (diskSaver && state.projectDir) {
    await diskSaver(state.doc);
  }
  setState({ saved: true });
}

/* ---------------- helpers ---------------- */

export const page = (s: State = state) => s.doc.pages.find((p) => p.id === s.pageId) ?? s.doc.pages[0];
export const node = (id: string | null | undefined, s: State = state): Node | undefined => (id ? s.doc.nodes[id] : undefined);
export const selected = (s: State = state) => s.selection.map((id) => s.doc.nodes[id]).filter(Boolean) as Node[];

export function toast(msg: string) {
  setState({ toast: msg });
  setTimeout(() => {
    if (getState().toast === msg) setState({ toast: null });
  }, 2600);
}

export function select(ids: string[]) {
  setState({ selection: ids, editingText: null });
}

/** the container new parts go into: the selection if it lays out children, else its parent, else the first frame */
export function insertionParent(): { parentId: string; index: number } | null {
  const s = state;
  const sel = s.selection[0] ? s.doc.nodes[s.selection[0]] : undefined;
  if (sel) {
    if (sel.layout) return { parentId: sel.id, index: sel.children.length };
    const p = parentOf(s.doc, sel.id);
    if (p) return { parentId: p.id, index: p.children.indexOf(sel.id) + 1 };
  }
  const f = page(s).frames[0];
  if (f) return { parentId: f, index: s.doc.nodes[f].children.length };
  return null;
}

let clipboard: Fragment[] = [];
export const setClipboard = (f: Fragment[]) => (clipboard = f);
export const getClipboard = () => clipboard;

export const framesOnPage = (s: State = state) => page(s).frames.map((id) => s.doc.nodes[id]).filter(Boolean) as Node[];
export const everyFrame = (s: State = state) => allFrames(s.doc);
