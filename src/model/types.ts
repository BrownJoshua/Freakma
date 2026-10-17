/* The design document. It is plain JSON so it can be saved to disk, diffed,
 * and edited by Claude Code. See src/claude/projectGuide.ts for the
 * human-readable description that ships with every project. */

export type NodeType = "frame" | "box" | "text" | "image" | "icon";

/** fixed = exact pixels, fill = take the space the parent gives, hug = shrink to content */
export type Sizing = "fixed" | "fill" | "hug";

export type Align = "start" | "center" | "end";
export type Justify = "start" | "center" | "end" | "between";

export interface Layout {
  mode: "row" | "column" | "grid";
  gap: number;
  /** top, right, bottom, left */
  padding: [number, number, number, number];
  align: Align;
  justify: Justify;
  wrap: boolean;
  columns: number;
}

export type RadiusToken = "none" | "sm" | "md" | "lg" | "full";
export type ShadowToken = "none" | "sm" | "md" | "lg";

export interface Node {
  id: string;
  type: NodeType;
  name: string;
  children: string[];

  /** canvas position, top-level frames only */
  x?: number;
  y?: number;

  w: number;
  h: number;
  wMode: Sizing;
  hMode: Sizing;

  /** auto layout; a node without it lays nothing out (text, image, icon) */
  layout?: Layout;

  /** colours accept "$token" (theme colour) or any CSS colour / gradient */
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: RadiusToken | number;
  shadow?: ShadowToken;
  opacity?: number;
  clip?: boolean;

  /* text */
  text?: string;
  textStyle?: string;
  color?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  lineHeight?: number;
  textAlign?: "left" | "center" | "right";
  italic?: boolean;
  underline?: boolean;
  uppercase?: boolean;

  /* image */
  src?: string;
  fit?: "cover" | "contain";

  /* icon */
  icon?: string;

  /** prototype: id of the frame to open when clicked in Play mode */
  link?: string;

  hidden?: boolean;
  locked?: boolean;

  /** the root of a part dropped from the library (clicks select it as a whole first) */
  part?: boolean;
  /** this subtree is a copy of a saved component */
  component?: string;
  /** frames: which device preset they were made for */
  device?: string;
}

export interface TextStyle {
  label: string;
  size: number;
  weight: number;
  lineHeight: number;
  font: "heading" | "body" | "mono";
  letterSpacing?: number;
  uppercase?: boolean;
}

export interface Theme {
  name: string;
  colors: Record<string, string>;
  fonts: { heading: string; body: string; mono: string };
  text: Record<string, TextStyle>;
  radius: { sm: number; md: number; lg: number };
  canvas: string;
}

export interface Fragment {
  root: string;
  nodes: Record<string, Node>;
}

export interface Component {
  id: string;
  name: string;
  fragment: Fragment;
}

export interface Page {
  id: string;
  name: string;
  frames: string[];
}

export interface Doc {
  app: "freakma";
  version: 1;
  name: string;
  theme: Theme;
  pages: Page[];
  nodes: Record<string, Node>;
  components: Component[];
}
