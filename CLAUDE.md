# Freakma (developing the app)

Electron + React + TypeScript + Vite. No UI framework; styles are in `src/styles.css`.

- `src/model/types.ts`: the design document. It is plain JSON on disk (`design.freakma.json`)
  and Claude Code edits it in user projects, so keep it stable and update
  `src/claude/projectGuide.ts` (the CLAUDE.md shipped into every project) whenever it changes.
- `src/model/store.ts`: state, undo history (`commit` = one undo step; `beginGesture/live/endGesture`
  for drags), autosave. History is patch-based (`src/model/patch.ts`); the same patches are what
  live collaboration sends (`src/collab/client.ts` ↔ `electron/collab.cjs`, a small `ws` relay).
- `src/model/actions.ts`: user-level operations used by the UI.
- `src/parts/library.ts`: the parts library, written with the builder in `src/parts/builder.ts`.
  Parts must use theme tokens (`$primary`, text styles) so themes keep working.
- `src/render/style.ts`: the single node → CSS function used by the canvas and by export.
- `src/ui/Canvas.tsx`: pointer tools (select/marquee/free move with guides, shapes, pen, pencil,
  text, comment), drop targets and overlays. `src/ui/geometry.ts` holds the path maths.
- `src/import/`: HTML → nodes (renders in a script-free iframe and reads computed styles) and
  Figma REST JSON → nodes. `src/ui/Library.tsx`: the reference library (desktop: files in
  `userData/references`, browser: IndexedDB).
- `electron/main.cjs`: file IO, folder watching, and running the user's `claude` CLI
  (`-p --output-format stream-json`, prompt on stdin, limited tools).

Checks: `npm run typecheck && npm test && npm run build`.
