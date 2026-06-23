// Analyzer Infrastructure
export { type Analyzer, type AnalyzerContext, type AnalyzerResult, isAnalyzer } from './Analyzer.js';
export { type AnalyzerRegistry, globalRegistry } from './AnalyzerRegistry.js';
export { type AnalyzerRegistry as Registry } from './AnalyzerRegistry.js';
export {
  type StaticQualityRunResult,
  type CleanupCandidate,
  runStaticQualityAnalyzers,
  categorizeCleanupCandidates,
} from './runAnalyzers.js';
