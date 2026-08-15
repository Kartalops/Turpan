import { defaultRedactor } from '../runner/LogRedactor.js';
export class ArtifactBuilder {
    sanitize(bundle) {
        const redactEvidence = (items) => items.map((item) => ({
            ...item,
            excerpt: item.excerpt ? defaultRedactor.redact(item.excerpt) : item.excerpt,
            metadata: item.metadata,
        }));
        return {
            ...bundle,
            networkEvidence: redactEvidence(bundle.networkEvidence),
            consoleEvidence: redactEvidence(bundle.consoleEvidence),
            logs: redactEvidence(bundle.logs),
            sourceLocations: redactEvidence(bundle.sourceLocations),
            environment: Object.fromEntries(Object.entries(bundle.environment).map(([key, value]) => [
                key,
                typeof value === 'string' ? defaultRedactor.redact(`${key}=${value}`).replace(`${key}=`, '') : value,
            ])),
        };
    }
}
//# sourceMappingURL=ArtifactBuilder.js.map