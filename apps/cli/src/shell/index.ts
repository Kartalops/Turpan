// Shell modules
export { runInteractiveShell, type InteractiveShellConfig } from './InteractiveShell.js';
export { parseCommand, getIntentLabel, getAvailableCommands, getCommandCategories } from './intent.js';

// Supporting modules (public for testing)
export { CommandMemory, type ShellMemory, type ShellMode } from './CommandMemory.js';
export { ShellRenderer, type RenderOptions } from './ShellRenderer.js';
export { ShellSession, type SessionConfig } from './ShellSession.js';
export { IntentRouter, createRouter, type RouterContext, type RouterResult, type RouterRunOptions } from './IntentRouter.js';