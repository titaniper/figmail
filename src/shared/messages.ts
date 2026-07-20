import type { Binding, EmailDocument } from '../ir/types';

// Contract for postMessage traffic between the plugin sandbox (main) and the
// iframe (UI). Both sides import this so the shape stays in sync.

/** A raster of the whole selected frame — used by the pixel-exact export mode. */
export interface FrameImage {
  bytes: Uint8Array;
  width: number;
  height: number;
}

/** What Figmail persists on a node (via setPluginData) for the Text-mode template. */
export interface NodeData {
  binding?: Binding;
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
  data: NodeData;
}

export type MainToUi =
  | { type: 'document'; doc: EmailDocument; frame: FrameImage }
  | { type: 'selection'; node: SelectedNodeInfo | null }
  | { type: 'error'; message: string };

export type UiToMain =
  | { type: 'ready' }
  | { type: 'capture' }
  | { type: 'bind'; nodeId: string; data: NodeData }
  | { type: 'resize'; width: number; height: number }
  | { type: 'notify'; message: string };
