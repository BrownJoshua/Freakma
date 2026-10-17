# Freakma (developing the app)

Electron + React + TypeScript + Vite. No UI framework; styles are in `src/styles.css`.

- `src/model/types.ts`: the design document. It is plain JSON on disk (`design.freakma.json`)
  and Claude Code edits it in user projects, so keep it stable and update
  `src/claude/projectGuide.ts` (the CLAUDE.md shipped into every project) whenever it changes.
- `src/model/store.ts`: state, undo history (`commit` = one undo step; `beginGesture/live/endGesture`
  for drags), autosave.
- `src/model/actions.ts`: user-level operations used by the UI.
- `src/parts/library.ts`: the parts library, written with the builder in `src/parts/builder.ts`.
  Parts must use theme tokens (`$primary`, text styles) so themes keep working.
- `src/render/style.ts`: the single node → CSS function used by the canvas and by export.
- `electron/main.cjs`: file IO, folder watching, and running the user's `claude` CLI
  (`-p --output-format stream-json`, prompt on stdin, limited tools).

Checks: `npm run typecheck && npm test && npm run build`.
