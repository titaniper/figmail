import type { BoxStyle, Column, Content, EmailDocument, RunLink, Section, TextRun, TextStyle } from '../ir/types';
import type { NodeData, TemplateData } from '../shared/messages';

export const PLUGIN_DATA_KEY = 'figmail';
export const PLUGIN_TEMPLATE_KEY = 'figmail:template';

export function readNodeData(node: BaseNode): NodeData {
  try {
    const raw = node.getPluginData(PLUGIN_DATA_KEY);
    return raw ? (JSON.parse(raw) as NodeData) : {};
  } catch {
    return {};
  }
}

export function readTemplateData(node: BaseNode): TemplateData {
  try {
    const raw = node.getPluginData(PLUGIN_TEMPLATE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<TemplateData>) : {};
    return {
      variables: Array.isArray(parsed.variables) ? parsed.variables : [],
      subject: parsed.subject,
      from: parsed.from,
    };
  } catch {
    return { variables: [] };
  }
}

// --- color helpers ---------------------------------------------------------

function toHex(channel: number): string {
  return Math.round(channel * 255)
    .toString(16)
    .padStart(2, '0');
}

function rgbToHex(color: RGB): string {
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

function solidFill(fills: readonly Paint[] | typeof figma.mixed | undefined): string | undefined {
  if (!fills || fills === figma.mixed) return undefined;
  const solid = fills.find((p): p is SolidPaint => p.type === 'SOLID' && p.visible !== false);
  return solid ? rgbToHex(solid.color) : undefined;
}

function hasImageFill(node: SceneNode): boolean {
  if (!('fills' in node) || node.fills === figma.mixed) return false;
  return (node.fills as readonly Paint[]).some((p) => p.type === 'IMAGE' && p.visible !== false);
}

// --- style extraction ------------------------------------------------------

function boxStyle(node: SceneNode): BoxStyle {
  const style: BoxStyle = {};
  if ('fills' in node) style.backgroundColor = solidFill(node.fills);
  if ('paddingTop' in node) {
    style.paddingTop = node.paddingTop;
    style.paddingRight = node.paddingRight;
    style.paddingBottom = node.paddingBottom;
    style.paddingLeft = node.paddingLeft;
  }
  if ('cornerRadius' in node && typeof node.cornerRadius === 'number') {
    style.borderRadius = node.cornerRadius;
  }
  if ('strokes' in node && Array.isArray(node.strokes)) {
    const stroke = node.strokes.find((s): s is SolidPaint => s.type === 'SOLID' && s.visible !== false);
    const weight = 'strokeWeight' in node && typeof node.strokeWeight === 'number' ? node.strokeWeight : 0;
    if (stroke && weight > 0) style.border = `${Math.round(weight)}px solid ${rgbToHex(stroke.color)}`;
  }
  return style;
}

/** True when the node has a visible solid background fill (a filled CTA button, not a text link). */
function hasSolidBg(node: SceneNode): boolean {
  return solidFill('fills' in node ? node.fills : undefined) !== undefined;
}

function fontWeight(style: string): number {
  // Normalize "Semi Bold" / "Extra_Bold" → "semibold"/"extrabold" before matching.
  const s = style.toLowerCase().replace(/[\s_-]/g, '');
  if (s.includes('thin')) return 100;
  if (s.includes('extralight') || s.includes('ultralight')) return 200;
  if (s.includes('semibold') || s.includes('demibold')) return 600;
  if (s.includes('extrabold') || s.includes('ultrabold')) return 800;
  if (s.includes('light')) return 300;
  if (s.includes('medium')) return 500;
  if (s.includes('black') || s.includes('heavy')) return 900;
  if (s.includes('bold')) return 700;
  return 400;
}

type Align = NonNullable<TextStyle['align']>;

/** A text node's own alignment, or the alignment inherited from its container. */
function resolveTextAlign(node: TextNode, inherited: Align): Align {
  if (node.textAlignHorizontal === 'CENTER') return 'center';
  if (node.textAlignHorizontal === 'RIGHT') return 'right';
  return inherited;
}

/** Horizontal alignment an auto-layout container imposes on its children. */
function containerAlign(node: SceneNode, inherited: Align): Align {
  if (!('layoutMode' in node) || node.layoutMode === 'NONE') return inherited;
  const axis = node.layoutMode === 'VERTICAL' ? node.counterAxisAlignItems : node.primaryAxisAlignItems;
  if (axis === 'CENTER') return 'center';
  if (axis === 'MAX') return 'right';
  if (axis === 'MIN') return 'left';
  return inherited;
}

/**
 * Builds a text content node. Runs are split at boundaries of style
 * (font/color), user-bound variable/link ranges, and Figma inline hyperlinks —
 * so partial bold, partial variables, and inline links all survive.
 */
function buildText(node: TextNode, inheritedAlign: Align): Content[] {
  const chars = node.characters;
  if (chars.trim().length === 0) return [];
  const n = chars.length;

  // Per-character style + Figma hyperlink from styled segments.
  const weight: number[] = new Array(n).fill(400);
  const italic: boolean[] = new Array(n).fill(false);
  const underline: boolean[] = new Array(n).fill(false);
  const color: (string | undefined)[] = new Array(n).fill(undefined);
  const figLink: (string | undefined)[] = new Array(n).fill(undefined);
  const styleSegs = node.getStyledTextSegments(['fontName', 'fills', 'hyperlink', 'textDecoration']);
  for (const seg of styleSegs) {
    const w = fontWeight(seg.fontName.style);
    const it = /italic/i.test(seg.fontName.style);
    const c = solidFill(seg.fills);
    const link = seg.hyperlink && seg.hyperlink.type === 'URL' ? seg.hyperlink.value : undefined;
    const ul = seg.textDecoration === 'UNDERLINE';
    for (let i = seg.start; i < seg.end; i += 1) {
      weight[i] = w;
      italic[i] = it;
      underline[i] = ul;
      color[i] = c;
      figLink[i] = link;
    }
  }

  // Per-character user variable / link ranges.
  const varAt: (string | undefined)[] = new Array(n).fill(undefined);
  const linkAt: (RunLink | undefined)[] = new Array(n).fill(undefined);
  for (const seg of readNodeData(node).segments ?? []) {
    for (let i = Math.max(0, seg.start); i < Math.min(seg.end, n); i += 1) {
      if (seg.var) varAt[i] = seg.var;
      if (seg.link) linkAt[i] = seg.link;
    }
  }
  // Auto-detect handlebars typed directly in the Figma text (e.g. "Dear {{ customerName }},").
  const handlebarsRe = /\{\{\s*([\w.-]+)\s*\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = handlebarsRe.exec(chars)) !== null) {
    for (let i = match.index; i < match.index + match[0].length; i += 1) {
      if (!varAt[i]) varAt[i] = match[1];
    }
  }

  // A Figma hyperlink becomes a link run where the user hasn't set one.
  for (let i = 0; i < n; i += 1) if (!linkAt[i] && figLink[i]) linkAt[i] = { href: figLink[i] };

  const key = (i: number) =>
    `${weight[i]}|${italic[i]}|${underline[i]}|${color[i] ?? ''}|${varAt[i] ?? ''}|${JSON.stringify(linkAt[i] ?? null)}`;

  const runs: TextRun[] = [];
  let i = 0;
  while (i < n) {
    let j = i + 1;
    while (j < n && key(j) === key(i)) j += 1;
    const run: TextRun = { text: chars.slice(i, j) };
    if (weight[i] !== 400) run.fontWeight = weight[i];
    if (italic[i]) run.italic = true;
    if (underline[i]) run.underline = true;
    if (color[i]) run.color = color[i];
    if (varAt[i]) run.var = varAt[i];
    if (linkAt[i]) run.link = linkAt[i];
    runs.push(run);
    i = j;
  }

  const style: TextStyle = {
    fontFamily: styleSegs[0]?.fontName.family,
    color: solidFill(node.fills) ?? color[0],
    align: resolveTextAlign(node, inheritedAlign),
  };
  if (typeof node.fontSize === 'number') style.fontSize = node.fontSize;
  if (typeof node.letterSpacing !== 'symbol' && node.letterSpacing.unit === 'PIXELS') {
    style.letterSpacing = node.letterSpacing.value;
  }
  if (node.lineHeight !== figma.mixed && node.lineHeight.unit === 'PIXELS') {
    style.lineHeight = node.lineHeight.value;
  }

  return [{ type: 'text', runs, style }];
}

// --- content extraction ----------------------------------------------------

function isContainer(node: SceneNode): boolean {
  return node.type === 'FRAME' || node.type === 'GROUP' || node.type === 'COMPONENT' || node.type === 'INSTANCE';
}

function countTextNodes(node: SceneNode): number {
  if (node.type === 'TEXT') return 1;
  if ('children' in node) return node.children.reduce((sum, c) => sum + countTextNodes(c), 0);
  return 0;
}

/**
 * A real button/link: name hints at a button AND it isn't a big content row
 * (rows are named "…Button Block…/Row/Column/…" and hold multiple text nodes).
 */
function looksLikeButton(node: SceneNode): boolean {
  if (/block|row|column|section|list|footer|header|tiles|split/i.test(node.name)) return false;
  if (!/button|btn|cta|🔗/i.test(node.name)) return false;
  return countTextNodes(node) <= 1;
}

const VECTOR_TYPES: SceneNode['type'][] = ['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'LINE', 'ELLIPSE', 'POLYGON'];

function subtreeHasText(node: SceneNode): boolean {
  if (node.type === 'TEXT') return true;
  if ('children' in node) return node.children.some(subtreeHasText);
  return false;
}

function subtreeHasVector(node: SceneNode): boolean {
  if (VECTOR_TYPES.includes(node.type)) return true;
  if ('children' in node) return node.children.some(subtreeHasVector);
  return false;
}

/**
 * A node that should be flattened into a single raster image to reproduce it
 * faithfully: a vector shape, or an icon/illustration group made of vectors
 * with no live text. Text-bearing containers are left to recurse so their copy
 * stays selectable.
 */
function isFlattenableGraphic(node: SceneNode): boolean {
  if (VECTOR_TYPES.includes(node.type)) return true;
  if (isContainer(node) && subtreeHasVector(node) && !subtreeHasText(node)) return true;
  return false;
}

let imageCounter = 0;

async function toImage(node: SceneNode): Promise<Content | null> {
  if (node.width < 1 || node.height < 1) return null;

  const bytes = await (
    node as SceneNode & {
      exportAsync: (s: ExportSettingsImage) => Promise<Uint8Array>;
    }
  ).exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } });

  // A zero-byte export would render as a broken image showing only its alt
  // (layer name) — drop it instead of emitting that noise.
  if (!bytes || bytes.length === 0) return null;

  imageCounter += 1;
  return {
    type: 'image',
    id: `image-${imageCounter}`,
    bytes,
    width: Math.round(node.width),
    height: Math.round(node.height),
    alt: node.name,
    binding: readNodeData(node).binding,
  };
}

