/**
 * JsonReportWriter — produces TURPAN_FINDINGS.json
 *
 * Machine-readable findings list for agents, CI/CD pipelines, and MCP consumers.
 * Schema is versioned so downstream consumers can validate before parsing.
 */

import { join } from 'path';
import type { Finding } from '@turpan/core';
import type { TurpanAnalysisData } from './types.js';

export interface TurpanFindingsJson {
  version:    string;
  runId:      string;
  timestamp:  string;
  projectPath: string;
  verdict:    string;
  total:      number;
  breakdown:  SeverityBreakdown;
  findings:   SerializedFinding[];
}

export interface SeverityBreakdown {
  critical: number;
  high:     number;
  medium:   number;
  low:      number;
  info:     number;
}

export interface SerializedFinding {
  id:          string;
  title:       string;
  severity:    string;
  category:    string;
  explanation: string;
  file?:       string;
  line?:       number;
  command?:    string;
  evidence:    SerializedEvidence[];
  suggestedFix?: string;
  fixable:     string;
  confidence:  number;
  tags:        string[];
}

export interface SerializedEvidence {
  type:      string;
  label?:    string;
  path?:     string;
  excerpt?:  string;
  url?:      string;
  timestamp?: string;
  command?:  string;
  exitCode?: number;
  value?:    number;
  unit?:     string;
}

export class JsonReportWriter {
  constructor(private data: TurpanAnalysisData) {}

  async write(runPath: string): Promise<string> {
    const { writeFileSync } = await import('fs');
    const content = JSON.stringify(this.build(), null, 2);
    const dest    = join(runPath, 'TURPAN_FINDINGS.json');
    writeFileSync(dest, content, 'utf-8');
    return dest;
  }

  /** Return the serialised object directly (used by CLI for --json flag). */
  build(): TurpanFindingsJson {
    const { runId, timestamp, projectPath, findings, verdict } = this.data;

    const breakdown: SeverityBreakdown = {
      critical: findings.filter(f => f.severity === 'critical').length,
      high:     findings.filter(f => f.severity === 'high').length,
      medium:   findings.filter(f => f.severity === 'medium').length,
      low:      findings.filter(f => f.severity === 'low').length,
      info:     findings.filter(f => f.severity === 'info').length,
    };

    return {
      version:    '1.0.0',
      runId,
      timestamp,
      projectPath,
      verdict,
      total:      findings.length,
      breakdown,
      findings:   findings.map(f => this.serialiseFinding(f)),
    };
  }

  private serialiseFinding(f: Finding): SerializedFinding {
    return {
      id:          f.id,
      title:       f.title,
      severity:    f.severity,
      category:    f.category,
      explanation: f.explanation,
      file:        f.file,
      line:        f.line,
      command:     f.command,
      evidence:    f.evidence.map(e => ({
        type:      e.type,
        label:     e.label,
        path:      e.path,
        excerpt:   e.excerpt,
        url:       e.url,
        timestamp: e.timestamp,
        command:   e.command,
        exitCode:  e.exitCode,
        value:     e.value,
        unit:      e.unit,
      })),
      suggestedFix: f.suggestedFix,
      fixable:     f.fixable,
      confidence:  f.confidence,
      tags:        f.tags,
    };
  }
}