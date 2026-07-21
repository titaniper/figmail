import JSZip from 'jszip';
import mjml2html from 'mjml-browser';
import type { EmailDocument, ImageContent } from '../ir/types';
import type {
  FrameImage,
  MainToUi,
  NodeData,
  SelectedNodeInfo,
  TemplateData,
  TemplateRef,
  TemplateVariable,
  TextSegment,
  UiToMain,
} from '../shared/messages';
import { renderMjml, type RenderOptions } from '../render/mjml';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const preview = $<HTMLIFrameElement>('preview');
const source = $<HTMLTextAreaElement>('source');
const status = $<HTMLDivElement>('status');
const workarea = $<HTMLDivElement>('workarea');
const modeImage = $<HTMLButtonElement>('mode-image');
const modeText = $<HTMLButtonElement>('mode-text');
const themeLight = $<HTMLButtonElement>('theme-light');
const themeDark = $<HTMLButtonElement>('theme-dark');
const clientSelect = $<HTMLSelectElement>('client');
const clientView = $<HTMLDivElement>('client-view');
const tabPreview = $<HTMLButtonElement>('tab-preview');
const tabSource = $<HTMLButtonElement>('tab-source');
const copyBtn = $<HTMLButtonElement>('copy');
const downloadBtn = $<HTMLButtonElement>('download');
const resizeHandle = $<HTMLDivElement>('resize');
const subjectInput = $<HTMLInputElement>('subject');
const fromInput = $<HTMLInputElement>('from');
const mailSubject = $<HTMLDivElement>('mail-subject');
const mailFromName = document.querySelector('#mail-from .name') as HTMLSpanElement;
const mailFromAddr = document.querySelector('#mail-from .addr') as HTMLSpanElement;
const avatar = $<HTMLDivElement>('avatar');
const varMockup = $<HTMLButtonElement>('var-mockup');
const varVars = $<HTMLButtonElement>('var-vars');
const selectionBody = $<HTMLDivElement>('selection-body');
const variablesList = $<HTMLDivElement>('variables-list');
const templateSelect = $<HTMLSelectElement>('template-select');
const templateName = $<HTMLInputElement>('template-name');
const templateRename = $<HTMLButtonElement>('template-rename');
const templateDelete = $<HTMLButtonElement>('template-delete');
const templateAdd = $<HTMLButtonElement>('template-add');
const newvarName = $<HTMLInputElement>('newvar-name');
const newvarType = $<HTMLSelectElement>('newvar-type');
const newvarAdd = $<HTMLButtonElement>('newvar-add');
const onboarding = $<HTMLDivElement>('onboarding');

const EXPORT_DIR = 'figmail-export';
const IMAGE_DIR = 'images';

type Mode = 'image' | 'text';
let mode: Mode = 'image';
let variablesMode = false;
let textDoc: EmailDocument | undefined;
let imageDoc: EmailDocument | undefined;
let selectedNode: SelectedNodeInfo | null = null;
let template: TemplateData = { variables: [] };
let templates: TemplateRef[] = [];
let currentTemplateId: string | null = null;
let candidate: TemplateRef | null = null;
let hasDocument = false;
let darkPreview = false;
let currentHtml = '';

function post(message: UiToMain) {
  parent.postMessage({ pluginMessage: message }, '*');
}

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showError(message: string) {
  status.textContent = message;
  status.classList.remove('hidden');
}
function clearError() {
  status.classList.add('hidden');
}

function bytesToDataUrl(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return `data:image/png;base64,${btoa(binary)}`;
}

function frameToDocument(frame: FrameImage): EmailDocument {
  return {
    width: frame.width,
    backgroundColor: '#ffffff',
    sections: [
      {
        type: 'section',
        style: {},
        columns: [
          {
            type: 'column',
            style: {},
            contents: [
              {
                type: 'image',
                id: 'frame',
                bytes: frame.bytes,
                width: frame.width,
                height: frame.height,
                alt: 'email',
              },
            ],
          },
        ],
      },
    ],
  };
}

