/* Written as CLAUDE.md into every Freakma project folder, so Claude Code knows
 * how to read and edit the design file. Keep it in sync with src/model/types.ts. */
export const PROJECT_GUIDE = `<!-- freakma-guide v3 -->
# Freakma design project

This folder is a design made in **Freakma**, a desktop design tool. The whole design
lives in **\`design.freakma.json\`**. Freakma watches that file: when you save it, the
designer sees your change on their canvas immediately. Edit that file to change the design.

## Rules

1. Keep the file valid JSON. Edit with targeted edits; do not reformat the whole file.
2. Every node lives in \`nodes\` under its own id, and its \`id\` field equals that key.
3. A node appears on screen only if its id is in some parent's \`children\` array
   (or in \`pages[].frames\` for screens). Delete a node by removing it from its parent's
   \`children\` and deleting it and all its descendants from \`nodes\`.
4. New ids: short unique strings, e.g. \`"n_login_title"\`. Never reuse an id.
5. Use theme colour tokens (\`"$primary"\`, \`"$text"\` …) and text styles (\`"h1"\`, \`"body"\` …)
   instead of raw values, so the theme keeps working. Raw CSS colours are allowed when needed.
6. Prefer auto layout (\`layout\`) over fixed sizes. Most elements should be
   \`"wMode": "fill"\` or \`"hug"\`; use \`"fixed"\` only for icons, avatars and buttons with set sizes.
7. Do not move screens (\`x\`, \`y\` of frames) unless asked. New screens go to the right of the
   last one with 120px between them.
8. Write real, specific copy (names, numbers in the right currency/units). No lorem ipsum.

## File shape

\`\`\`jsonc
{
  "app": "freakma", "version": 1, "name": "My design",
  "theme": {
    "name": "Steel",
    "colors": { "primary": "#1F5F8B", "onPrimary": "#FFFFFF", "primarySoft": "…", "onPrimarySoft": "…",
                "background": "…", "surface": "…", "surfaceAlt": "…", "inverse": "…",
                "text": "…", "textMuted": "…", "border": "…",
                "success": "…", "successSoft": "…", "warning": "…", "warningSoft": "…", "danger": "…", "dangerSoft": "…" },
    "fonts": { "heading": "IBM Plex Sans", "body": "IBM Plex Sans", "mono": "IBM Plex Mono" },
    "text": { "display": {…}, "h1": {…}, "h2": {…}, "h3": {…}, "h4": {…}, "body": {…}, "bodySm": {…},
              "label": {…}, "button": {…}, "caption": {…}, "overline": {…}, "mono": {…} },
    "radius": { "sm": 6, "md": 10, "lg": 16 },
    "canvas": "#E3E4E1"
  },
  "pages": [ { "id": "p1", "name": "Page 1", "frames": ["f_home", "f_login"] } ],
  "nodes": { "<id>": { …node… } },
  "components": [ { "id": "c1", "name": "Button", "fragment": { "root": "<id>", "nodes": { … } } } ]
}
\`\`\`

## Node

| field | meaning |
|---|---|
| \`id\`, \`name\` | identity; name shows in the Layers panel |
| \`type\` | \`"frame"\` (a screen, top level only), \`"box"\` (container), \`"text"\`, \`"image"\`, \`"icon"\`, \`"vector"\` (lines, arrows, pen paths, imported shapes) |
| \`children\` | ordered child ids (boxes and frames only; others use \`[]\`) |
| \`x\`, \`y\` | canvas position for frames; position inside the parent for children of a \`"free"\` container or nodes with \`abs\` |
| \`abs\` | true = ignore the parent's auto layout and sit at \`x\`/\`y\` (badges, floating buttons, overlays) |
| \`rotation\` | degrees, clockwise |
| \`w\`, \`h\` | size in px, used when the mode is \`"fixed"\` |
| \`wMode\`, \`hMode\` | \`"fixed"\` exact px · \`"fill"\` take the space the parent gives · \`"hug"\` shrink to content |
| \`layout\` | auto layout for boxes/frames: \`{ "mode": "column"\\|"row"\\|"grid"\\|"free", "gap": 12, "padding": [top,right,bottom,left], "align": "start"\\|"center"\\|"end", "justify": "start"\\|"center"\\|"end"\\|"between", "wrap": false, "columns": 3 }\` |
| \`fill\` | background: token like \`"$surface"\`, a CSS colour, or a CSS gradient |
| \`stroke\`, \`strokeWidth\` | border colour and width |
| \`radius\` | \`"none"\\|"sm"\\|"md"\\|"lg"\\|"full"\` or a number |
| \`shadow\` | \`"none"\\|"sm"\\|"md"\\|"lg"\`; \`shadowCss\` (any CSS box-shadow) overrides it |
| \`opacity\` | 0–1 |
| \`clip\` | true hides overflowing content |
| \`text\` | the text of a text node (\`\\n\` for line breaks) |
| \`textStyle\` | key of \`theme.text\` |
| \`color\`, \`fontFamily\`, \`fontSize\`, \`fontWeight\`, \`lineHeight\`, \`textAlign\`, \`italic\`, \`underline\`, \`uppercase\` | text overrides |
| \`letterSpacing\` | px, text override |
| \`points\`, \`closed\`, \`arrow\` | vector path: \`[{x,y, ix?,iy?, ox?,oy?}]\` in a \`vw\` × \`vh\` box that stretches to \`w\` × \`h\` (\`ix/iy\`, \`ox/oy\` are curve handles); \`arrow\`: \`"none"\\|"end"\\|"both"\` |
| \`d\`, \`vw\`, \`vh\`, \`evenOdd\` | vector as raw SVG path data instead of points (imports) |
| \`src\`, \`fit\` | image source (URL or data URL) and \`"cover"\\|"contain"\` |
| \`icon\` | icon name for icon nodes; \`w\` is the icon size; \`color\` its colour |
| \`link\` | id of a frame to open when clicked in Play mode (prototype) |
| \`hidden\`, \`locked\` | layer visibility; locked keeps a block's position, size and structure fixed (its text stays editable) |
| \`part\` | true on the root of a library part (selected as a whole first) |
| \`atomic\` | true on finished elements (buttons, fields, badges, chips): selected whole, nothing is dropped inside |
| \`table\` | true on a table: a column box whose children are row boxes (one cell per child) and optional dividers |
| \`component\` | id of the component this subtree is a copy of |
| \`device\` | frames: \`"desktop"\\|"laptop"\\|"tablet"\\|"iphone"\\|"android"\` |

Frames are usually \`{"type":"frame","wMode":"fixed","w":1440,"hMode":"hug"}\` for web
and \`{"w":390,"h":844,"hMode":"fixed"}\` for phones, with
\`"layout": {"mode":"column","gap":0,"padding":[0,0,0,0],…}\` and \`"fill": "$background"\`.

A container with \`"layout": {"mode": "free", …}\` works like a plain Figma frame: every child
needs \`x\`, \`y\` (from the container's top-left) and \`"wMode"/"hMode"\` of \`"fixed"\` or \`"hug"\`.
Use free layout only for illustrations, collages and overlapping art; use auto layout for UI.

\`comments\` (top level) holds the team's notes: \`{ "id", "frame"?, "x", "y", "author", "text",
"resolved"?, "replies": [] }\`. Read them when asked to "address the comments"; mark one done
with \`"resolved": true\`. A \`references/\` folder may hold images or pages the designer wants
you to look at.

Icon names: home search menu close plus minus check chevron-right chevron-left chevron-down
chevron-up arrow-right arrow-left user users settings bell mail phone calendar clock heart
star cart box file folder chart pie trash edit filter download upload image camera play lock
eye more more-v grid list info alert check-circle map-pin truck rupee logout refresh share link
globe mic send barcode wallet card tag sun moon shield bolt factory wrench.

## Patterns

- Button: a \`row\` box, \`hMode: "fixed"\`, \`h: 44\`, padding \`[0,18,0,18]\`, \`justify: "center"\`,
  \`fill: "$primary"\`, \`radius: "md"\`, holding a text node with \`textStyle: "button"\`, \`color: "$onPrimary"\`.
- Card: a \`column\` box with \`fill: "$surface"\`, \`stroke: "$border"\`, \`strokeWidth: 1\`,
  \`radius: "md"\`, padding 20, gap 12.
- Input: a \`column\` (label text + a \`row\` box h 44 with \`stroke: "$border"\`, \`radius: "sm"\`,
  padding \`[0,12,0,12]\` holding placeholder text with \`color: "$textMuted"\`).
- Screen layout for web: a frame containing a \`row\` (sidebar fixed 232 wide + main \`fill\`),
  or a \`column\` of full-width sections.
`;
