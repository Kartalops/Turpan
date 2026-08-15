import type { ModelRequest } from '../protocol/index.js';
import type {
  ContextItem,
  ModelRoute,
  SpecialistGoal,
  SpecialistResult,
} from './types.js';
import type { ModelProviderRunner } from './ModelProviderRunner.js';

export function buildSpecialistRequest(goal: SpecialistGoal, context: ContextItem[]): ModelRequest {
  return {
    system: [
      `You are ${goal.role}.`,
      'Models reason. Tools prove.',
      'Return only validated structured finding candidates.',
      'Do not declare a final verdict and do not propose code changes.',
    ].join('\n'),
    task: goal.goal,
    selectedContext: context.map((item) => ({
      id: item.id,
      kind: item.kind,
      content: item.content,
      path: item.path,
      hash: item.hash,
    })),
    structuredOutputSchema: {
      name: 'FindingCandidateList',
      description: 'Array of evidence-backed finding candidates',
    },
    tokenBudget: 8000,
    timeoutMs: 60_000,
    reasoningHint: goal.riskLevel === 'high' || goal.riskLevel === 'critical' ? 'high' : 'medium',
  };
}

export class SpecialistRunner {
  constructor(private readonly runner: ModelProviderRunner) {}

  async run(goal: SpecialistGoal, route: ModelRoute, context: ContextItem[]): Promise<SpecialistResult> {
    const response = await this.runner.invoke<{ findings: SpecialistResult['candidates']; confidence: number }>(
      route,
      buildSpecialistRequest(goal, context),
    );
    const result = response.structuredResult ?? { findings: [], confidence: 0 };
    return {
      role: goal.role,
      candidates: result.findings,
      confidence: result.confidence,
      provider: response.provider,
      model: response.model,
      toolCalls: [],
    };
  }

  async runConcurrent(jobs: Array<{ goal: SpecialistGoal; route: ModelRoute; context: ContextItem[] }>): Promise<SpecialistResult[]> {
    return Promise.all(jobs.map((job) => this.run(job.goal, job.route, job.context)));
  }
}
