import type { BoxStyle, Column, Content, EmailDocument, Section, TextStyle } from '../ir/types';

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
  return style;
}

function fontWeight(style: string): number {
  const s = style.toLowerCase();
  if (s.includes('thin')) return 100;
  if (s.includes('extralight') || s.includes('ultralight')) return 200;
  if (s.includes('light')) return 300;
  if (s.includes('medium')) return 500;
  if (s.includes('semibold') || s.includes('demibold')) return 600;
  if (s.includes('extrabold') || s.includes('ultrabold')) return 800;
  if (s.includes('black') || s.includes('heavy')) return 900;
  if (s.includes('bold')) return 700;
  return 400;
}

function textStyle(node: TextNode): TextStyle {
  const style: TextStyle = {};
  style.color = solidFill(node.fills);
  if (typeof node.fontSize === 'number') style.fontSize = node.fontSize;
  if (node.fontName !== figma.mixed) {
    style.fontFamily = node.fontName.family;
    style.fontWeight = fontWeight(node.fontName.style);
  }
  if (typeof node.letterSpacing !== 'symbol' && node.letterSpacing.unit === 'PIXELS') {
    style.letterSpacing = node.letterSpacing.value;
  }
  if (node.lineHeight !== figma.mixed && node.lineHeight.unit === 'PIXELS') {
    style.lineHeight = node.lineHeight.value;
  }
  switch (node.textAlignHorizontal) {
    case 'CENTER':
      style.align = 'center';
      break;
    case 'RIGHT':
      style.align = 'right';
      break;
    default:
      style.align = 'left';
  }
  return style;
}

// --- content extraction ----------------------------------------------------

function isContainer(node: SceneNode): boolean {
  return node.type === 'FRAME' || node.type === 'GROUP' || node.type === 'COMPONENT' || node.type === 'INSTANCE';
}

function looksLikeButton(node: SceneNode): boolean {
  return /button|btn|cta/i.test(node.name);
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

async function toImage(node: SceneNode): Promise<Content> {
  imageCounter += 1;
  const bytes = await (
    node as SceneNode & {
      exportAsync: (s: ExportSettingsImage) => Promise<Uint8Array>;
    }
  ).exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } });
  return {
    type: 'image',
    id: `image-${imageCounter}`,
    bytes,
    width: Math.round(node.width),
    height: Math.round(node.height),
    alt: node.name,
  };
}

/** Collects leaf-level content (text / images / buttons) from a node subtree, in order. */
async function collectContents(node: SceneNode): Promise<Content[]> {
  if (node.visible === false || ('opacity' in node && node.opacity === 0)) return [];

  if (node.type === 'TEXT') {
    const text = node.characters.trim();
    return text ? [{ type: 'text', text, style: textStyle(node) }] : [];
  }

  if (looksLikeButton(node)) {
    const label = node.type !== 'FRAME' ? node.name : (firstText(node) ?? node.name);
    return [
      {
        type: 'button',
        label,
        style: { ...boxStyle(node), align: 'center' },
      },
    ];
  }

  if (hasImageFill(node) || isFlattenableGraphic(node)) {
    return [await toImage(node)];
  }

  if (isContainer(node) && 'children' in node) {
    const nested: Content[] = [];
    for (const child of node.children) {
      nested.push(...(await collectContents(child)));
    }
    return nested;
  }

  return [];
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

/**
 * Maps a selected Figma frame into an email document.
 *
 * Heuristic (MVP): each direct child of the root becomes one section.
 * A horizontal auto-layout child becomes a multi-column section (one column
 * per grandchild); everything else becomes a single-column section whose
 * column holds the flattened leaf content of that child.
 */
export async function buildDocument(root: SceneNode): Promise<EmailDocument> {
  imageCounter = 0;
  const sections: Section[] = [];

  const children = 'children' in root ? root.children : [];
  for (const child of children) {
    if (child.visible === false) continue;

    if (isHorizontal(child) && 'children' in child) {
      const columns: Column[] = [];
      for (const grandchild of child.children) {
        columns.push({
          type: 'column',
          style: boxStyle(grandchild),
          contents: await collectContents(grandchild),
        });
      }
      sections.push({ type: 'section', style: boxStyle(child), columns });
    } else {
      sections.push({
        type: 'section',
        style: boxStyle(child),
        columns: [{ type: 'column', style: {}, contents: await collectContents(child) }],
      });
    }
  }

  return {
    width: Math.round(root.width),
    backgroundColor: solidFill('fills' in root ? root.fills : undefined),
    sections,
  };
}
