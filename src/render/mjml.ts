import type {
  BoxStyle,
  ButtonContent,
  Column,
  Content,
  EmailDocument,
  ImageContent,
  Section,
  TextContent,
  TextRun,
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
// Dark-mode overrides. Emitted inside a prefers-color-scheme media query for
// export (clients apply it), or unconditionally when `forceDark` previews it.
const DARK_RULES =
  'body,.fm-body{background:#16181c !important}' +
  '.fm-section{background:#1f2226 !important}' +
  '.fm-text,.fm-text *{color:#e6e8eb !important}';

function renderHead(doc: EmailDocument, opts: RenderOptions): string {
  const fonts = collectFonts(doc)
    .map((family) => {
      const href = `https://fonts.googleapis.com/css?family=${family.replace(/ /g, '+')}`;
      return `<mj-font name="${family}" href="${href}" />`;
    })
    .join('\n    ');

  // MJML applies generous default paddings (section 20px, text/image 10px 25px).
  // Those inflate the layout; the design's real spacing comes from Figma
  // auto-layout instead, so we zero the defaults here.
  const attributes = [
    '<mj-attributes>',
    '  <mj-all padding="0" font-family="Helvetica, Arial, sans-serif" />',
    '  <mj-text padding="0" line-height="1.4" />',
    '  <mj-section padding="0" />',
    '  <mj-column padding="0" />',
    '  <mj-image padding="0" />',
    '  <mj-button padding="0" />',
    '</mj-attributes>',
  ].join('\n    ');

  const colorScheme =
    '<mj-raw><meta name="color-scheme" content="light dark" /><meta name="supported-color-schemes" content="light dark" /></mj-raw>';
  const dark = opts.forceDark
    ? `<mj-style>${DARK_RULES}</mj-style>`
    : opts.emitDarkMedia === false
      ? ''
      : `<mj-style>@media (prefers-color-scheme: dark){${DARK_RULES}}</mj-style>`;

  return `<mj-head>\n    ${attributes}\n    ${colorScheme}\n    ${dark}\n    ${fonts}\n  </mj-head>`;
}

function renderRun(run: TextRun, base: TextStyle, opts: RenderOptions): string {
  let content: string;
  if (run.var) {
    content = opts.variables ? handlebars(run.var) : esc(appliedValue(run.var, opts) ?? run.text);
  } else {
    content = esc(run.text).replace(/\n/g, '<br/>');
  }

  const declarations: string[] = [];
  if (run.fontWeight && run.fontWeight !== 400) declarations.push(`font-weight:${run.fontWeight}`);
  if (run.italic) declarations.push('font-style:italic');
  if (run.color && run.color !== base.color) declarations.push(`color:${run.color}`);
  let html = declarations.length ? `<span style="${declarations.join(';')}">${content}</span>` : content;

  if (run.link) {
    const href =
      opts.variables && run.link.var
        ? handlebars(run.link.var)
        : ((run.link.var && appliedValue(run.link.var, opts)) ?? run.link.href ?? '#');
    html = `<a href="${href}" style="color:inherit;text-decoration:underline">${html}</a>`;
  }
  return html;
}

/**
 * Render options.
 * - `variables: true` emits handlebars placeholders (`{{ name }}`) for bound nodes.
 * - `values` supplies applied values per variable name for mockup rendering.
 */
export interface RenderOptions {
  variables?: boolean;
  values?: Record<string, string>;
  /** Preview-only: apply the dark overrides unconditionally (export uses a media query). */
  forceDark?: boolean;
  /** Emit the prefers-color-scheme dark media query. Off for preview (so the OS theme
   *  can't hijack it), on for export. Default true. */
  emitDarkMedia?: boolean;
}

function handlebars(name: string): string {
  return `{{ ${name} }}`;
}

/** Resolved value for a bound node in mockup mode: applied value if set, else undefined. */
function appliedValue(name: string, opts: RenderOptions): string | undefined {
  const value = opts.values?.[name];
  return value !== undefined && value !== '' ? value : undefined;
}

function renderText(content: TextContent, opts: RenderOptions): string {
  const s: TextStyle = content.style;
  const a = attrs({
    color: s.color,
    'font-family': fontStack(s.fontFamily),
    'font-size': px(s.fontSize),
    'line-height': px(s.lineHeight),
    'letter-spacing': s.letterSpacing ? `${s.letterSpacing}px` : undefined,
    align: s.align,
    'css-class': 'fm-text',
  });
  const inner = content.runs.map((run) => renderRun(run, s, opts)).join('');
  return `<mj-text ${a}>${inner}</mj-text>`;
}

function renderImage(content: ImageContent, opts: RenderOptions): string {
  let src = content.src ?? '';
  if (content.binding) {
    if (opts.variables) src = handlebars(content.binding.name);
    else src = appliedValue(content.binding.name, opts) ?? src;
  }
  const a = attrs({ src, alt: esc(content.alt), width: px(content.width) });
  return `<mj-image ${a} />`;
}

function renderButton(content: ButtonContent, opts: RenderOptions): string {
  const href =
    opts.variables && content.binding
      ? handlebars(content.binding.name)
      : ((content.binding && appliedValue(content.binding.name, opts)) ??
        content.href ??
        content.binding?.sample ??
        '#');
  const a = attrs({
    'background-color': content.style.backgroundColor ?? '#000000',
    color: content.style.color ?? '#ffffff',
    'font-size': px(content.style.fontSize),
    'border-radius': px(content.style.borderRadius),
    href,
    align: content.style.align ?? 'center',
  });
  return `<mj-button ${a}>${esc(content.label)}</mj-button>`;
}

function renderContent(content: Content, opts: RenderOptions): string {
  switch (content.type) {
    case 'text':
      return renderText(content, opts);
    case 'image':
      return renderImage(content, opts);
    case 'button':
      return renderButton(content, opts);
    case 'spacer':
      return `<mj-spacer height="${content.height}px" />`;
  }
}

function renderColumn(column: Column, opts: RenderOptions): string {
  const a = attrs({
    width: column.widthPct !== undefined ? `${column.widthPct}%` : undefined,
    'background-color': column.style.backgroundColor,
    padding: padding(column.style),
  });
  const body = column.contents.map((c) => renderContent(c, opts)).join('\n      ');
  return `<mj-column ${a}>\n      ${body}\n    </mj-column>`;
}

function renderSection(section: Section, opts: RenderOptions): string {
  const a = attrs({
    'background-color': section.style.backgroundColor,
    padding: padding(section.style) ?? '0',
    'css-class': 'fm-section',
  });
  const columns = section.columns.map((c) => renderColumn(c, opts)).join('\n    ');
  return `<mj-section ${a}>\n    ${columns}\n  </mj-section>`;
}

export function renderMjml(doc: EmailDocument, opts: RenderOptions = {}): string {
  const head = renderHead(doc, opts);
  const sections = doc.sections.map((s) => renderSection(s, opts)).join('\n  ');
  const body = attrs({ 'background-color': doc.backgroundColor, width: px(doc.width), 'css-class': 'fm-body' });
  return `<mjml>
  ${head}
  <mj-body ${body}>
  ${sections}
  </mj-body>
</mjml>`;
}
