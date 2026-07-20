import type {
  BoxStyle,
  ButtonContent,
  Column,
  Content,
  EmailDocument,
  ImageContent,
  Section,
  TextContent,
  TextStyle,
} from '../ir/types';

// Pure IR -> MJML mapping. No Figma, no DOM — deterministic string in / out,
// so it can be unit-tested in isolation. The UI hands the resulting MJML to
// mjml-browser to produce the final email-safe HTML.

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function px(value: number | undefined): string | undefined {
  return value === undefined ? undefined : `${Math.round(value)}px`;
}

function attrs(pairs: Record<string, string | undefined>): string {
  return Object.entries(pairs)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
}

function padding(style: BoxStyle): string | undefined {
  const { paddingTop: t, paddingRight: r, paddingBottom: b, paddingLeft: l } = style;
  if ([t, r, b, l].every((v) => v === undefined)) return undefined;
  return `${t ?? 0}px ${r ?? 0}px ${b ?? 0}px ${l ?? 0}px`;
}

// --- fonts -----------------------------------------------------------------

function isSerif(family: string): boolean {
  return /serif|times|georgia|garamond|playfair|merriweather/i.test(family) && !/sans/i.test(family);
}

/**
 * A resilient font stack: the design font first (quoted, since it may contain
 * spaces), then web-safe fallbacks. Email clients that don't load web fonts
 * degrade gracefully instead of dropping to an unrelated default.
 */
function fontStack(family?: string): string | undefined {
  if (!family) return undefined;
  const fallback = isSerif(family) ? 'Georgia, Times New Roman, serif' : 'Helvetica, Arial, sans-serif';
  return `'${family}', ${fallback}`;
}

function collectFonts(doc: EmailDocument): string[] {
  const families = new Set<string>();
  for (const section of doc.sections) {
    for (const column of section.columns) {
      for (const content of column.contents) {
        if (content.type === 'text' && content.style.fontFamily) {
          families.add(content.style.fontFamily);
        }
      }
    }
  }
  return [...families];
}

/**
 * Registers each design font as a Google Fonts import. Non-Google families
 * simply 404 harmlessly and fall through to the fallback stack, so this is
 * safe to emit unconditionally.
 */
function renderHead(doc: EmailDocument): string {
  const fonts = collectFonts(doc)
    .map((family) => {
      const href = `https://fonts.googleapis.com/css?family=${family.replace(/ /g, '+')}`;
      return `<mj-font name="${family}" href="${href}" />`;
    })
    .join('\n    ');
  return fonts ? `<mj-head>\n    ${fonts}\n  </mj-head>` : '';
}

function renderText(content: TextContent): string {
  const s: TextStyle = content.style;
  const a = attrs({
    color: s.color,
    'font-family': fontStack(s.fontFamily),
    'font-size': px(s.fontSize),
    'font-weight': s.fontWeight ? String(s.fontWeight) : undefined,
    'line-height': px(s.lineHeight),
    'letter-spacing': s.letterSpacing ? `${s.letterSpacing}px` : undefined,
    align: s.align,
  });
  return `<mj-text ${a}>${esc(content.text).replace(/\n/g, '<br/>')}</mj-text>`;
}

function renderImage(content: ImageContent): string {
  const a = attrs({
    src: content.src ?? '',
    alt: esc(content.alt),
    width: px(content.width),
  });
  return `<mj-image ${a} />`;
}

function renderButton(content: ButtonContent): string {
  const a = attrs({
    'background-color': content.style.backgroundColor ?? '#000000',
    color: content.style.color ?? '#ffffff',
    'font-size': px(content.style.fontSize),
    'border-radius': px(content.style.borderRadius),
    href: content.href ?? '#',
    align: content.style.align ?? 'center',
  });
  return `<mj-button ${a}>${esc(content.label)}</mj-button>`;
}

function renderContent(content: Content): string {
  switch (content.type) {
    case 'text':
      return renderText(content);
    case 'image':
      return renderImage(content);
    case 'button':
      return renderButton(content);
    case 'spacer':
      return `<mj-spacer height="${content.height}px" />`;
  }
}

function renderColumn(column: Column): string {
  const a = attrs({
    width: column.widthPct !== undefined ? `${column.widthPct}%` : undefined,
    'background-color': column.style.backgroundColor,
    padding: padding(column.style),
  });
  const body = column.contents.map(renderContent).join('\n      ');
  return `<mj-column ${a}>\n      ${body}\n    </mj-column>`;
}

function renderSection(section: Section): string {
  const a = attrs({
    'background-color': section.style.backgroundColor,
    padding: padding(section.style) ?? '0',
  });
  const columns = section.columns.map(renderColumn).join('\n    ');
  return `<mj-section ${a}>\n    ${columns}\n  </mj-section>`;
}

export function renderMjml(doc: EmailDocument): string {
  const head = renderHead(doc);
  const sections = doc.sections.map(renderSection).join('\n  ');
  return `<mjml>
  ${head}
  <mj-body ${attrs({ 'background-color': doc.backgroundColor, width: px(doc.width) })}>
  ${sections}
  </mj-body>
</mjml>`;
}