/** Collects leaf-level content (text / images / buttons) from a node subtree, in order. */
async function collectContents(node: SceneNode, inheritedAlign: Align = 'left'): Promise<Content[]> {
  if (node.visible === false || ('opacity' in node && node.opacity === 0)) return [];

  if (node.type === 'TEXT') return buildText(node, inheritedAlign);

  const data = readNodeData(node);
  const hasLinkData = Boolean(data.href) || data.binding?.type === 'url';
  // A filled CTA (has a background) is an mj-button; a bg-less "🔗 Button" is just a
  // text link — let it fall through so its inner text renders (underlined/coloured).
  if ((looksLikeButton(node) && hasSolidBg(node)) || hasLinkData) {
    const label = firstText(node) ?? node.name;
    return [
      {
        type: 'button',
        label,
        style: { ...boxStyle(node), align: inheritedAlign },
        href: data.href,
        binding: data.binding,
      },
    ];
  }

  if (hasImageFill(node) || isFlattenableGraphic(node)) {
    const image = await toImage(node);
    return image ? [image] : [];
  }

  if (isContainer(node) && 'children' in node) {
    // An empty frame (e.g. "📐 Spacer") contributes its height as vertical spacing.
    const visible = node.children.filter((c) => c.visible !== false);
    if (visible.length === 0) {
      return node.height >= 1 ? [{ type: 'spacer', height: Math.round(node.height) }] : [];
    }
    const align = containerAlign(node, inheritedAlign);
    const gap = layoutGap(node);
    const nested: Content[] = [];
    for (const child of visible) {
      const childContents = await collectContents(child, align);
      if (childContents.length === 0) continue;
      if (nested.length > 0 && gap > 0) nested.push({ type: 'spacer', height: gap });
      nested.push(...childContents);
    }
    return nested;
  }

  return [];
}

