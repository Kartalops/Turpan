/**
 * generateReports — produces all Turpan Analysis output artifacts.
 *
 * Call this from the CLI after a review run completes to generate the full
 * bundle: markdown, HTML, JSON, scorecard, fix plan, patch, summary, evidence index.
 */

import { mkdirSync } from 'fs';
import type { TurpanAnalysisData } from './types.js';

import { MarkdownReportWriter }  from './MarkdownReportWriter.js';
import { HtmlReportWriter }      from './HtmlReportWriter.js';
import { JsonReportWriter }      from './JsonReportWriter.js';
import { ScorecardWriter }       from './ScorecardWriter.js';
import { EvidenceIndexWriter }   from './EvidenceIndexWriter.js';
import { FixPlanWriter }         from './FixPlanWriter.js';
import { RunSummaryWriter }      from './RunSummaryWriter.js';
import { PrCommentWriter }       from './PrCommentWriter.js';
import { DiffFindingsWriter }    from './DiffFindingsWriter.js';

export async function generateReports(data: TurpanAnalysisData): Promise<{
  analysisMd:    string;
  analysisHtml:  string;
  findingsJson:  string;
  scorecardJson: string;
  fixPlanMd:     string;
  patchDiff:     string | undefined;
  runSummary:    string;
  evidenceMd:    string;
  prComment?:    string;
  diffFindings?: string;
}> {
  const runPath = data.runPath;
  mkdirSync(runPath, { recursive: true });

  const mdWriter   = new MarkdownReportWriter(data);
  const htmlWriter = new HtmlReportWriter(data);
  const jsonWriter = new JsonReportWriter(data);
  const scWriter   = new ScorecardWriter(data);
  const evWriter   = new EvidenceIndexWriter(data);
  const fpWriter   = new FixPlanWriter(data);
  const rsWriter   = new RunSummaryWriter(data);

  const baseResults = await Promise.all([
    mdWriter.write(runPath),
    htmlWriter.write(runPath),
    jsonWriter.write(runPath),
    scWriter.write(runPath),
    evWriter.write(runPath),
    fpWriter.write(runPath),
    rsWriter.write(runPath),
  ]);

  const [analysisMd, analysisHtml, findingsJson, scorecardJson, evidenceMd, fixPlanResult, runSummary] = baseResults;

  // Diff-specific outputs (only when diffReview is present)
  let prComment: string | undefined;
  let diffFindings: string | undefined;
  if (data.diffReview) {
    const prWriter    = new PrCommentWriter(data);
    const dfWriter    = new DiffFindingsWriter(data);
    [prComment, diffFindings] = await Promise.all([
      prWriter.write(runPath),
      dfWriter.write(runPath),
    ]);
  }

  return {
    analysisMd,
    analysisHtml,
    findingsJson,
    scorecardJson,
    fixPlanMd:   fixPlanResult.fixPlanPath,
    patchDiff:   fixPlanResult.patchPath,
    runSummary,
    evidenceMd,
    prComment,
    diffFindings,
  };
}