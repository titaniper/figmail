import JSZip from 'jszip';
import mjml2html from 'mjml-browser';
import type { EmailDocument, ImageContent } from '../ir/types';
import type { FrameImage, MainToUi, UiToMain } from '../shared/messages';
import { renderMjml } from '../render/mjml';

const preview = document.getElementById('preview') as HTMLIFrameElement;
const source = document.getElementById('source') as HTMLTextAreaElement;
const status = document.getElementById('status') as HTMLDivElement;
const modeImage = document.getElementById('mode-image') as HTMLButtonElement;
const modeText = document.getElementById('mode-text') as HTMLButtonElement;
const tabPreview = document.getElementById('tab-preview') as HTMLButtonElement;
const tabSource = document.getElementById('tab-source') as HTMLButtonElement;
const copyBtn = document.getElementById('copy') as HTMLButtonElement;
const downloadBtn = document.getElementById('download') as HTMLButtonElement;
const resizeHandle = document.getElementById('resize') as HTMLDivElement;

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

function renderCurrent(): void {
  const doc = activeDoc();
  if (!doc) return;
  currentHtml = renderWith(doc, (image) => (image.bytes ? bytesToDataUrl(image.bytes) : (image.src ?? '')));
  preview.srcdoc = currentHtml;
  source.value = currentHtml;
  clearError();
}

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

tabPreview.onclick = () => {
  tabPreview.classList.add('active');
  tabSource.classList.remove('active');
  preview.classList.remove('hidden');
  source.classList.add('hidden');
};
tabSource.onclick = () => {
  tabSource.classList.add('active');
  tabPreview.classList.remove('active');
  source.classList.remove('hidden');
  preview.classList.add('hidden');
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