/** Auto-layout item spacing (gap between children), or 0 when not auto-layout. */
function layoutGap(node: SceneNode): number {
  if ('layoutMode' in node && node.layoutMode !== 'NONE' && typeof node.itemSpacing === 'number') {
    return Math.max(0, Math.round(node.itemSpacing));
  }
  return 0;
}

function firstText(node: SceneNode): string | undefined {
  if (node.type === 'TEXT') return node.characters.trim();
  if ('children' in node) {
    for (const child of node.children) {
      const found = firstText(child);
      if (found) return found;
    }
  }
  return undefined;
}

function isHorizontal(node: SceneNode): boolean {
  return 'layoutMode' in node && node.layoutMode === 'HORIZONTAL';
}

// --- top-level document builder --------------------------------------------

function visibleChildren(node: SceneNode): SceneNode[] {
  if (!('children' in node)) return [];
  return node.children.filter((c) => c.visible !== false && !('opacity' in c && c.opacity === 0));
}

function isRow(node: SceneNode): boolean {
  return isHorizontal(node) && !isFlattenableGraphic(node) && visibleChildren(node).length > 1;
}

function isLeaf(node: SceneNode): boolean {
  return node.type === 'TEXT' || looksLikeButton(node) || hasImageFill(node) || isFlattenableGraphic(node);
}

