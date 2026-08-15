import type { FindingCandidate } from '../protocol/index.js';
import type { ReproductionStrategy } from './types.js';

export class ReproductionPlanner {
  plan(candidate: FindingCandidate): ReproductionStrategy {
    const text = `${candidate.title} ${candidate.explanation}`.toLowerCase();

    if (text.includes('save') && (text.includes('noop') || text.includes('no-op') || text.includes('persistence'))) {
      return {
        hypothesis: candidate,
        requiredTools: ['browser', 'api', 'source'],
        steps: [
          { action: 'open affected settings page' },
          { action: 'change a safe test field' },
          { action: 'click save' },
          { action: 'inspect network activity for save request' },
          { action: 'reload page' },
          { action: 'verify whether value persisted' },
          { action: 'map route or handler back to source' },
        ],
      };
    }

    if (text.includes('admin') && (text.includes('auth') || text.includes('authorization'))) {
      return {
        hypothesis: candidate,
        requiredTools: ['browser', 'api', 'source'],
        steps: [
          { action: 'open admin route unauthenticated' },
          { action: 'inspect status, redirect, and page content' },
          { action: 'authenticate only as configured normal test user if available' },
          { action: 'retry route without privilege escalation' },
          { action: 'map route handler or middleware to source' },
        ],
      };
    }

    return {
      hypothesis: candidate,
      requiredTools: ['source'],
      steps: [
        { action: 'collect exact source and runtime evidence' },
        { action: 'execute the smallest safe reproduction available' },
        { action: 'confirm or reject the finding' },
      ],
    };
  }
}
