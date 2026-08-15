import type { PrivacyPolicy } from './types.js';
import type { ModelRequest } from '../protocol/index.js';
export declare const DEFAULT_PRIVACY_POLICY: PrivacyPolicy;
export declare function assertProviderAllowed(policy: PrivacyPolicy, provider: string): void;
export declare function redactModelRequest(request: ModelRequest, policy: PrivacyPolicy): ModelRequest;
export declare function modelCallDisclosure(policy: PrivacyPolicy): string;
//# sourceMappingURL=PrivacyPolicy.d.ts.map