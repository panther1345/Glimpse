export type Msg = { role: 'user' | 'assistant' | 'system'; text: string; images?: string[] };
export type SelAction = 'explain' | 'translate' | 'summarize' | 'ask' | 'answer' | 'code';
export type ErrCode = 'no_key' | 'auth' | 'network' | 'rate_limit' | 'other';
export type ChatError = { code: ErrCode; message: string };

export type RuntimeMsg =
  | { type: 'CAPTURE'; mode: 'region' | 'tab'; windowId?: number }
  | { type: 'REGION_SELECTED'; x: number; y: number; w: number; h: number; dpr: number }
  | { type: 'REGION_CANCELLED' }
  | { type: 'REGION_FULL_TAB' }
  | { type: 'SELECTION_ACTION'; action: SelAction; text: string; url: string }
  | { type: 'OPEN_PANEL' }
  | { type: 'POPUP_CAPTURE' }
  | { type: 'POPUP_TO_PANEL'; messages: Msg[] }
  | { type: 'OPEN_OPTIONS' }
  | { type: 'LOAD_CHAT'; messages: Msg[] }
  | { type: 'PANEL_READY' }
  | { type: 'CAPTURED'; image: string }
  | { type: 'CAPTURE_ERROR'; error: 'restricted_page' | 'failed' }
  | { type: 'PREFILL'; prompt: string; autoSend: boolean }
  | { type: 'LOAD_CHAT'; messages: Msg[] };

export type CaptureReply = { image?: string; error?: 'restricted_page' | 'failed'; pending?: boolean };

// Port "chat"
export type PortIn = { type: 'start'; messages: Msg[]; model?: string } | { type: 'stop' };
export type PortOut = { type: 'meta'; model: string; provider: string } | { type: 'chunk'; text: string } | { type: 'done' } | { type: 'error'; error: ChatError };
