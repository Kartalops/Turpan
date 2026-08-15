export function checkPatchBudget(candidate, budget) {
    const reasons = [];
    const changedLines = candidate.changeSummary.linesAdded + candidate.changeSummary.linesRemoved;
    if (candidate.changeSummary.filesChanged.length > budget.maxFilesChanged) {
        reasons.push(`changes ${candidate.changeSummary.filesChanged.length} files; budget is ${budget.maxFilesChanged}`);
    }
    if (changedLines > budget.maxLinesChanged) {
        reasons.push(`changes ${changedLines} lines; budget is ${budget.maxLinesChanged}`);
    }
    if (candidate.changeSummary.dependencyChanges > budget.maxDependencyChanges) {
        reasons.push(`changes ${candidate.changeSummary.dependencyChanges} dependencies; budget is ${budget.maxDependencyChanges}`);
    }
    return { ok: reasons.length === 0, reasons };
}
export function summarizeUnifiedDiff(diff) {
    const filesChanged = new Set();
    let linesAdded = 0;
    let linesRemoved = 0;
    let dependencyChanges = 0;
    for (const line of diff.split('\n')) {
        if (line.startsWith('+++ b/'))
            filesChanged.add(line.slice('+++ b/'.length));
        if (line.startsWith('+') && !line.startsWith('+++'))
            linesAdded += 1;
        if (line.startsWith('-') && !line.startsWith('---'))
            linesRemoved += 1;
        if (line.includes('"dependencies"') ||
            line.includes('"devDependencies"') ||
            line.includes('pnpm-lock.yaml') ||
            line.includes('package-lock.json')) {
            dependencyChanges += 1;
        }
    }
    return {
        filesChanged: [...filesChanged],
        linesAdded,
        linesRemoved,
        dependencyChanges,
    };
}
//# sourceMappingURL=PatchBudget.js.map