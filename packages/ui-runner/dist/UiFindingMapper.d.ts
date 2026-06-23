/**
 * FindingMapper — convert collected UI observations into structured Findings.
 *
 * Maps raw observations → categorized Findings with severity, evidence, and tags.
 */
import type { UiVerdict, ConsoleEntry, NetworkRequest, InteractionResult, ResponsiveResult, AccessibilityResult, DiscoveredRoute } from './types.js';
import { type Finding } from '@turpan/core';
export declare function mapConsoleErrors(entries: ConsoleEntry[], route: string): Finding[];
export declare function mapNetworkErrors(requests: NetworkRequest[], route: string): Finding[];
export declare function mapFailedInteractions(results: InteractionResult[], route: string): Finding[];
export declare function mapResponsiveIssues(results: ResponsiveResult[]): Finding[];
export declare function mapAccessibilityIssues(results: AccessibilityResult[], route: string): Finding[];
export declare function mapBlankPage(route: string): Finding;
export declare function mapNoOpButton(buttonText: string, route: string): Finding;
export declare function determineVerdict(routes: DiscoveredRoute[], consoleErrors: ConsoleEntry[], networkErrors: NetworkRequest[], interactionFailures: InteractionResult[], canStartServer: boolean): {
    verdict: UiVerdict;
    reason: string;
};
//# sourceMappingURL=UiFindingMapper.d.ts.map