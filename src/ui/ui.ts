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

/** Resolve exported image bytes into data URLs so the preview renders offline. */
function resolveImages(doc: EmailDocument): void {
  for (const section of doc.sections) {
    for (const column of section.columns) {
      for (const content of column.contents) {
        if (content.type === 'image') {
          const image = content as ImageContent;
          if (image.bytes && !image.src) image.src = bytesToDataUrl(image.bytes);
        }
      }
    }
  }
}

function renderDocument(doc: EmailDocument): void {
  resolveImages(doc);
  const mjml = renderMjml(doc);
  const { html, errors } = mjml2html(mjml, { validationLevel: 'soft' });
  if (errors.length) {
    console.warn('MJML warnings', errors);
  }
  currentHtml = html;
  preview.srcdoc = html;
  source.value = html;
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
  post({ type: 'notify', message: 'HTML copied to clipboard' });
};

downloadBtn.onclick = () => {
  if (!currentHtml) return;
  const blob = new Blob([currentHtml], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'email.html';
  link.click();
  URL.revokeObjectURL(url);
};

post({ type: 'ready' });
