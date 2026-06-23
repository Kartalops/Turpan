/**
 * FindingStore — in-memory store for all findings collected during a review run
 */
export class FindingStore {
    _findings = [];
    add(finding) {
        this._findings.push(finding);
    }
    addMany(findings) {
        this._findings.push(...findings);
    }
    get all() {
        return this._findings;
    }
    get count() {
        return this._findings.length;
    }
    clear() {
        this._findings = [];
    }
    /** Filter by severity */
    withSeverity(severity) {
        return this._findings.filter(f => f.severity === severity);
    }
    /** Filter by category */
    withCategory(category) {
        return this._findings.filter(f => f.category === category);
    }
    /** Filter to only fixable findings */
    fixable() {
        return this._findings.filter(f => f.fixable !== 'none');
    }
    /** Filter to findings above a minimum confidence */
    withMinConfidence(min) {
        return this._findings.filter(f => f.confidence >= min);
    }
    /** Filter by file */
    withFile(file) {
        return this._findings.filter(f => f.file === file);
    }
    /** Sort by severity desc, then confidence desc */
    sortedBySeverity() {
        const order = {
            critical: 0, high: 1, medium: 2, low: 3, info: 4,
        };
        return [...this._findings].sort((a, b) => {
            const sd = order[a.severity] - order[b.severity];
            return sd !== 0 ? sd : b.confidence - a.confidence;
        });
    }
    /** Group by category */
    byCategory() {
        const map = new Map();
        for (const f of this._findings) {
            const list = map.get(f.category) ?? [];
            list.push(f);
            map.set(f.category, list);
        }
        return map;
    }
    /** Group by severity */
    bySeverity() {
        const map = new Map();
        for (const f of this._findings) {
            const list = map.get(f.severity) ?? [];
            list.push(f);
            map.set(f.severity, list);
        }
        return map;
    }
    /** Returns all unique files that have findings */
    affectedFiles() {
        return [...new Set(this._findings.filter(f => f.file).map(f => f.file))];
    }
    toJSON() {
        return this._findings;
    }
}
//# sourceMappingURL=FindingStore.js.map