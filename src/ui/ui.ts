import JSZip from 'jszip';
import mjml2html from 'mjml-browser';
import type { EmailDocument, ImageContent } from '../ir/types';
import type { MainToUi, UiToMain } from '../shared/messages';
import { renderMjml } from '../render/mjml';

const preview = document.getElementById('preview') as HTMLIFrameElement;
const source = document.getElementById('source') as HTMLTextAreaElement;
const status = document.getElementById('status') as HTMLDivElement;
const tabPreview = document.getElementById('tab-preview') as HTMLButtonElement;
const tabSource = document.getElementById('tab-source') as HTMLButtonElement;
const copyBtn = document.getElementById('copy') as HTMLButtonElement;
const downloadBtn = document.getElementById('download') as HTMLButtonElement;

const EXPORT_DIR = 'figmail-export';
const IMAGE_DIR = 'images';

let currentDoc: EmailDocument | undefined;
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

/** Every image in the document, in document order. */
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

/** Render with each image `src` set by `resolveSrc(image)`. */
function renderWith(doc: EmailDocument, resolveSrc: (image: ImageContent) => string): string {
  for (const image of collectImages(doc)) image.src = resolveSrc(image);
  const mjml = renderMjml(doc);
  const { html, errors } = mjml2html(mjml, { validationLevel: 'soft' });
  if (errors.length) console.warn('MJML warnings', errors);
  return html;
}

function renderDocument(doc: EmailDocument): void {
  currentDoc = doc;
  // Preview embeds images inline so it renders with no external files.
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
      renderDocument(message.doc);
      break;
    case 'error':
      showError(message.message);
      break;
  }
};

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

// Export a zip folder: email.html referencing images/<id>.png + those PNG files,
// so the design reproduces exactly when the folder is served or opened.
downloadBtn.onclick = async () => {
  if (!currentDoc) return;

  const html = renderWith(currentDoc, (image) => `${IMAGE_DIR}/${image.id}.png`);

  const zip = new JSZip();
  const root = zip.folder(EXPORT_DIR)!;
  root.file('email.html', html);
  const imageFolder = root.folder(IMAGE_DIR)!;
  for (const image of collectImages(currentDoc)) {
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

post({ type: 'ready' });
