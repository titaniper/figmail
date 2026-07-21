// Intermediate Representation (IR) — the contract between Figma traversal and
// the MJML renderer. Deliberately shaped close to MJML's own model
// (document > section > column > content) so rendering stays a trivial,
// pure mapping and the hard work (flattening Figma's arbitrary nesting into
// email-safe structure) happens once, during traversal.

export interface TextStyle {
  color?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  lineHeight?: number;
  letterSpacing?: number;
  align?: 'left' | 'center' | 'right';
}

export interface BoxStyle {
  backgroundColor?: string;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  borderRadius?: number;
  /** CSS border shorthand, e.g. "1px solid #d1d5db". */
  border?: string;
}

/** A hyperlink on a run: a static href and/or a URL variable. */
export interface RunLink {
  href?: string;
  var?: string;
}

/** A styled run within a text node — preserves inline weight/color/variable/link. */
export interface TextRun {
  text: string;
  fontWeight?: number;
  color?: string;
  italic?: boolean;
  underline?: boolean;
  /** This run is a text variable — rendered as `{{ var }}` / applied value. */
  var?: string;
  /** This run is a hyperlink. */
  link?: RunLink;
}

/**
 * A manual binding of a node to a template variable. `sample` is the mockup
 * value shown in preview; export emits the handlebars placeholder `{{ name }}`.
 */
export interface Binding {
  name: string;
  type: 'text' | 'url' | 'image';
  sample?: string;
}

export interface TextContent {
  type: 'text';
  runs: TextRun[];
  /** Base style for the paragraph (family, size, line-height, align). */
  style: TextStyle;
  /** When set, the whole text is a variable (`{{ name }}`) in Variables/export mode. */
  binding?: Binding;
}

export interface ImageContent {
  type: 'image';
  /** Stable identifier, also used as the exported file name (`<id>.png`). */
  id: string;
  /** Resolved by the UI: a data URL for preview, or a relative path for folder export. */
  src?: string;
  /** PNG bytes exported from Figma. */
  bytes?: Uint8Array;
  width: number;
  height: number;
  alt: string;
  /** When set, export uses `{{ name }}` as the image src instead of a file. */
  binding?: Binding;
}

export interface ButtonContent {
  type: 'button';
  label: string;
  href?: string;
  style: TextStyle & BoxStyle;
  /** When set, export uses `{{ name }}` as the href. */
  binding?: Binding;
}

export interface SpacerContent {
  type: 'spacer';
  height: number;
}

export type Content = TextContent | ImageContent | ButtonContent | SpacerContent;

export interface Column {
  type: 'column';
  /** 0–100; when omitted MJML distributes evenly. */
  widthPct?: number;
  style: BoxStyle;
  contents: Content[];
}

export interface Section {
  type: 'section';
  style: BoxStyle;
  columns: Column[];
}

export interface EmailDocument {
  /** Body width in px (from the root frame). */
  width: number;
  backgroundColor?: string;
  sections: Section[];
}
