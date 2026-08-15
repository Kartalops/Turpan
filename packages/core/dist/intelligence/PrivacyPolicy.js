import { defaultRedactor } from '../runner/LogRedactor.js';
export const DEFAULT_PRIVACY_POLICY = {
    mode: 'offline-only',
    discloseSourceExfiltration: true,
    redactSecrets: true,
    allowedProviders: ['local'],
};
export function assertProviderAllowed(policy, provider) {
    if (policy.mode === 'offline-only' && provider !== 'local') {
        throw new Error(`Privacy policy blocks remote provider '${provider}'`);
    }
    if (!policy.allowedProviders.includes(provider)) {
        throw new Error(`Provider '${provider}' is not allowed by privacy policy`);
    }
}
export function redactModelRequest(request, policy) {
    if (!policy.redactSecrets)
        return request;
    return {
        ...request,
        system: defaultRedactor.redact(request.system),
        task: defaultRedactor.redact(request.task),
        selectedContext: request.selectedContext.map((item) => ({
            ...item,
            content: defaultRedactor.redact(item.content),
        })),
    };
}
export function modelCallDisclosure(policy) {
    if (!policy.discloseSourceExfiltration)
        return '';
    return policy.mode === 'offline-only'
        ? 'Model policy is offline-only; source code must not leave the machine.'
        : 'Remote model policy is enabled; selected, redacted source context may be sent to configured providers.';
}
//# sourceMappingURL=PrivacyPolicy.js.map