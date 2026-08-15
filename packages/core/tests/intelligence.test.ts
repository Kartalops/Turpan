import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  AdversarialVerifier,
  ConfiguredModelProvider,
  ConsensusEngine,
  ContextEngine,
  DEFAULT_PRIVACY_POLICY,
  ModelProviderRunner,
  createModelPolicy,
  ModelRegistry,
  ModelRouter,
  SpecialistRunner,
  assertProviderAllowed,
  createDefaultModelRegistry,
  parseStructuredOutput,
  redactModelRequest,
  type FindingCandidate,
  type ModelDescriptor,
  type ModelPolicy,
  type ModelProvider,
  type PrivacyPolicy,
} from '../src/intelligence/index.js';
import type { ModelRequest, ModelResponse } from '../src/protocol/index.js';

const policy: ModelPolicy = {
  mode: 'balanced',
  maxModelCalls: 10,
  maxEstimatedCostUsd: 1,
  allowRemoteProviders: true,
  requireDisclosure: true,
};

function descriptor(overrides: Partial<ModelDescriptor> = {}): ModelDescriptor {
  return {
    provider: 'p1',
    model: 'm1',
    family: 'coding',
    enabled: true,
    local: false,
    capabilities: {
      codingReasoning: 90,
      architectureReasoning: 70,
      securityReasoning: 70,
      longContext: true,
      toolUse: true,
      vision: false,
      latencyClass: 'medium',
      costClass: 'medium',
      contextWindow: 128000,
      structuredOutput: true,
      reliabilityScore: 90,
    },
    ...overrides,
  };
}

function request(): ModelRequest {
  return {
    system: 'system',
    task: 'task',
    selectedContext: [],
    structuredOutputSchema: { name: 'TestSchema' },
  };
}

