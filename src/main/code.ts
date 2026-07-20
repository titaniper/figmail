import type { MainToUi, UiToMain } from '../shared/messages';
import { buildDocument } from './traverse';

figma.showUI(__html__, { width: 720, height: 900, title: 'Figmail' });

function post(message: MainToUi) {
  figma.ui.postMessage(message);
}

async function run() {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    post({ type: 'error', message: 'Select a frame to export.' });
    return;
  }

  const node = selection[0];
  try {
    const doc = await buildDocument(node);
    // Also raster the whole frame for the pixel-exact mode.
    const bytes = await (
      node as SceneNode & { exportAsync: (s: ExportSettingsImage) => Promise<Uint8Array> }
    ).exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } });
    post({
      type: 'document',
      doc,
      frame: { bytes, width: Math.round(node.width), height: Math.round(node.height) },
    });
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
}

figma.ui.onmessage = (message: UiToMain) => {
  switch (message.type) {
    case 'ready':
      void run();
      break;
    case 'resize':
      figma.ui.resize(Math.max(320, message.width), Math.max(320, message.height));
      break;
    case 'notify':
      figma.notify(message.message);
      break;
  }
};

figma.on('selectionchange', () => {
  void run();
});
