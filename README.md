# Freakma

A desktop design tool for people who don't design for a living. Drag ready-made
parts onto a screen and they snap into place; everything is adjustable; Claude Code
is built in, so you can ask for a screen in plain words and watch it appear.

## What you can do

- **Screens for every device**: desktop, laptop, tablet, iPhone and Android frames on an infinite canvas.
- **Drag-and-drop parts that fit themselves**: 70+ parts for web and mobile (navigation, forms,
  tables, cards, dialogs, alerts, charts, landing-page sections, ERP blocks, and six full screen
  templates). Everything uses auto layout, so a dropped part takes its place and resizes with
  the screen. A pink line shows exactly where it will land.
- **Change anything**: size (fixed / fill / hug), auto layout (direction, gap, padding,
  alignment, grid columns), colours, borders, corners, shadows, opacity, text style, font, weight,
  line height, alignment, icons, images.
- **Themes**: five starting styles (Steel, Material, Minimal, Warm, Dark). Edit the colours,
  fonts, text sizes and corner sizes once and the whole design follows.
- **Layers and pages**: rename, hide, lock and drag to reorder.
- **Components**: save any element as a reusable component, then update every copy at once.
- **Prototype**: link any element to another screen and press Play to click through.
- **Export**: PNG, SVG, HTML pages (linked like the prototype), React components, a plain-language
  spec, or the design file itself.
- **Claude Code**: type what you want in the ✦ Claude tab. Claude edits the design file and the
  canvas updates when it finishes. Ctrl+Z undoes Claude's changes like any other edit.

## Install on Windows

### Option A: download the installer

Every push to `main` builds a Windows installer on GitHub Actions:
**Actions → Windows installer → latest run → Artifacts → Freakma-Setup**.
Unzip it and run `Freakma Setup x.y.z.exe`. The installer is not code-signed, so Windows
SmartScreen asks once: choose **More info → Run anyway**.

### Option B: run from source

1. Install [Node.js 22](https://nodejs.org) and [Git](https://git-scm.com).
2. In a terminal:
   ```
   git clone https://github.com/BrownJoshua/Freakma.git
   cd Freakma
   npm install
   npm run app
   ```
   `npm run dist` builds your own installer into `release\`.

## Connect Claude Code

1. Install Claude Code (see claude.com/claude-code) and run `claude` once in a terminal to sign in.
   Freakma uses that same sign-in, so no API key is needed.
2. In Freakma, open the **✦ Claude** tab and choose a project folder. Freakma saves
   `design.freakma.json` and a `CLAUDE.md` guide there.
3. Ask for something, e.g. *"Create a GST invoice screen for desktop and a matching mobile version"*.
   Tick **About the selection** to point Claude at what you have selected.

You can also open that folder in Claude Code yourself (in a terminal or the desktop app). Freakma
watches the file and shows Claude's changes as soon as they are saved.

Claude runs with permission to read and edit files in the project folder only
(`Read, Edit, Write, Glob, Grep`). It cannot run commands.

## Keyboard

| Keys | Action |
|---|---|
| Ctrl Z / Ctrl Shift Z | Undo / redo |
| Ctrl D · Del | Duplicate · delete |
| Ctrl C / Ctrl V | Copy / paste |
| Ctrl G (Shift for a row) | Group into a stack |
| Alt ↑ / Alt ↓ | Move earlier / later |
| Esc · Enter | Select parent · select inside (or edit text) |
| T · B · P | Add text · add button · play |
| Space + drag, or drag empty canvas | Pan |
| Ctrl + scroll | Zoom |
| Shift 1 | Zoom to fit |
| Ctrl S · Ctrl E | Save · export |

## Development

```
npm run dev        # the editor in a browser (no Claude, saves to browser storage)
npm run app        # the desktop app with hot reload
npm test           # unit tests
npm run typecheck
npm run dist       # Windows installer
```

Code map: `src/model` (document, store, actions), `src/parts` (the parts library),
`src/render` (node → CSS), `src/ui` (panels and canvas), `src/export` (HTML/React),
`electron` (desktop shell and the Claude Code bridge).

## License

MIT
