/**
 * Plugin Process Sandbox Tests (Phase 29)
 *
 * Tests for child-process-based plugin isolation:
 *  1. Plugin process timeout — child is killed with SIGKILL after timeout
 *  2. Plugin crash isolation — parent survives child crash
 *  3. Plugin cannot read env secret — secrets stripped from child env
 *  4. Permission denial in process mode — permission check works
 *  5. Manifest validation rejects bad manifest
 */
export {};
//# sourceMappingURL=processSandbox.test.d.ts.map