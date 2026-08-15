import type { AdversarialVerification, ContextItem, FindingCandidate, ModelRoute } from './types.js';
import type { ModelProviderRunner } from './ModelProviderRunner.js';
export declare class AdversarialVerifier {
    private readonly runner;
    constructor(runner: ModelProviderRunner);
    verify(candidate: FindingCandidate, route: ModelRoute, context: ContextItem[]): Promise<AdversarialVerification>;
}
//# sourceMappingURL=AdversarialVerifier.d.ts.map