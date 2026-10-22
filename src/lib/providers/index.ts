import type { Provider } from './types';
import type { ProviderId } from '../storage';
import { openai } from './openai';
import { anthropic } from './anthropic';
import { gemini } from './gemini';
import { custom } from './custom';
import { groq } from './groq';
export const PROVIDERS: Record<ProviderId, Provider> = { openai, anthropic, gemini, groq, custom };
export const MODEL_SUGGESTIONS: Record<ProviderId, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1'],
  anthropic: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'],
  gemini: ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct', 'openai/gpt-oss-120b'],
  custom: ['llava'],
};
export { ProviderError } from './types';