/** A horizontal row nested somewhere below (email HTML can't represent it → rasterize). */
function hasNestedRow(node: SceneNode): boolean {
  if (isLeaf(node)) return false;
  return visibleChildren(node).some((c) => isRow(c) || hasNestedRow(c));
}

/** A child image that covers ~the whole node — i.e. a background/banner image behind content. */
function hasBackgroundImageChild(node: SceneNode): boolean {
  return visibleChildren(node).some(
    (c) =>
      (hasImageFill(c) || isFlattenableGraphic(c)) &&
      c.width >= node.width * 0.9 &&
      c.height >= node.height * 0.9 &&
      visibleChildren(node).length > 1,
  );
}

function spacerSection(height: number): Section {
  return {
    type: 'section',
    style: {},
    columns: [{ type: 'column', style: {}, contents: [{ type: 'spacer', height }] }],
  };
}

/** If a container just wraps a single styled container (row > card), return the inner card. */
function unwrap(node: SceneNode): SceneNode {
  const kids = visibleChildren(node);
  if (kids.length === 1 && isContainer(kids[0]) && !isLeaf(kids[0])) return kids[0];
  return node;
}

async function columnsFrom(row: SceneNode): Promise<Column[]> {
  const children = visibleChildren(row);
  const n = children.length;
  const content: Column[] = [];
  for (const child of children) {
    const inner = unwrap(child);
    content.push({
      type: 'column',
      style: boxStyle(inner),
      contents: await collectContents(inner, containerAlign(inner, 'left')),
    });
  }

  const gap = layoutGap(row);
  if (gap <= 0 || n <= 1) return content;

  // MJML columns sit flush; insert thin empty spacer columns to create the gap
  // between (bordered) tiles. Widths are distributed in %.
  const rowWidth = row.width || 600;
  const spacerPct = Math.min(20, (gap / rowWidth) * 100);
  const contentPct = (100 - spacerPct * (n - 1)) / n;
  const out: Column[] = [];
  content.forEach((col, idx) => {
    if (idx > 0)
      out.push({ type: 'column', widthPct: spacerPct, style: {}, contents: [{ type: 'spacer', height: 1 }] });
    col.widthPct = contentPct;
    out.push(col);
  });
  return out;
}

function sectionEmpty(section: Section): boolean {
  return section.columns.every((c) => c.contents.every((x) => x.type === 'spacer'));
}

/**
 * Maps one top-level child (an email "row") to a section, preserving its
 * background/padding. A horizontal row becomes a multi-column section; a row that
 * wraps a single card becomes section(row bg) > column(card bg/padding) > content.
 */
function imageSection(image: Content): Section {
  return { type: 'section', style: {}, columns: [{ type: 'column', style: {}, contents: [image] }] };
}

async function sectionFor(child: SceneNode): Promise<Section> {
  // A row with a background image (e.g. a banner) or a nested horizontal layout
  // (e.g. an icon+text checklist) can't be expressed in MJML — rasterize it whole.
  if (hasImageFill(child) || hasNestedRow(child) || hasBackgroundImageChild(child)) {
    const image = await toImage(child);
    if (image) return imageSection(image);
  }
  if (isRow(child)) {
    return { type: 'section', style: boxStyle(child), columns: await columnsFrom(child) };
  }
  const inner = unwrap(child);
  if (inner !== child && isRow(inner)) {
    return { type: 'section', style: boxStyle(child), columns: await columnsFrom(inner) };
  }
  return {
    type: 'section',
    style: boxStyle(child),
    columns: [
      {
        type: 'column',
        style: inner === child ? {} : boxStyle(inner),
        contents: await collectContents(inner, containerAlign(inner, 'left')),
      },
    ],
  };
}

/** Flattens the frame's rows into email sections (email HTML can't nest arbitrarily). */
async function buildSections(container: SceneNode): Promise<Section[]> {
  const out: Section[] = [];
  const gap = layoutGap(container);
  for (const child of visibleChildren(container)) {
    const section = await sectionFor(child);
    if (sectionEmpty(section)) continue;
    if (out.length > 0 && gap > 0) out.push(spacerSection(gap));
    out.push(section);
  }
  return out;
}

/** Maps a selected Figma frame into an email document. */
export async function buildDocument(root: SceneNode): Promise<EmailDocument> {
  imageCounter = 0;
  return {
    width: Math.round(root.width),
    backgroundColor: solidFill('fills' in root ? root.fills : undefined),
    sections: await buildSections(root),
  };
}
