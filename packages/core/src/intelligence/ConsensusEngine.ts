import type { ConsensusInput, ConsensusResult } from './types.js';

export class ConsensusEngine {
  evaluate(input: ConsensusInput): ConsensusResult {
    const rationale: string[] = [];
    let confidence = Math.max(0, Math.min(100, input.candidate.confidence));

    const add = (points: number, reason: string) => {
      confidence += points;
      rationale.push(reason);
    };

    if (input.evidenceSignals.runtimeReproduction) add(30, 'runtime reproduction');
    if (input.evidenceSignals.compilerEvidence) add(24, 'compiler/typechecker evidence');
    if (input.evidenceSignals.testFailure) add(22, 'test failure');
    if (input.evidenceSignals.browserReproduction) add(20, 'browser reproduction');
    if (input.evidenceSignals.deterministicAstEvidence) add(16, 'deterministic static evidence');
    if (input.evidenceSignals.independentModelAgreement) add(10, 'independent model agreement');
    if (input.evidenceSignals.sourceLocationQuality === 'specific') add(8, 'specific source location');
    if (input.evidenceSignals.sourceLocationQuality === 'weak') add(2, 'weak source location');
    if (input.evidenceSignals.reproducible) add(8, 'reproducible claim');

    if (input.verification?.status === 'REJECTED') {
      return { status: 'REJECTED', confidence: 0, rationale: ['adversarial verifier rejected the claim'], candidate: input.candidate };
    }
    if (input.verification?.status === 'NEEDS_EVIDENCE') {
      confidence = Math.min(confidence, 65);
      rationale.push('verifier requested more evidence');
    }
    if (input.verification?.status === 'CONFIRMED') add(12, 'adversarial verifier confirmed');

    const hasToolEvidence = Boolean(
      input.evidenceSignals.runtimeReproduction ||
      input.evidenceSignals.compilerEvidence ||
      input.evidenceSignals.testFailure ||
      input.evidenceSignals.browserReproduction ||
      input.evidenceSignals.deterministicAstEvidence,
    );
    if (!hasToolEvidence) {
      confidence = Math.min(confidence, 70);
      rationale.push('model-only claim capped below maximum confidence');
    }

    const status = input.verification?.status ?? (confidence >= 75 ? 'CONFIRMED' : 'NEEDS_EVIDENCE');
    return {
      status,
      confidence: Math.max(0, Math.min(100, Math.round(confidence))),
      rationale,
      candidate: input.candidate,
    };
  }
}
