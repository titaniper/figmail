import type { MainToUi, SelectedNodeInfo, UiToMain } from '../shared/messages';
import { buildDocument, PLUGIN_DATA_KEY, readNodeData } from './traverse';

figma.showUI(__html__, { width: 720, height: 900, title: 'Figmail' });

// The captured template root is fixed on capture; selecting a child afterwards
// targets it for variable binding without changing the template.
let rootId: string | undefined;

function post(message: MainToUi) {
  figma.ui.postMessage(message);
}

function nodeKind(node: SceneNode): SelectedNodeInfo['kind'] {
  if (node.type === 'TEXT') return 'text';
  if (/button|btn|cta/i.test(node.name)) return 'button';
  const isVector = ['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'LINE', 'ELLIPSE', 'POLYGON'].includes(node.type);
  const hasImageFill =
    'fills' in node && node.fills !== figma.mixed && (node.fills as readonly Paint[]).some((p) => p.type === 'IMAGE');
  return isVector || hasImageFill ? 'image' : 'other';
}

async function capture(node: SceneNode) {
  rootId = node.id;
  const doc = await buildDocument(node);
  const bytes = await (
    node as SceneNode & { exportAsync: (s: ExportSettingsImage) => Promise<Uint8Array> }
  ).exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } });
  post({
    type: 'document',
    doc,
    frame: { bytes, width: Math.round(node.width), height: Math.round(node.height) },
  });
}

function reflectSelection() {
  const selection = figma.currentPage.selection;
  if (selection.length !== 1) {
    post({ type: 'selection', node: null });
    return;
  }
  const node = selection[0];
  post({
    type: 'selection',
    node: {
      id: node.id,
      name: node.name,
      kind: nodeKind(node),
      text: node.type === 'TEXT' ? node.characters : undefined,
      data: readNodeData(node),
    },
  });
}

async function recaptureRoot() {
  if (!rootId) return;
  const root = figma.getNodeById(rootId);
  if (root && 'exportAsync' in root) await capture(root as SceneNode);
}

figma.ui.onmessage = async (message: UiToMain) => {
  switch (message.type) {
    case 'ready': {
      const selection = figma.currentPage.selection;
      if (selection.length > 0) await capture(selection[0]);
      reflectSelection();
      break;
    }
    case 'capture': {
      const selection = figma.currentPage.selection;
      if (selection.length === 0) {
        post({ type: 'error', message: 'Select a frame to capture.' });
      } else {
        await capture(selection[0]);
      }
      break;
    }
    case 'bind': {
      const node = figma.getNodeById(message.nodeId);
      if (node) {
        const hasData = message.data.binding || message.data.href;
        node.setPluginData(PLUGIN_DATA_KEY, hasData ? JSON.stringify(message.data) : '');
        await recaptureRoot();
        reflectSelection();
      }
      break;
    }
    case 'resize':
      figma.ui.resize(Math.max(320, message.width), Math.max(320, message.height));
      break;
    case 'notify':
      figma.notify(message.message);
      break;
  }
};

figma.on('selectionchange', reflectSelection);
