import type { CliReviewPlan } from './types.js';

export class CliAgent {
  plan(binary: string): CliReviewPlan {
    return {
      commands: [
        { command: binary, args: ['--help'], reason: 'help output should not crash' },
        { command: binary, args: ['--version'], reason: 'version output should be stable' },
        { command: binary, args: ['--definitely-invalid-option'], reason: 'invalid option should fail gracefully' },
        { command: binary, args: [], reason: 'missing arguments should produce actionable usage or help' },
      ],
    };
  }
}
