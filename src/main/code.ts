import type { MainToUi, SelectedNodeInfo, TemplateRef, UiToMain } from '../shared/messages';
import { buildDocument, PLUGIN_DATA_KEY, PLUGIN_TEMPLATE_KEY, readNodeData, readTemplateData } from './traverse';

figma.showUI(__html__, { width: 720, height: 900, title: 'Figmail' });

const REGISTRY_KEY = 'figmail:templates';

// The captured template root is fixed on capture; selecting a child afterwards
// targets it for variable binding without changing the template.
let rootId: string | undefined;

function post(message: MainToUi) {
  figma.ui.postMessage(message);
}

function readRegistry(): TemplateRef[] {
  try {
    const raw = figma.currentPage.getPluginData(REGISTRY_KEY);
    return raw ? (JSON.parse(raw) as TemplateRef[]) : [];
  } catch {
    return [];
  }
}

function writeRegistry(list: TemplateRef[]) {
  figma.currentPage.setPluginData(REGISTRY_KEY, JSON.stringify(list));
}

function postTemplates() {
  post({ type: 'templates', list: readRegistry(), currentId: rootId ?? null });
}

/** A frame-like current selection that could be captured as a template. */
function candidateFromSelection(): TemplateRef | null {
  const selection = figma.currentPage.selection;
  if (selection.length === 1 && 'exportAsync' in selection[0]) {
    return { id: selection[0].id, name: selection[0].name || 'Untitled' };
  }
  return null;
}

function postIdle() {
  post({ type: 'idle', candidate: candidateFromSelection() });
}

/** If the current selection is (or sits inside) a saved template, return its id. */
function matchingTemplateId(): string | null {
  const ids = new Set(readRegistry().map((t) => t.id));
  let node: BaseNode | null = figma.currentPage.selection[0] ?? null;
  while (node) {
    if (ids.has(node.id)) return node.id;
    node = node.parent;
  }
  return null;
}

function nodeKind(node: SceneNode): SelectedNodeInfo['kind'] {
  if (node.type === 'TEXT') return 'text';
  if (/button|btn|cta/i.test(node.name)) return 'button';
  const isVector = ['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'LINE', 'ELLIPSE', 'POLYGON'].includes(node.type);
  const hasImageFill =
    'fills' in node && node.fills !== figma.mixed && (node.fills as readonly Paint[]).some((p) => p.type === 'IMAGE');
  return isVector || hasImageFill ? 'image' : 'other';
}

/** Capture a node as the active template, registering it if new. */
async function capture(node: SceneNode) {
  try {
    const doc = await buildDocument(node);
    const bytes = await (
      node as SceneNode & { exportAsync: (s: ExportSettingsImage) => Promise<Uint8Array> }
    ).exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } });

    rootId = node.id;
    const registry = readRegistry();
    if (!registry.some((t) => t.id === node.id)) {
      registry.push({ id: node.id, name: node.name || 'Untitled' });
      writeRegistry(registry);
    }

    post({
      type: 'document',
      doc,
      frame: { bytes, width: Math.round(node.width), height: Math.round(node.height) },
      template: readTemplateData(node),
    });
    postTemplates();
  } catch (error) {
    console.error('Figmail capture failed', error);
    post({ type: 'error', message: `Capture failed: ${error instanceof Error ? error.message : String(error)}` });
  }
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

/** Substitute applied variable values into a cloned text node. */
async function applyValuesToText(node: TextNode, values: Record<string, string>) {
  const segs = (readNodeData(node).segments ?? []).filter((s) => s.var).sort((a, b) => b.start - a.start); // right-to-left keeps earlier offsets valid
  if (segs.length === 0) return;

  const fontSegs = node.getStyledTextSegments(['fontName']);
  await Promise.all(fontSegs.map((s) => figma.loadFontAsync(s.fontName)));

  let chars = node.characters;
  for (const s of segs) {
    const value = values[s.var as string];
    if (value !== undefined && value !== '') chars = chars.slice(0, s.start) + value + chars.slice(s.end);
  }
  node.characters = chars;
}

async function applyValues(node: SceneNode, values: Record<string, string>) {
  if (node.type === 'TEXT') await applyValuesToText(node, values);
  if ('children' in node) for (const child of node.children) await applyValues(child, values);
}

/** Clone the captured frame beside the original with the applied values filled in. */
async function exportToFigma(values: Record<string, string>) {
  if (!rootId) return;
  const root = figma.getNodeById(rootId);
  if (!root || root.type === 'PAGE' || root.type === 'DOCUMENT' || !('clone' in root)) {
    post({ type: 'error', message: 'Capture a frame first.' });
    return;
  }
  const original = root as SceneNode & { clone: () => SceneNode };
  const clone = original.clone();
  clone.name = `${original.name} (filled)`;
  clone.x = original.x + original.width + 48;
  clone.y = original.y;
  await applyValues(clone, values);
  figma.currentPage.selection = [clone];
  figma.viewport.scrollAndZoomIntoView([clone]);
  figma.notify('Created a filled copy next to the original.');
}

async function recaptureRoot() {
  if (!rootId) return;
  const root = figma.getNodeById(rootId);
  if (root && 'exportAsync' in root) await capture(root as SceneNode);
}

async function captureById(id: string) {
  const node = figma.getNodeById(id);
  if (node && 'exportAsync' in node) {
    await capture(node as SceneNode);
  } else {
    // Node was deleted — drop it from the registry.
    writeRegistry(readRegistry().filter((t) => t.id !== id));
    post({ type: 'error', message: 'That frame no longer exists.' });
    postTemplates();
  }
}

figma.ui.onmessage = async (message: UiToMain) => {
  switch (message.type) {
    case 'ready': {
      // If the selection is already a saved template, open it; otherwise onboard.
      const match = matchingTemplateId();
      if (match) await captureById(match);
      else {
        postTemplates();
        postIdle();
      }
      reflectSelection();
      break;
    }
    case 'capture': {
      const selection = figma.currentPage.selection;
      if (selection.length === 0) post({ type: 'error', message: 'Select a frame to capture.' });
      else await capture(selection[0]);
      break;
    }
    case 'selectTemplate':
      await captureById(message.id);
      break;
    case 'renameTemplate': {
      const registry = readRegistry().map((t) => (t.id === message.id ? { ...t, name: message.name || t.name } : t));
      writeRegistry(registry);
      postTemplates();
      break;
    }
    case 'deleteTemplate': {
      writeRegistry(readRegistry().filter((t) => t.id !== message.id));
      if (rootId === message.id) rootId = undefined;
      postTemplates();
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
    case 'saveTemplate': {
      if (rootId) {
        const root = figma.getNodeById(rootId);
        if (root) root.setPluginData(PLUGIN_TEMPLATE_KEY, JSON.stringify(message.data));
      }
      break;
    }
    case 'exportToFigma':
      await exportToFigma(message.values);
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
  // While idle, selecting a saved frame opens it directly; otherwise refresh onboarding.
  if (!rootId) {
    const match = matchingTemplateId();
    if (match) void captureById(match);
    else postIdle();
  }
  reflectSelection();
});
