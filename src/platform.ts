/* What the Electron preload exposes as window.freakma. In a plain browser
 * (npm run dev) it is missing and the app falls back to browser storage. */

export interface ClaudeEvent {
  kind: "start" | "text" | "tool" | "done" | "error" | "stderr";
  text?: string;
  cost?: number;
}

export interface Bridge {
  pickFolder(): Promise<string | null>;
  openProject(): Promise<{ dir: string; json: string } | null>;
  readProject(dir: string): Promise<string | null>;
  writeProject(dir: string, json: string, guide: string): Promise<void>;
  watch(dir: string): Promise<void>;
  onFileChanged(cb: () => void): () => void;
  writeExport(dir: string, name: string, data: string, base64: boolean): Promise<string>;
  reveal(path: string): Promise<void>;
  claudeCheck(): Promise<{ ok: boolean; version?: string; error?: string }>;
  claudeRun(dir: string, prompt: string, opts: { continue: boolean }): Promise<void>;
  claudeStop(): Promise<void>;
  onClaude(cb: (e: ClaudeEvent) => void): () => void;
  collabHost(): Promise<{ port: number; code: string; addresses: string[] }>;
  collabStop(): Promise<void>;
  fetchUrl(url: string, headers?: Record<string, string>, binary?: boolean): Promise<{ ok: boolean; status: number; type: string; text?: string; base64?: string; url?: string }>;
  captureUrl(url: string, width: number): Promise<{ png: string; html: string; title: string; w: number; h: number }>;
  refsList(): Promise<RefMeta[]>;
  refsAdd(meta: RefMeta, data: string): Promise<RefMeta>;
  refsUpdate(id: string, patch: Partial<RefMeta>): Promise<void>;
  refsDelete(id: string): Promise<void>;
  refsData(id: string): Promise<string | null>;
  refsToProject(id: string, dir: string): Promise<string>;
}

export interface RefMeta {
  id: string;
  kind: "image" | "screenshot" | "design" | "html" | "link";
  name: string;
  tags: string[];
  board: string;
  url?: string;
  created: number;
  w?: number;
  h?: number;
  palette?: string[];
  /** file extension of the stored data: png/jpg/… for images, json for designs, html */
  ext: string;
  /** small preview for the grid (data URL) */
  thumb?: string;
}

export const bridge: Bridge | null = typeof window === "undefined" ? null : (window as unknown as { freakma?: Bridge }).freakma ?? null;
export const isDesktop = !!bridge;
export const PROJECT_FILE = "design.freakma.json";
