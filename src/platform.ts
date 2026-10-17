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
}

export const bridge: Bridge | null = (window as unknown as { freakma?: Bridge }).freakma ?? null;
export const isDesktop = !!bridge;
export const PROJECT_FILE = "design.freakma.json";