function collectImages(doc: EmailDocument): ImageContent[] {
  const images: ImageContent[] = [];
  for (const section of doc.sections)
    for (const column of section.columns)
      for (const content of column.contents) if (content.type === 'image') images.push(content);
  return images;
}

// --- variables model -------------------------------------------------------

interface DisplayVar {
  name: string;
  type: TemplateVariable['type'];
  value?: string;
  sample?: string;
  bound: boolean;
}

/** Variable names/types/samples inferred from bindings and text runs in the document. */
function boundVariables(doc: EmailDocument | undefined): DisplayVar[] {
  if (!doc) return [];
  const byName = new Map<string, DisplayVar>();
  const add = (name: string | undefined, type: DisplayVar['type'], sample?: string) => {
    if (name && !byName.has(name)) byName.set(name, { name, type, sample, bound: true });
  };
  for (const section of doc.sections)
    for (const column of section.columns)
      for (const content of column.contents) {
        if (content.type === 'text') {
          for (const run of content.runs) {
            add(run.var, 'text', run.text);
            add(run.link?.var, 'url', run.link?.href);
          }
        } else if (content.type === 'image' && content.binding) {
          add(content.binding.name, 'image', content.binding.sample);
        } else if (content.type === 'button' && content.binding) {
          add(content.binding.name, 'url', content.binding.sample);
        }
      }
  return [...byName.values()];
}

/** The full variable set shown to the user: bound + explicitly declared. */
function displayVariables(): DisplayVar[] {
  const byName = new Map<string, DisplayVar>();
  for (const v of boundVariables(textDoc)) byName.set(v.name, v);
  for (const v of template.variables) {
    const existing = byName.get(v.name);
    if (existing) existing.value = v.value;
    else byName.set(v.name, { name: v.name, type: v.type, value: v.value, bound: false });
  }
  return [...byName.values()];
}

function valuesMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const v of template.variables) if (v.value) map[v.name] = v.value;
  return map;
}

function upsertVariable(name: string, patch: Partial<TemplateVariable>): void {
  const existing = template.variables.find((v) => v.name === name);
  if (existing) Object.assign(existing, patch);
  else template.variables.push({ name, type: patch.type ?? 'text', value: patch.value });
  saveTemplate();
}

function removeVariable(name: string): void {
  template.variables = template.variables.filter((v) => v.name !== name);
  saveTemplate();
}

function saveTemplate(): void {
  post({ type: 'saveTemplate', data: template });
}

function opts(): RenderOptions {
  return { variables: mode === 'text' && variablesMode, values: valuesMap() };
}

function renderWith(doc: EmailDocument, resolveSrc: (image: ImageContent) => string, forceDark = false): string {
  for (const image of collectImages(doc)) image.src = resolveSrc(image);
  const { html, errors } = mjml2html(renderMjml(doc, { ...opts(), forceDark }), { validationLevel: 'soft' });
  if (errors.length) console.warn('MJML warnings', errors);
  return html;
}

function activeDoc(): EmailDocument | undefined {
  return mode === 'image' ? imageDoc : textDoc;
}

function sizePreview(): void {
  const doc = preview.contentDocument;
  if (doc) preview.style.height = `${doc.documentElement.scrollHeight}px`;
}

function renderCurrent(): void {
  const doc = activeDoc();
  if (!doc) return;
  // Preview simulates dark by applying overrides inline; the HTML tab/export use a media query.
  const previewHtml = renderWith(
    doc,
    (image) => (image.bytes ? bytesToDataUrl(image.bytes) : (image.src ?? '')),
    darkPreview,
  );
  const exportHtml = darkPreview
    ? renderWith(doc, (image) => (image.bytes ? bytesToDataUrl(image.bytes) : (image.src ?? '')), false)
    : previewHtml;
  currentHtml = exportHtml;
  preview.srcdoc = previewHtml;
  source.value = exportHtml;
  clearError();
}

preview.onload = () => {
  sizePreview();
  setTimeout(sizePreview, 300);
};

