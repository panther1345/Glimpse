import type { Provider } from './types';
import type { ProviderId } from '../storage';
import { openai } from './openai';
import { anthropic } from './anthropic';
import { gemini } from './gemini';
import { custom } from './custom';
export const PROVIDERS: Record<ProviderId, Provider> = { openai, anthropic, gemini, custom };
export const MODEL_SUGGESTIONS: Record<ProviderId, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1'],
  anthropic: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'],
  gemini: ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest'],
  custom: ['llava'],
};
export { ProviderError } from './types';
