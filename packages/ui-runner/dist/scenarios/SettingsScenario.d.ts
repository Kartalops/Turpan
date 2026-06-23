/**
 * SettingsScenario — validates settings/account pages in authenticated mode.
 *
 * Safety guarantees:
 * - Inspects forms without submitting destructive changes
 * - Dry-run form fill for safe profile forms (no actual save)
 * - Detects no-op save buttons
 * - NEVER modifies user data
 */
import type { Scenario, ScenarioContext, ScenarioResult, ScenarioRouteMap } from './Scenario.js';
import type { ProjectFingerprint } from '@turpan/core';
export declare class SettingsScenario implements Scenario {
    readonly id = "next-saas-settings-noop-save";
    readonly name = "Settings & Account";
    readonly riskLevel: "safe";
    supports(fp: ProjectFingerprint, routes: ScenarioRouteMap): boolean;
    run(ctx: ScenarioContext): Promise<ScenarioResult>;
    private visitSettings;
    private inspectForms;
    private detectNoOpSave;
    private checkDestructiveSettings;
}
export declare const settingsScenario: SettingsScenario;
//# sourceMappingURL=SettingsScenario.d.ts.map