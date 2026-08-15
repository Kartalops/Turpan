import { createHash } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { defaultRedactor } from '../runner/LogRedactor.js';
import type { ContextItem, ContextSelectionInput } from './types.js';

export class ContextEngine {
  private summaryCache = new Map<string, ContextItem>();

  select(input: ContextSelectionInput): ContextItem[] {
    const selected: ContextItem[] = [];
    let remaining = input.maxTokens;

    const push = (item: ContextItem) => {
      if (item.tokensEstimate > remaining) return;
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

  summarize(content: string, id: string): ContextItem {
    const hash = this.hash(content);
    const cached = this.summaryCache.get(hash);
    if (cached) return cached;

    const summary = content.length > 1200 ? `${content.slice(0, 1200)}\n[summary-truncated]` : content;
    const item = this.item(id, 'summary', summary);
    this.summaryCache.set(hash, item);
    return item;
  }

  private fileItem(path: string, kind: ContextItem['kind']): ContextItem {
    const content = existsSync(path) ? readFileSync(path, 'utf-8') : '';
    return this.item(path, kind, content, path);
  }

  private item(id: string, kind: ContextItem['kind'], rawContent: string, path?: string): ContextItem {
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

  private isTestFile(path: string): boolean {
    return /(\.test\.|\.spec\.|__tests__|\/tests\/)/.test(path);
  }

  private hash(content: string): string {
    return createHash('sha1').update(content).digest('hex');
  }
}
