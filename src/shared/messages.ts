import type { EmailDocument } from '../ir/types';

// Contract for postMessage traffic between the plugin sandbox (main) and the
// iframe (UI). Both sides import this so the shape stays in sync.

/** A raster of the whole selected frame — used by the pixel-exact export mode. */
export interface FrameImage {
  bytes: Uint8Array;
  width: number;
  height: number;
}

export type MainToUi = { type: 'document'; doc: EmailDocument; frame: FrameImage } | { type: 'error'; message: string };

export type UiToMain =
  | { type: 'ready' }
  | { type: 'resize'; width: number; height: number }
  | { type: 'notify'; message: string };