// --- variables panel -------------------------------------------------------

function variableNamesDatalist(): string {
  const names = displayVariables()
    .map((v) => `<option value="${esc(v.name)}"></option>`)
    .join('');
  return `<datalist id="var-names">${names}</datalist>`;
}

function renderVariablesList(): void {
  const vars = displayVariables();
  if (vars.length === 0) {
    variablesList.className = 'muted';
    variablesList.textContent = 'None yet. Add one above, or bind a layer.';
    return;
  }
  variablesList.className = '';
  variablesList.innerHTML = vars
    .map(
      (v) =>
        `<div class="var-item">
          <button class="var-del" data-name="${esc(v.name)}">remove</button>
          <div><code>{{ ${esc(v.name)} }}</code> <span class="meta">${v.type}${
            v.bound ? '' : ' · unbound'
          }${v.sample ? ` · ${esc(v.sample.slice(0, 32))}` : ''}</span></div>
          <input class="var-value" data-name="${esc(v.name)}" placeholder="value (applied)" value="${esc(
            v.value ?? '',
          )}">
        </div>`,
    )
    .join('');

  variablesList.querySelectorAll<HTMLInputElement>('.var-value').forEach((input) => {
    input.oninput = () => {
      upsertVariable(input.dataset.name as string, { value: input.value || undefined });
      if (!variablesMode) renderCurrent(); // applied values show in Mockup
    };
  });
  variablesList.querySelectorAll<HTMLButtonElement>('.var-del').forEach((btn) => {
    btn.onclick = () => {
      removeVariable(btn.dataset.name as string);
      renderVariablesList();
      renderCurrent();
    };
  });
}

function sendBind(data: NodeData): void {
  if (!selectedNode) return;
  post({ type: 'bind', nodeId: selectedNode.id, data });
}

function renderSelectionPanel(): void {
  const node = selectedNode;
  if (!node || node.kind === 'other') {
    selectionBody.className = 'muted';
    selectionBody.textContent = 'Select a text, button, or image layer in Figma.';
    return;
  }
  selectionBody.className = '';
  if (node.kind === 'text') renderTextBinding(node);
  else renderWholeBinding(node);
}

