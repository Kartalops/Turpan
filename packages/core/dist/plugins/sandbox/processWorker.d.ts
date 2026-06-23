/**
 * processWorker — entry point for the child process sandbox.
 *
 * This file runs in a SEPARATE Node.js process (not a worker thread).
 * It receives plugin init data via stdin IPC and sends results via stdout.
 *
 * Protocol:
 *  1. Parent sends { type: 'init', ... } on stdin
 *  2. Child validates plugin, sends { type: 'ready' } on stdout
 *  3. Parent sends { type: 'run-analysis', callId, context } on stdin
 *  4. Child runs plugin analysis, sends { type: 'result', callId, success, ... } on stdout
 *
 * Security properties:
 *  - No inherited handles from parent
 *  - Minimal env vars (NODE_ENV, NO_COLOR, TURPAN_PLUGIN_MODE only)
 *  - No secrets in environment
 *  - No direct fs/net/child_process — uses only allowed paths
 *  - Memory limited by V8 --max-old-space-size (set by parent)
 *  - Plugin module re-imported in this process
 */
export {};
//# sourceMappingURL=processWorker.d.ts.map