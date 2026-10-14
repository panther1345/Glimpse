import { type Provider, ProviderError } from './types';
import { openAICompatible } from './openai';
export const custom: Provider = { id: 'custom', label: 'Custom (OpenAI-compatible)', defaultModel: 'llava',
  send(req) { if (!req.baseUrl) throw new ProviderError('other', 'Set a base URL in Settings.'); return openAICompatible(req.baseUrl, req); } };
