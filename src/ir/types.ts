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
}

export interface TextContent {
  type: 'text';
  text: string;
  style: TextStyle;
}

export interface ImageContent {
  type: 'image';
  /** Resolved by the UI from `bytes` into a data URL before rendering. */
  src?: string;
  /** PNG bytes exported from Figma; UI turns these into a data URL. */
  bytes?: Uint8Array;
  width: number;
  height: number;
  alt: string;
}

export interface ButtonContent {
  type: 'button';
  label: string;
  href?: string;
  style: TextStyle & BoxStyle;
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