/** Text node: highlight a substring in the panel and bind it as a variable or link. */
function renderTextBinding(node: SelectedNodeInfo): void {
  const text = node.text ?? '';
  const segments = node.data.segments ?? [];

  selectionBody.innerHTML = `
    ${variableNamesDatalist()}
    <div class="kind-chip">TEXT</div>
    <div class="field"><label>Highlight part of the text below, then bind it</label>
      <div id="text-sel" class="textsel">${esc(text)}</div></div>
    <div id="sel-info" class="muted" style="margin-bottom:6px">Nothing highlighted.</div>
    <div class="field"><input id="seg-var" list="var-names" placeholder="variable name"></div>
    <div class="row-btns" style="margin-bottom:6px">
      <button class="bind" id="mk-var">Make variable</button>
    </div>
    <div class="field"><input id="seg-href" placeholder="link href (https://...)"></div>
    <div class="field"><input id="seg-linkvar" list="var-names" placeholder="or URL variable"></div>
    <div class="row-btns"><button class="bind" id="mk-link">Make link</button></div>
    <div class="panel-title" style="margin-top:10px">Bound ranges</div>
    <div id="seg-list"></div>`;

  const textSel = document.getElementById('text-sel') as HTMLDivElement;
  const selInfo = document.getElementById('sel-info') as HTMLDivElement;
  const segList = document.getElementById('seg-list') as HTMLDivElement;
  let pending: { start: number; end: number } | null = null;

  const readSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      pending = null;
      selInfo.textContent = 'Nothing highlighted.';
      return;
    }
    const range = sel.getRangeAt(0);
    if (!textSel.contains(range.startContainer) || !textSel.contains(range.endContainer)) return;
    const start = Math.min(range.startOffset, range.endOffset);
    const end = Math.max(range.startOffset, range.endOffset);
    if (end <= start) {
      pending = null;
      return;
    }
    pending = { start, end };
    selInfo.textContent = `Selected: “${text.slice(start, end)}”`;
  };
  textSel.onmouseup = readSelection;
  textSel.onkeyup = readSelection;

  const applySegment = (seg: TextSegment) => {
    sendBind({ segments: [...segments, seg] });
  };

  (document.getElementById('mk-var') as HTMLButtonElement).onclick = () => {
    const name = (document.getElementById('seg-var') as HTMLInputElement).value.trim();
    if (!pending) return post({ type: 'notify', message: 'Highlight text first.' });
    if (!name) return post({ type: 'notify', message: 'Enter a variable name.' });
    applySegment({ start: pending.start, end: pending.end, var: name });
  };
  (document.getElementById('mk-link') as HTMLButtonElement).onclick = () => {
    const href = (document.getElementById('seg-href') as HTMLInputElement).value.trim() || undefined;
    const linkVar = (document.getElementById('seg-linkvar') as HTMLInputElement).value.trim() || undefined;
    if (!pending) return post({ type: 'notify', message: 'Highlight text first.' });
    if (!href && !linkVar) return post({ type: 'notify', message: 'Enter a href or URL variable.' });
    applySegment({ start: pending.start, end: pending.end, link: { href, var: linkVar } });
  };

  if (segments.length === 0) {
    segList.className = 'muted';
    segList.textContent = 'None yet.';
  } else {
    segList.className = '';
    segList.innerHTML = segments
      .map((s, idx) => {
        const label = s.var ? `{{ ${esc(s.var)} }}` : `link${s.link?.var ? ` → {{ ${esc(s.link.var)} }}` : ''}`;
        return `<div class="var-item"><button class="seg-del" data-idx="${idx}">remove</button>
          <div><code>${label}</code> <span class="meta">“${esc(text.slice(s.start, s.end))}”</span></div></div>`;
      })
      .join('');
    segList.querySelectorAll<HTMLButtonElement>('.seg-del').forEach((btn) => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.idx);
        sendBind({ segments: segments.filter((_, i) => i !== idx) });
      };
    });
  }
}

/** Button / image node: bind the whole node's link or image src to a variable. */
function renderWholeBinding(node: SelectedNodeInfo): void {
  const b = node.data.binding;
  const list = variableNamesDatalist();

  if (node.kind === 'button') {
    selectionBody.innerHTML = `
      ${list}
      <div class="kind-chip">BUTTON / LINK</div>
      <div class="field"><label>Link (href)</label><input id="b-href" placeholder="https://..." value="${esc(node.data.href ?? b?.sample ?? '')}"></div>
      <div class="field"><label>URL variable (optional)</label><input id="b-name" list="var-names" placeholder="e.g. portalUrl" value="${esc(b?.name ?? '')}"></div>
      <div class="row-btns"><button class="bind" id="b-bind">Save</button><button class="unbind" id="b-unbind">Clear</button></div>`;
  } else {
    selectionBody.innerHTML = `
      ${list}
      <div class="kind-chip">IMAGE</div>
      <div class="field"><label>Image URL variable</label><input id="b-name" list="var-names" placeholder="e.g. heroImageUrl" value="${esc(b?.name ?? '')}"></div>
      <div class="row-btns"><button class="bind" id="b-bind">Bind</button><button class="unbind" id="b-unbind">Unbind</button></div>`;
  }

  const nameInput = document.getElementById('b-name') as HTMLInputElement | null;
  const hrefInput = document.getElementById('b-href') as HTMLInputElement | null;

  (document.getElementById('b-bind') as HTMLButtonElement).onclick = () => {
    const name = nameInput?.value.trim() ?? '';
    const href = hrefInput?.value.trim() || undefined;
    if (node.kind === 'button') {
      sendBind({ href, binding: name ? { name, type: 'url', sample: href } : undefined });
    } else {
      if (!name) return post({ type: 'notify', message: 'Enter a variable name.' });
      sendBind({ binding: { name, type: 'image' } });
    }
  };
  (document.getElementById('b-unbind') as HTMLButtonElement).onclick = () => sendBind({});
}

