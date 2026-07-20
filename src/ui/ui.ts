import JSZip from 'jszip';
import mjml2html from 'mjml-browser';
import type { EmailDocument, ImageContent } from '../ir/types';
import type { FrameImage, MainToUi, UiToMain } from '../shared/messages';
import { renderMjml } from '../render/mjml';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const preview = $<HTMLIFrameElement>('preview');
const source = $<HTMLTextAreaElement>('source');
const status = $<HTMLDivElement>('status');
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

const EXPORT_DIR = 'figmail-export';
const IMAGE_DIR = 'images';

type Mode = 'image' | 'text';
let mode: Mode = 'image';
let textDoc: EmailDocument | undefined;
let imageDoc: EmailDocument | undefined;
let currentHtml = '';

function post(message: UiToMain) {
  parent.postMessage({ pluginMessage: message }, '*');
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

/** Wraps a full-frame raster into a one-image document — the pixel-exact mode. */
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
  for (const section of doc.sections) {
    for (const column of section.columns) {
      for (const content of column.contents) {
        if (content.type === 'image') images.push(content);
      }
    }
  }
  return images;
}

function renderWith(doc: EmailDocument, resolveSrc: (image: ImageContent) => string): string {
  for (const image of collectImages(doc)) image.src = resolveSrc(image);
  const mjml = renderMjml(doc);
  const { html, errors } = mjml2html(mjml, { validationLevel: 'soft' });
  if (errors.length) console.warn('MJML warnings', errors);
  return html;
}

function activeDoc(): EmailDocument | undefined {
  return mode === 'image' ? imageDoc : textDoc;
}

/** Match the preview iframe height to its content (re-measured after images load). */
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
  // Images (data URLs) settle a tick after load — re-measure once more.
  setTimeout(sizePreview, 300);
};

window.onmessage = (event: MessageEvent) => {
  const message = event.data.pluginMessage as MainToUi | undefined;
  if (!message) return;
  switch (message.type) {
    case 'document':
      textDoc = message.doc;
      imageDoc = frameToDocument(message.frame);
      renderCurrent();
      break;
    case 'error':
      showError(message.message);
      break;
  }
};

function setMode(next: Mode): void {
  mode = next;
  modeImage.classList.toggle('active', next === 'image');
  modeText.classList.toggle('active', next === 'text');
  renderCurrent();
}
modeImage.onclick = () => setMode('image');
modeText.onclick = () => setMode('text');

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

// Sender / subject fields drive the client-chrome header.
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

tabPreview.onclick = () => {
  tabPreview.classList.add('active');
  tabSource.classList.remove('active');
  clientView.classList.remove('hidden');
  source.classList.add('hidden');
};
tabSource.onclick = () => {
  tabSource.classList.add('active');
  tabPreview.classList.remove('active');
  source.classList.remove('hidden');
  clientView.classList.add('hidden');
};

copyBtn.onclick = async () => {
  if (!currentHtml) return;
  await navigator.clipboard.writeText(currentHtml);
  post({ type: 'notify', message: 'HTML copied (images inlined)' });
};

// Export a zip folder: email.html referencing images/<id>.png + those PNG files.
downloadBtn.onclick = async () => {
  const doc = activeDoc();
  if (!doc) return;

  const html = renderWith(doc, (image) => `${IMAGE_DIR}/${image.id}.png`);

  const zip = new JSZip();
  const root = zip.folder(EXPORT_DIR)!;
  root.file('email.html', html);
  const imageFolder = root.folder(IMAGE_DIR)!;
  for (const image of collectImages(doc)) {
    if (image.bytes) imageFolder.file(`${image.id}.png`, image.bytes);
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

// Drag the bottom-right handle to resize the plugin window.
resizeHandle.onpointerdown = (event) => {
  event.preventDefault();
  const startX = event.clientX;
  const startY = event.clientY;
  const startW = window.innerWidth;
  const startH = window.innerHeight;
  const onMove = (move: PointerEvent) => {
    post({
      type: 'resize',
      width: startW + (move.clientX - startX),
      height: startH + (move.clientY - startY),
    });
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
};

post({ type: 'ready' });
