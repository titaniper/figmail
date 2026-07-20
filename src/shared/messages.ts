import type { EmailDocument } from '../ir/types';

// Contract for postMessage traffic between the plugin sandbox (main) and the
// iframe (UI). Both sides import this so the shape stays in sync.

export type MainToUi = { type: 'document'; doc: EmailDocument } | { type: 'error'; message: string };

export type UiToMain =
  | { type: 'ready' }
  | { type: 'resize'; width: number; height: number }
  | { type: 'notify'; message: string };