// --- template bar ----------------------------------------------------------

function renderTemplateBar(): void {
  templateSelect.innerHTML = templates
    .map((t) => `<option value="${esc(t.id)}"${t.id === currentTemplateId ? ' selected' : ''}>${esc(t.name)}</option>`)
    .join('');
  const current = templates.find((t) => t.id === currentTemplateId);
  templateName.value = current?.name ?? '';
  const empty = templates.length === 0;
  templateSelect.disabled = empty;
  templateRename.disabled = !current;
  templateDelete.disabled = !current;
}

// --- onboarding (empty state) ---------------------------------------------

function renderOnboarding(): void {
  const parts: string[] = ['<h2>Figmail</h2>', '<p class="tagline">Turn a Figma frame into an email.</p>'];

  if (templates.length > 0) {
    parts.push('<p>Open a saved email</p>');
    parts.push(
      `<div class="ob-list">${templates
        .map((t) => `<button class="ob-open" data-id="${esc(t.id)}"><span>${esc(t.name)}</span><span>→</span></button>`)
        .join('')}</div>`,
    );
  }

  if (candidate) {
    parts.push(`<p>${templates.length ? 'Or create a new one' : 'Create from your selection'}</p>`);
    parts.push(`<button class="ob-create">＋ Create “${esc(candidate.name)}”</button>`);
  } else {
    parts.push(
      `<p class="ob-hint">Select a frame in Figma${templates.length ? ' to create a new email' : ' to get started'}.</p>`,
    );
  }

  onboarding.innerHTML = `<div class="ob-card">${parts.join('')}</div>`;
  onboarding.querySelectorAll<HTMLButtonElement>('.ob-open').forEach((btn) => {
    btn.onclick = () => post({ type: 'selectTemplate', id: btn.dataset.id as string });
  });
  const createBtn = onboarding.querySelector('.ob-create') as HTMLButtonElement | null;
  if (createBtn) createBtn.onclick = () => post({ type: 'capture' });

  onboarding.classList.remove('hidden');
}

// --- messages --------------------------------------------------------------

function applySubjectToChrome(): void {
  mailSubject.textContent = subjectInput.value || 'No subject';
}
function applyFromToChrome(): void {
  const match = fromInput.value.match(/^\s*(.*?)\s*<(.+?)>\s*$/);
  const name = match ? match[1] : fromInput.value;
  const addr = match ? match[2] : '';
  mailFromName.textContent = name || 'Sender';
  mailFromAddr.textContent = addr ? `<${addr}>` : '';
  avatar.textContent = (name || 'S').trim().charAt(0).toUpperCase();
}

window.onmessage = (event: MessageEvent) => {
  const message = event.data.pluginMessage as MainToUi | undefined;
  if (!message) return;
  switch (message.type) {
    case 'document':
      textDoc = message.doc;
      imageDoc = frameToDocument(message.frame);
      template = message.template;
      if (template.subject !== undefined) subjectInput.value = template.subject;
      if (template.from !== undefined) fromInput.value = template.from;
      applySubjectToChrome();
      applyFromToChrome();
      hasDocument = true;
      onboarding.classList.add('hidden');
      renderCurrent();
      renderVariablesList();
      break;
    case 'templates':
      templates = message.list;
      currentTemplateId = message.currentId;
      renderTemplateBar();
      if (message.currentId === null) hasDocument = false;
      if (!hasDocument) renderOnboarding();
      break;
    case 'idle':
      candidate = message.candidate;
      if (!hasDocument) renderOnboarding();
      break;
    case 'selection':
      selectedNode = message.node;
      renderSelectionPanel();
      break;
    case 'error':
      showError(message.message);
      break;
  }
};

// --- controls --------------------------------------------------------------

