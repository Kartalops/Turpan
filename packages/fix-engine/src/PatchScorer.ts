import type { PatchExperiment } from './autofixTypes.js';

export function scorePatchExperiment(experiment: PatchExperiment): number {
  let score = 0;

  score += experiment.reproductionFlips.filter((flip) => flip.flipped).length * 35;
  score += experiment.validation.filter((result) => result.passed).length * 10;
  score -= experiment.validation.filter((result) => !result.passed).length * 25;
  score -= experiment.review.concerns.reduce((sum, concern) => {
    if (concern.severity === 'critical') return sum + 40;
    if (concern.severity === 'high') return sum + 25;
    if (concern.severity === 'medium') return sum + 10;
    return sum + 3;
  }, 0);

  const changedLines = experiment.candidate.changeSummary.linesAdded + experiment.candidate.changeSummary.linesRemoved;
  score -= Math.ceil(changedLines / 20);
  score -= experiment.candidate.changeSummary.filesChanged.length * 2;

  return Math.max(0, Math.min(100, score));
}

export function chooseSmallestProvenPatch(experiments: PatchExperiment[]): PatchExperiment | undefined {
  return experiments
    .filter((experiment) => experiment.accepted)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aLines = a.candidate.changeSummary.linesAdded + a.candidate.changeSummary.linesRemoved;
      const bLines = b.candidate.changeSummary.linesAdded + b.candidate.changeSummary.linesRemoved;
      if (aLines !== bLines) return aLines - bLines;
      return a.candidate.changeSummary.filesChanged.length - b.candidate.changeSummary.filesChanged.length;
    })[0];
}
