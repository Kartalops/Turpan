/**
 * Security Basic Plugin — shared security rules for all project types.
 *
 * Contributes:
 *  - Secret detection (API keys, tokens, passwords hardcoded in source)
 *  - SQL injection patterns
 *  - XSS patterns (innerHTML, dangerouslySetInnerHTML)
 *  - Insecure dependencies
 *
 * The analyzer actually READS file contents (not just file paths) so it
 * catches secrets and patterns in real source files.
 */
import type { Plugin } from '../../Plugin.js';
export declare const securityBasicPlugin: Plugin;
//# sourceMappingURL=SecurityBasicPlugin.d.ts.map