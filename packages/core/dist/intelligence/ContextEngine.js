import { createHash } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { defaultRedactor } from '../runner/LogRedactor.js';
export class ContextEngine {
    summaryCache = new Map();
    select(input) {
        const selected = [];
        let remaining = input.maxTokens;
        const push = (item) => {
            if (item.tokensEstimate > remaining)
                return;
            selected.push(item);
            remaining -= item.tokensEstimate;
        };
        if (input.repositoryMap) {
            push(this.item('repo-map', 'summary', input.repositoryMap));
        }
        for (const config of input.configs ?? []) {
            push(this.fileItem(config, 'config'));
        }
        for (const file of input.changedFiles ?? []) {
            push(this.fileItem(file, this.isTestFile(file) ? 'test' : 'source'));
        }
        for (const test of input.tests ?? []) {
            push(this.fileItem(test, 'test'));
        }
        for (const finding of input.recentFindings ?? []) {
            push(this.item(`finding:${finding.title}`, 'finding', JSON.stringify(finding)));
        }
        return selected;
    }
    summarize(content, id) {
        const hash = this.hash(content);
        const cached = this.summaryCache.get(hash);
        if (cached)
            return cached;
        const summary = content.length > 1200 ? `${content.slice(0, 1200)}\n[summary-truncated]` : content;
        const item = this.item(id, 'summary', summary);
        this.summaryCache.set(hash, item);
        return item;
    }
    fileItem(path, kind) {
        const content = existsSync(path) ? readFileSync(path, 'utf-8') : '';
        return this.item(path, kind, content, path);
    }
    item(id, kind, rawContent, path) {
        const content = defaultRedactor.redact(rawContent);
        return {
            id,
            kind,
            content,
            path,
            hash: this.hash(content),
            tokensEstimate: Math.ceil(content.length / 4),
        };
    }
    isTestFile(path) {
        return /(\.test\.|\.spec\.|__tests__|\/tests\/)/.test(path);
    }
    hash(content) {
        return createHash('sha1').update(content).digest('hex');
    }
}
//# sourceMappingURL=ContextEngine.js.map