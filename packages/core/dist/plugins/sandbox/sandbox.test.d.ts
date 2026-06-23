/**
 * Plugin Sandboxing Tests
 *
 * Tests:
 *  1. Malicious plugin tries to read /etc/passwd — must be blocked
 *  2. Plugin times out when exceeding maxPluginRuntimeMs
 *  3. Plugin returns malformed findings — sanitized
 *  4. Plugin requests unauthorized permission — blocked
 *  5. Builtin plugin still works — in-process, full privileges
 *  6. Manifest validation rejects invalid manifests
 *  7. Permission checking works correctly
 */
export {};
//# sourceMappingURL=sandbox.test.d.ts.map