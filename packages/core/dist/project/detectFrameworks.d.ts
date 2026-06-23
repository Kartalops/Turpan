/**
 * Detect Frameworks
 * Detects app type, UI framework, backend framework, and test tools
 */
import type { AppType, UIFramework, BackendFramework, TestTool, DatabaseHint, AuthHint, DeploymentHint } from './ProjectFingerprint.js';
export interface FrameworksResult {
    appType: AppType;
    uiFramework: UIFramework;
    backendFramework: BackendFramework;
    testTools: TestTool[];
    databaseHints: DatabaseHint[];
    authHints: AuthHint[];
    deploymentHints: DeploymentHint;
}
export declare function detectFrameworks(projectRoot: string): FrameworksResult;
//# sourceMappingURL=detectFrameworks.d.ts.map