describe('multi-model intelligence', () => {
  it('routes cheap tasks to cheap low-latency models', () => {
    const registry = createDefaultModelRegistry();
    const route = new ModelRouter(registry).route({
      taskType: 'file-classification',
      riskLevel: 'low',
      repositoryLanguages: ['typescript'],
      changedSurface: ['src/a.ts'],
      requiredContextSize: 1000,
      mode: 'fast',
      budget: { maxEstimatedCostUsd: 0.01 },
      latencyPreference: 'low',
      availableProviders: ['local', 'openai-compatible', 'anthropic-compatible'],
    });

    expect(route.primary.model).toBe('cheap-fast');
  });

  it('routes high-risk architecture work to a reasoning-family model', () => {
    const route = new ModelRouter(createDefaultModelRegistry()).route({
      taskType: 'architecture-review',
      riskLevel: 'critical',
      repositoryLanguages: ['typescript'],
      changedSurface: ['packages/core/src/orchestrator/ReviewOrchestrator.ts'],
      requiredContextSize: 64000,
      previousModelConfidence: 40,
      mode: 'paranoid',
      latencyPreference: 'quality',
      availableProviders: ['openai-compatible', 'anthropic-compatible'],
    });

    expect(route.primary.family).toBe('reasoning');
  });

  it('routes UI evidence tasks to a vision-capable model', () => {
    const route = new ModelRouter(createDefaultModelRegistry()).route({
      taskType: 'ui-review',
      riskLevel: 'medium',
      repositoryLanguages: ['typescript'],
      changedSurface: ['screenshots/home.png'],
      requiredContextSize: 2000,
      visionRequired: true,
      browserArtifactsExist: true,
      mode: 'balanced',
      availableProviders: ['google-compatible', 'openai-compatible'],
    });

    expect(route.primary.capabilities.vision).toBe(true);
  });

  it('falls back when the primary provider fails', async () => {
    const primary = descriptor({ provider: 'p1', model: 'primary' });
    const fallback = descriptor({ provider: 'p2', model: 'fallback' });
    const providers = new Map<string, ModelProvider>([
      ['p1', new ConfiguredModelProvider('p1', { primary: primary.capabilities }, async () => {
        throw new Error('provider down');
      })],
      ['p2', new ConfiguredModelProvider('p2', { fallback: fallback.capabilities }, async () => ({
        provider: 'p2',
        model: 'fallback',
        structuredResult: { ok: true },
        latencyMs: 1,
      }))],
    ]);

    const response = await new ModelProviderRunner(
      providers,
      policy,
      { mode: 'allow-remote', discloseSourceExfiltration: true, redactSecrets: true, allowedProviders: ['p1', 'p2'] },
    ).invoke({ primary, fallbacks: [fallback], reason: 'test' }, request());

    expect(response.provider).toBe('p2');
    expect(response.retryMetadata?.fallbackUsed).toBe(true);
  });

  it('rejects malformed structured output after one repair attempt', () => {
    const result = parseStructuredOutput(
      'not json',
      { name: 'OkObject', validate: (value): value is { ok: true } => typeof value === 'object' && value !== null && (value as any).ok === true },
      () => '{"still":"wrong"}',
    );

    expect(result.ok).toBe(false);
    expect(result.repairAttempted).toBe(true);
  });

  it('runs specialists concurrently and returns structured candidates', async () => {
    const model = descriptor();
    const provider = new ConfiguredModelProvider('p1', { m1: model.capabilities }, async () => ({
      provider: 'p1',
      model: 'm1',
      structuredResult: {
        findings: [{
          title: 'Missing auth check',
          severity: 'high',
          category: 'security',
          confidence: 80,
          explanation: 'The route does not check auth.',
          evidence: [{ kind: 'code', path: 'route.ts', excerpt: 'export async function GET()' }],
        }],
        confidence: 80,
      },
      latencyMs: 1,
    }));
    const runner = new SpecialistRunner(new ModelProviderRunner(
      new Map([['p1', provider]]),
      policy,
      { mode: 'allow-remote', discloseSourceExfiltration: true, redactSecrets: true, allowedProviders: ['p1'] },
    ));

    const results = await runner.runConcurrent([
      {
        goal: { role: 'SecurityReviewer', taskType: 'security-review', goal: 'Find auth flaws', riskLevel: 'high' },
        route: { primary: model, fallbacks: [], reason: 'test' },
        context: [],
      },
      {
        goal: { role: 'CorrectnessReviewer', taskType: 'correctness-review', goal: 'Find correctness flaws', riskLevel: 'medium' },
        route: { primary: model, fallbacks: [], reason: 'test' },
        context: [],
      },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0].candidates[0].severity).toBe('high');
  });

  it('lets the adversarial verifier reject false findings', async () => {
    const model = descriptor({ provider: 'verifier', model: 'v1', family: 'reasoning' });
    const verifier = new AdversarialVerifier(new ModelProviderRunner(
      new Map([['verifier', new ConfiguredModelProvider('verifier', { v1: model.capabilities }, async () => ({
        provider: 'verifier',
        model: 'v1',
        structuredResult: {
          status: 'REJECTED',
          explanation: 'The cited function checks authentication before access.',
          evidenceGaps: [],
        },
        latencyMs: 1,
      }))]]),
      policy,
      { mode: 'allow-remote', discloseSourceExfiltration: true, redactSecrets: true, allowedProviders: ['verifier'] },
    ));

    const result = await verifier.verify(candidate(), { primary: model, fallbacks: [], reason: 'test' }, []);
    expect(result.status).toBe('REJECTED');
  });

  it('caps model-only consensus confidence below maximum', () => {
    const consensus = new ConsensusEngine().evaluate({
      candidate: candidate({ confidence: 95 }),
      evidenceSignals: { independentModelAgreement: true, sourceLocationQuality: 'specific' },
    });

    expect(consensus.status).toBe('NEEDS_EVIDENCE');
    expect(consensus.confidence).toBeLessThanOrEqual(70);
  });

  it('stops calls when cost limits are exceeded', async () => {
    const model = descriptor();
    const provider = new ConfiguredModelProvider(
      'p1',
      { m1: model.capabilities },
      async () => ({ provider: 'p1', model: 'm1', structuredResult: {}, latencyMs: 1 }),
      () => 2,
    );
    const runner = new ModelProviderRunner(
      new Map([['p1', provider]]),
      { ...policy, maxEstimatedCostUsd: 1 },
      { mode: 'allow-remote', discloseSourceExfiltration: true, redactSecrets: true, allowedProviders: ['p1'] },
    );

    await expect(runner.invoke({ primary: model, fallbacks: [], reason: 'test' }, request())).rejects.toThrow(/budget/);
  });

  it('creates explicit model cost and latency profiles', () => {
    expect(createModelPolicy('fast').maxModelCalls).toBeLessThan(createModelPolicy('deep').maxModelCalls);
    expect(createModelPolicy('paranoid').maxEstimatedCostUsd).toBeGreaterThan(createModelPolicy('balanced').maxEstimatedCostUsd);
  });

  it('scopes context and redacts secrets before provider calls', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'turpan-context-'));
    try {
      const source = join(tmp, 'source.ts');
      const ignored = join(tmp, 'ignored.ts');
      const stripeKey = ['sk', '_live_123456789012345678901234'].join('');
      writeFileSync(source, `const token = "${stripeKey}";\nexport const ok = true;`);
      writeFileSync(ignored, 'export const ignored = true;');

      const selected = new ContextEngine().select({
        taskType: 'security-review',
        changedFiles: [source],
        maxTokens: 200,
      });

      expect(selected.map((item) => item.path)).toContain(source);
      expect(selected.map((item) => item.path)).not.toContain(ignored);
      expect(selected[0].content).not.toContain(stripeKey);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('redacts model requests and enforces offline privacy policy', () => {
    const githubToken = ['gh', 'p_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'].join('');
    const redacted = redactModelRequest({
      ...request(),
      task: 'API_KEY=abcdef1234567890',
      selectedContext: [{ id: 'ctx', kind: 'source', content: `GITHUB_TOKEN=${githubToken}` }],
    }, DEFAULT_PRIVACY_POLICY);

    expect(redacted.task).toContain('[REDACTED]');
    expect(redacted.selectedContext[0].content).not.toContain('ghp_');
    expect(() => assertProviderAllowed(DEFAULT_PRIVACY_POLICY, 'openai-compatible')).toThrow(/blocks remote provider/);
  });
});

function candidate(overrides: Partial<FindingCandidate> = {}): FindingCandidate {
  return {
    title: 'Claimed issue',
    severity: 'high',
    category: 'security',
    confidence: 80,
    explanation: 'A model claims this is unsafe.',
    locations: [{ file: 'src/route.ts', line: 1 }],
    evidence: [{ kind: 'code', path: 'src/route.ts', excerpt: 'export async function GET()' }],
    ...overrides,
  };
}
