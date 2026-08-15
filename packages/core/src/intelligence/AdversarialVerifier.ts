import type { ModelRequest } from '../protocol/index.js';
import type {
  AdversarialVerification,
  ContextItem,
  FindingCandidate,
  ModelRoute,
  VerificationStatus,
} from './types.js';
import type { ModelProviderRunner } from './ModelProviderRunner.js';

export class AdversarialVerifier {
  constructor(private readonly runner: ModelProviderRunner) {}

  async verify(candidate: FindingCandidate, route: ModelRoute, context: ContextItem[]): Promise<AdversarialVerification> {
    const request: ModelRequest = {
      system: [
        'Assume this finding may be wrong. Try to disprove it.',
        'Use exact source locations and deterministic evidence. Return structured output only.',
      ].join('\n'),
      task: JSON.stringify(candidate),
      selectedContext: context.map((item) => ({
        id: item.id,
        kind: item.kind,
        content: item.content,
        path: item.path,
        hash: item.hash,
      })),
      structuredOutputSchema: { name: 'AdversarialVerification' },
      timeoutMs: 60_000,
      reasoningHint: candidate.severity === 'critical' || candidate.severity === 'high' ? 'high' : 'medium',
    };
    const response = await this.runner.invoke<{
      status: VerificationStatus;
      explanation: string;
      evidenceGaps?: string[];
    }>(route, request);
    const result = response.structuredResult ?? {
      status: 'NEEDS_EVIDENCE' as VerificationStatus,
      explanation: 'Verifier did not return a structured result.',
      evidenceGaps: ['missing structured verifier response'],
    };

    return {
      candidate,
      status: result.status,
      explanation: result.explanation,
      evidenceGaps: result.evidenceGaps ?? [],
      verifierProvider: response.provider,
      verifierModel: response.model,
    };
  }
}
