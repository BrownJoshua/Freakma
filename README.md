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
- **Blank styled blocks**: buttons (filled, soft, outline, ghost, pill, gradient, dark…),
  boxes (card, outlined, soft, elevated, glass, brand, dark, gradient), fields (outlined, filled,
  underline, rounded…) and tables, all with neutral text, ready to fill in. **Quick styles** in the
  inspector restyle anything you've already placed in one click; buttons also have S/M/L sizes.
- **Moving things**: click selects a whole button or field; drag it to move it and it snaps
  into the layout (pink line). Hold **Ctrl** while dragging to drop it exactly where you let go.
  *Add screen → free-form* gives a screen where everything stays where you put it.
- **Tables**: add or remove rows and columns next to the cell you clicked, lines or stripes.
- **Fixed, reusable blocks**: **Reuse** saves a table, a set of fields or any group as a block
  at the top of Parts; copies keep their structure (text stays editable) and can all be updated
  at once. **Lock** pins anything in place so it can't be moved, resized or dropped into.
- **Change anything**: size (fixed / fill / hug), auto layout (direction, gap, padding,
  alignment, grid columns), colours, borders, corners, shadows, opacity, text style, font, weight,
  line height, alignment, icons, images.
- **Themes**: five starting styles (Steel, Material, Minimal, Warm, Dark). Edit the colours,
  fonts, text sizes and corner sizes once and the whole design follows.
- **Free position when you want it**: switch any container (or draw a frame with **F**) to
  *Free* and place things anywhere, like a plain Figma frame, with smart guides that snap to
  edges and centres. Any single element can also *ignore auto layout* to float (badges, FABs).
  X/Y, rotation, align and distribute are in the inspector; arrow keys nudge.
- **Box select**: drag across empty canvas to select screens, or across a screen's background
  to select what's inside it.
- **Drawing**: rectangle, ellipse, line, arrow, **pen** (click for corners, drag for curves,
  click the first point to close) and **pencil** (freehand, smoothed). Double-click a path to
  edit its points and curve handles.
- **Live together**: *Share → Start a live session* hosts the design from your computer; anyone
  on the same network joins with your address and a 6-letter code. Everyone sees each other's
  cursors and selections, and edits appear instantly.
- **Comments**: press **C** and click anywhere to leave a note; reply, resolve, and jump to them
  from the Notes tab. Claude Code can read and resolve them too.
- **Import from Figma**: paste a Figma file link (or a link to one frame) and your personal access
  token. Auto-layout frames stay auto layout; text, colours, gradients, corners, shadows, images and
  vector shapes come across. A saved Figma API `.json` also works offline.
- **Import HTML prototypes, wired**: pick one `.html` file, several pages, or a whole folder
  (its CSS and images come along). Hidden screens, tabs and popups each become a screen, and
  buttons and links (`href="#id"`, `href="page.html"`, `data-target`, `onclick="show('id')"`) become
  prototype links, drawn as wires. Popups sit on the screen that opens them, and their close or
  cancel buttons lead back. Flex and grid become auto layout; scripts never run.
- **Live preview, side by side**: press **Preview** in the toolbar to see the screen you're
  working on beside the canvas, in a phone or browser frame, updating as you edit. It follows the
  screen you select; links are clickable so you can try the flow, and clicking anything else
  selects it in the editor. Pop it out into its own window to put it on a second monitor.
- **Wires**: on the Prototype tab, arrows show where every link goes. Select anything and drag its
  **+** handle onto a screen to link it, then press Play to click through.
- **Reference library**: collect ideas in the Library tab. Drop or paste screenshots, capture whole
  websites (screenshot + HTML), save any selection, keep HTML snippets and links, sort them into
  boards with tags. Then drag a reference onto the canvas, **trace over it** (locked, see-through),
  convert a captured page into an editable design, turn its colours into your theme, or press
  **Recreate with Claude** to have Claude Code rebuild it as a real screen. The library is shared by
  all your projects.
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
Unzip it and double-click `Freakma Setup x.y.z.exe`: it installs (or updates) in one step, with no
questions and no admin prompt, and opens Freakma when done. Your designs and reference library are
kept. The installer is not code-signed, so Windows SmartScreen asks once: choose
**More info → Run anyway**.

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

## Working together

1. One person opens the design and picks **Share → Start a live session** (desktop app).
   Windows may ask to allow Freakma through the firewall for private networks: allow it.
2. They send the **address** (e.g. `192.168.1.20:4848`) and **code** shown.
3. Everyone else picks **Share**, types their name, the address and code, and presses **Join**.

Sessions work on the same office network, LAN or VPN; nothing is sent to the internet. When the
host stops the session, everyone keeps a copy of the design.

## Keyboard

| Keys | Action |
|---|---|
| Ctrl Z / Ctrl Shift Z | Undo / redo |
| Ctrl D · Del | Duplicate · delete |
| Ctrl C / Ctrl V | Copy / paste |
| Ctrl G (Shift for a row) | Group into a stack |
| Alt ↑ / Alt ↓ | Move earlier / later |
| Esc · Enter | Select parent · select inside (or edit text) |
| V · H | Select · hand (pan) |
| F · R · O | Frame · rectangle · ellipse |
| L · Shift L | Line · arrow |
| P · Shift P | Pen · pencil |
| T · C | Text · comment |
| B · F5 | Add a button · play |
| Arrows (Shift for 10px) | Nudge free-positioned items and screens |
| Alt while dragging · Shift while dragging | No snapping · straight line |
| Space + drag, middle mouse | Pan |
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