function setMode(next: Mode): void {
  mode = next;
  modeImage.classList.toggle('active', next === 'image');
  modeText.classList.toggle('active', next === 'text');
  renderCurrent();
}
modeImage.onclick = () => setMode('image');
modeText.onclick = () => setMode('text');

function setVarMode(vars: boolean): void {
  variablesMode = vars;
  varVars.classList.toggle('active', vars);
  varMockup.classList.toggle('active', !vars);
  if (mode !== 'text') setMode('text');
  else renderCurrent();
}
varMockup.onclick = () => setVarMode(false);
varVars.onclick = () => setVarMode(true);

function setTheme(dark: boolean): void {
  darkPreview = dark;
  clientView.classList.toggle('dark', dark);
  themeDark.classList.toggle('active', dark);
  themeLight.classList.toggle('active', !dark);
  renderCurrent();
}
themeLight.onclick = () => setTheme(false);
themeDark.onclick = () => setTheme(true);

clientSelect.onchange = () => {
  clientView.dataset.client = clientSelect.value;
};

subjectInput.oninput = () => {
  applySubjectToChrome();
  template.subject = subjectInput.value;
  saveTemplate();
};
fromInput.oninput = () => {
  applyFromToChrome();
  template.from = fromInput.value;
  saveTemplate();
};

// Template bar
templateAdd.onclick = () => post({ type: 'capture' });
templateSelect.onchange = () => post({ type: 'selectTemplate', id: templateSelect.value });
templateRename.onclick = () => {
  if (currentTemplateId) post({ type: 'renameTemplate', id: currentTemplateId, name: templateName.value.trim() });
};
templateDelete.onclick = () => {
  if (currentTemplateId) post({ type: 'deleteTemplate', id: currentTemplateId });
};

// New variable
newvarAdd.onclick = () => {
  const name = newvarName.value.trim();
  if (!name) return post({ type: 'notify', message: 'Enter a variable name.' });
  upsertVariable(name, { type: newvarType.value as TemplateVariable['type'] });
  newvarName.value = '';
  renderVariablesList();
};

tabPreview.onclick = () => {
  tabPreview.classList.add('active');
  tabSource.classList.remove('active');
  workarea.classList.remove('hidden');
  source.classList.add('hidden');
};
tabSource.onclick = () => {
  tabSource.classList.add('active');
  tabPreview.classList.remove('active');
  source.classList.remove('hidden');
  workarea.classList.add('hidden');
};

copyBtn.onclick = async () => {
  if (!currentHtml) return;
  await navigator.clipboard.writeText(currentHtml);
  post({ type: 'notify', message: 'HTML copied' });
};

downloadBtn.onclick = async () => {
  const doc = activeDoc();
  if (!doc) return;
  const useVars = opts().variables === true;

  const html = renderWith(doc, (image) => `${IMAGE_DIR}/${image.id}.png`);

  const zip = new JSZip();
  const root = zip.folder(EXPORT_DIR)!;
  root.file('email.html', html);
  const imageFolder = root.folder(IMAGE_DIR)!;
  for (const image of collectImages(doc)) {
    if (image.bytes && !(useVars && image.binding)) imageFolder.file(`${image.id}.png`, image.bytes);
  }

  const vars = displayVariables().map((v) => ({ name: v.name, type: v.type, sample: v.sample, value: v.value ?? '' }));
  if (vars.length > 0) root.file('variables.json', JSON.stringify(vars, null, 2));

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${EXPORT_DIR}.zip`;
  link.click();
  URL.revokeObjectURL(url);
  post({ type: 'notify', message: 'Exported figmail-export.zip' });
};

resizeHandle.onpointerdown = (event) => {
  event.preventDefault();
  const startX = event.clientX;
  const startY = event.clientY;
  const startW = window.innerWidth;
  const startH = window.innerHeight;
  const onMove = (move: PointerEvent) => {
    post({ type: 'resize', width: startW + (move.clientX - startX), height: startH + (move.clientY - startY) });
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
};

post({ type: 'ready' });
