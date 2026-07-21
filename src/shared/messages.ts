import type { Binding, EmailDocument } from '../ir/types';

// Contract for postMessage traffic between the plugin sandbox (main) and the
// iframe (UI). Both sides import this so the shape stays in sync.

/** A raster of the whole selected frame — used by the pixel-exact export mode. */
export interface FrameImage {
  bytes: Uint8Array;
  width: number;
  height: number;
}

/** A bound character range inside a text node (partial variable / inline link). */
export interface TextSegment {
  start: number;
  end: number;
  var?: string;
  link?: { href?: string; var?: string };
}

/** What Figmail persists on a node (via setPluginData) for the Text-mode template. */
export interface NodeData {
  /** Whole-node binding for button / image nodes. */
  binding?: Binding;
  /** Partial variable/link ranges for text nodes. */
  segments?: TextSegment[];
  /** Static link for a button/link node (used when no url binding). */
  href?: string;
}

/** Info about the node currently selected in Figma, shown in the properties panel. */
export interface SelectedNodeInfo {
  id: string;
  name: string;
  kind: 'text' | 'button' | 'image' | 'other';
  /** Current text characters, for text nodes (used as the binding sample). */
  text?: string;
  /** A small PNG preview of the node, so the panel shows what Figmail captured. */
  thumbnail?: Uint8Array;
  data: NodeData;
}

/** A declared template variable with its applied value. */
export interface TemplateVariable {
  name: string;
  type: 'text' | 'url' | 'image';
  value?: string;
}

/**
 * Template-level data persisted on the captured root node (pluginData). This is
 * the "per-frame" store that accumulates: declared variables + envelope.
 */
export interface TemplateData {
  variables: TemplateVariable[];
  subject?: string;
  from?: string;
}

/** A saved template (email screen) — a named reference to a captured root node. */
export interface TemplateRef {
  id: string;
  name: string;
}

export type MainToUi =
  | { type: 'document'; doc: EmailDocument; frame: FrameImage; template: TemplateData }
  | { type: 'templates'; list: TemplateRef[]; currentId: string | null }
  | { type: 'idle'; candidate: TemplateRef | null }
  | { type: 'selection'; node: SelectedNodeInfo | null }
  | { type: 'error'; message: string };

export type UiToMain =
  | { type: 'ready' }
  | { type: 'capture' }
  | { type: 'selectTemplate'; id: string }
  | { type: 'renameTemplate'; id: string; name: string }
  | { type: 'deleteTemplate'; id: string }
  | { type: 'bind'; nodeId: string; data: NodeData }
  | { type: 'saveTemplate'; data: TemplateData }
  | { type: 'exportToFigma'; values: Record<string, string> }
  | { type: 'resize'; width: number; height: number }
  | { type: 'notify'; message: string };
