import JSZip from 'jszip';
import mjml2html from 'mjml-browser';
import type { Binding, EmailDocument, ImageContent } from '../ir/types';
import type { FrameImage, MainToUi, NodeData, SelectedNodeInfo, UiToMain } from '../shared/messages';
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
const captureBtn = $<HTMLButtonElement>('capture');
const varMockup = $<HTMLButtonElement>('var-mockup');
const varVars = $<HTMLButtonElement>('var-vars');
const selectionBody = $<HTMLDivElement>('selection-body');
const variablesList = $<HTMLDivElement>('variables-list');

const EXPORT_DIR = 'figmail-export';
const IMAGE_DIR = 'images';

type Mode = 'image' | 'text';
let mode: Mode = 'image';
let variablesMode = false;
let textDoc: EmailDocument | undefined;
let imageDoc: EmailDocument | undefined;
let selectedNode: SelectedNodeInfo | null = null;
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

function opts(): RenderOptions {
  return { variables: mode === 'text' && variablesMode };
}

function renderWith(doc: EmailDocument, resolveSrc: (image: ImageContent) => string): string {
  for (const image of collectImages(doc)) image.src = resolveSrc(image);
  const { html, errors } = mjml2html(renderMjml(doc, opts()), { validationLevel: 'soft' });
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
  currentHtml = renderWith(doc, (image) => (image.bytes ? bytesToDataUrl(image.bytes) : (image.src ?? '')));
  preview.srcdoc = currentHtml;
  source.value = currentHtml;
  clearError();
}

preview.onload = () => {
  sizePreview();
  setTimeout(sizePreview, 300);
};

// --- variables panel -------------------------------------------------------

function gatherVariables(doc: EmailDocument | undefined): Binding[] {
  if (!doc) return [];
  const byName = new Map<string, Binding>();
  for (const section of doc.sections)
    for (const column of section.columns)
      for (const content of column.contents) {
        const binding = 'binding' in content ? content.binding : undefined;
        if (binding && !byName.has(binding.name)) byName.set(binding.name, binding);
      }
  return [...byName.values()];
}

function renderVariablesList(): void {
  const vars = gatherVariables(textDoc);
  if (vars.length === 0) {
    variablesList.className = 'muted';
    variablesList.textContent = 'None yet. Select a layer and bind one.';
    return;
  }
  variablesList.className = '';
  variablesList.innerHTML = vars
    .map(
      (v) =>
        `<div class="var-item"><code>{{ ${esc(v.name)} }}</code> <span class="meta">${v.type}${
          v.sample ? ` · ${esc(v.sample.slice(0, 40))}` : ''
        }</span></div>`,
    )
    .join('');
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
  const b = node.data.binding;

  if (node.kind === 'text') {
    selectionBody.innerHTML = `
      <div class="kind-chip">TEXT</div>
      <div class="field"><label>Sample (mockup)</label><input id="b-sample" value="${esc(node.text ?? '')}" readonly></div>
      <div class="field"><label>Variable name</label><input id="b-name" placeholder="e.g. customerName" value="${esc(b?.name ?? '')}"></div>
      <div class="row-btns"><button class="bind" id="b-bind">Bind</button><button class="unbind" id="b-unbind">Unbind</button></div>`;
  } else if (node.kind === 'button') {
    selectionBody.innerHTML = `
      <div class="kind-chip">BUTTON / LINK</div>
      <div class="field"><label>Link (href)</label><input id="b-href" placeholder="https://..." value="${esc(node.data.href ?? b?.sample ?? '')}"></div>
      <div class="field"><label>URL variable (optional)</label><input id="b-name" placeholder="e.g. portalUrl" value="${esc(b?.name ?? '')}"></div>
      <div class="row-btns"><button class="bind" id="b-bind">Save</button><button class="unbind" id="b-unbind">Clear</button></div>`;
  } else {
    selectionBody.innerHTML = `
      <div class="kind-chip">IMAGE</div>
      <div class="field"><label>Image URL variable</label><input id="b-name" placeholder="e.g. heroImageUrl" value="${esc(b?.name ?? '')}"></div>
      <div class="row-btns"><button class="bind" id="b-bind">Bind</button><button class="unbind" id="b-unbind">Unbind</button></div>`;
  }

  const nameInput = document.getElementById('b-name') as HTMLInputElement | null;
  const hrefInput = document.getElementById('b-href') as HTMLInputElement | null;

  (document.getElementById('b-bind') as HTMLButtonElement).onclick = () => {
    const name = nameInput?.value.trim() ?? '';
    const href = hrefInput?.value.trim() || undefined;
    if (node.kind === 'text') {
      if (!name) return post({ type: 'notify', message: 'Enter a variable name.' });
      sendBind({ binding: { name, type: 'text', sample: node.text } });
    } else if (node.kind === 'button') {
      const binding: Binding | undefined = name ? { name, type: 'url', sample: href } : undefined;
      sendBind({ href, binding });
    } else {
      if (!name) return post({ type: 'notify', message: 'Enter a variable name.' });
      sendBind({ binding: { name, type: 'image' } });
    }
  };
  (document.getElementById('b-unbind') as HTMLButtonElement).onclick = () => sendBind({});
}

// --- messages --------------------------------------------------------------

window.onmessage = (event: MessageEvent) => {
  const message = event.data.pluginMessage as MainToUi | undefined;
  if (!message) return;
  switch (message.type) {
    case 'document':
      textDoc = message.doc;
      imageDoc = frameToDocument(message.frame);
      renderCurrent();
      renderVariablesList();
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
  if (mode !== 'text')
    setMode('text'); // variables only apply to Text mode
  else renderCurrent();
}
varMockup.onclick = () => setVarMode(false);
varVars.onclick = () => setVarMode(true);

function setTheme(dark: boolean): void {
  clientView.classList.toggle('dark', dark);
  themeDark.classList.toggle('active', dark);
  themeLight.classList.toggle('active', !dark);
}
themeLight.onclick = () => setTheme(false);
themeDark.onclick = () => setTheme(true);

clientSelect.onchange = () => {
  clientView.dataset.client = clientSelect.value;
};

subjectInput.oninput = () => {
  mailSubject.textContent = subjectInput.value || 'No subject';
};
fromInput.oninput = () => {
  const match = fromInput.value.match(/^\s*(.*?)\s*<(.+?)>\s*$/);
  const name = match ? match[1] : fromInput.value;
  const addr = match ? match[2] : '';
  mailFromName.textContent = name || 'Sender';
  mailFromAddr.textContent = addr ? `<${addr}>` : '';
  avatar.textContent = (name || 'S').trim().charAt(0).toUpperCase();
};

captureBtn.onclick = () => post({ type: 'capture' });

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
    // Bound images are emitted as {{ variable }} in variables mode — no file needed.
    if (image.bytes && !(useVars && image.binding)) imageFolder.file(`${image.id}.png`, image.bytes);
  }

  const vars = gatherVariables(textDoc);
  if (vars.length > 0) {
    root.file('variables.json', JSON.stringify(vars, null, 2));
  }

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
