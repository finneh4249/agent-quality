import { claudeAdapter } from './claude.js';
import { geminiAdapter } from './gemini.js';
import { codexAdapter } from './codex.js';
import { openCodeAdapter } from './opencode.js';
import { fallbackGuide } from './fallback.js';

export const ADAPTERS: Record<string, any> = {
  claude: claudeAdapter,
  gemini: geminiAdapter,
  codex: codexAdapter,
  opencode: openCodeAdapter
};

export {
  claudeAdapter,
  geminiAdapter,
  codexAdapter,
  openCodeAdapter,
  fallbackGuide
};
