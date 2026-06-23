import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { TurpanConfig } from '@turpan/shared';

const DEFAULT_CONFIG: TurpanConfig = {
  version: '0.1.0',
  projectPath: '',
  runPath: '',
  deepAnalysis: false,
  uiAnalysis: false,
  fixMode: false,
  logLevel: 'info',
};

export class ConfigParseError extends Error {
  constructor(message: string, public line?: number) {
    super(message);
    this.name = 'ConfigParseError';
  }
}

/**
 * Load turpan.yml from a project path.
 * Tries YAML first, falls back to JSON, then to defaults.
 * Never throws — returns defaults if anything goes wrong.
 */
export function loadConfig(projectPath: string): TurpanConfig {
  const configPath = join(projectPath, 'turpan.yml');
  const jsonPath = join(projectPath, 'turpan.json');

  const baseConfig: TurpanConfig = {
    ...DEFAULT_CONFIG,
    projectPath,
    runPath: join(projectPath, '.turpan', 'runs'),
  };

  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, 'utf-8');
      const parsed = parseYaml(content);
      return mergeConfig(baseConfig, parsed, projectPath);
    } catch {
      return { ...baseConfig };
    }
  }

  if (existsSync(jsonPath)) {
    try {
      const content = readFileSync(jsonPath, 'utf-8');
      const parsed = JSON.parse(content);
      return mergeConfig(baseConfig, parsed, projectPath);
    } catch {
      return { ...baseConfig };
    }
  }

  return baseConfig;
}

export function saveConfig(projectPath: string, config: Partial<TurpanConfig>): void {
  const configPath = join(projectPath, 'turpan.yml');
  const fullConfig = loadConfig(projectPath);
  const merged: TurpanConfig = { ...fullConfig, ...config };

  const yaml = stringifyYaml(merged as unknown as Record<string, unknown>);
  writeFileSync(configPath, yaml, 'utf-8');
}

export function createDefaultConfig(projectPath: string): TurpanConfig {
  const config: TurpanConfig = {
    ...DEFAULT_CONFIG,
    projectPath,
    runPath: join(projectPath, '.turpan', 'runs'),
    project: { name: projectPath.split('/').pop() ?? 'unknown-project' },
    commands: {},
    ui: { enabled: false },
    fix: { mode: 'report-only', maxFilesChanged: 5, allowDependencyChanges: false, allowFileDeletion: false },
    security: { redactSecrets: true },
    plugins: [],
    ignore: { paths: [], globs: [] },
  };
  saveConfig(projectPath, config);
  return config;
}

/**
 * Merge a parsed YAML/JSON object into the base TurpanConfig.
 * Uses untyped lookups (Record<string, unknown>) to keep the parser permissive.
 */
function mergeConfig(base: TurpanConfig, parsed: Record<string, unknown>, _projectPath: string): TurpanConfig {
  const config: TurpanConfig = { ...base };

  // Top-level scalar fields
  if (typeof parsed['version'] === 'string') config.version = parsed['version'] as string;
  if (typeof parsed['deepAnalysis'] === 'boolean') config.deepAnalysis = parsed['deepAnalysis'] as boolean;
  if (typeof parsed['uiAnalysis'] === 'boolean') config.uiAnalysis = parsed['uiAnalysis'] as boolean;
  if (typeof parsed['fixMode'] === 'boolean') config.fixMode = parsed['fixMode'] as boolean;
  if (typeof parsed['logLevel'] === 'string') {
    const lvl = parsed['logLevel'] as string;
    if (['debug', 'info', 'warn', 'error'].includes(lvl)) {
      config.logLevel = lvl as TurpanConfig['logLevel'];
    }
  }

  // Plugin list
  if (Array.isArray(parsed['plugins'])) {
    config.plugins = parsed['plugins'] as string[];
  }

  // Nested: project
  const proj = parsed['project'];
  if (proj && typeof proj === 'object' && !Array.isArray(proj)) {
    const projectObj: { name?: string } = {};
    const projRecord = proj as Record<string, unknown>;
    if (typeof projRecord['name'] === 'string') projectObj.name = projRecord['name'] as string;
    (config as unknown as { project: { name?: string } }).project = projectObj;
  }

  // Nested: commands
  const cmds = parsed['commands'];
  if (cmds && typeof cmds === 'object' && !Array.isArray(cmds)) {
    const cmdsRecord = cmds as Record<string, unknown>;
    const commandsObj: Record<string, string> = {};
    for (const key of ['install', 'build', 'test', 'lint', 'typecheck', 'dev']) {
      const v = cmdsRecord[key];
      if (typeof v === 'string' && v) commandsObj[key] = v;
    }
    (config as unknown as { commands: Record<string, string> }).commands = commandsObj;
  }

  // Nested: ui
  const ui = parsed['ui'];
  if (ui && typeof ui === 'object' && !Array.isArray(ui)) {
    const uiRecord = ui as Record<string, unknown>;
    const uiObj: {
      enabled?: boolean;
      baseUrl?: string;
      scenarios?: string[];
      viewports?: Array<'desktop' | 'mobile'>;
      testUser?: {
        enabled?: boolean;
        email?: string;
        password?: string;
        seedCommand?: string;
        loginPath?: string;
        dashboardPath?: string;
      };
      billing?: {
        testMode?: boolean;
        checkoutEndpoint?: string;
      };
    } = {};
    if (typeof uiRecord['enabled'] === 'boolean') uiObj.enabled = uiRecord['enabled'] as boolean;
    if (typeof uiRecord['baseUrl'] === 'string') uiObj.baseUrl = uiRecord['baseUrl'] as string;
    if (Array.isArray(uiRecord['scenarios'])) uiObj.scenarios = uiRecord['scenarios'] as string[];
    if (Array.isArray(uiRecord['viewports'])) {
      uiObj.viewports = (uiRecord['viewports'] as string[]).filter(
        (v): v is 'desktop' | 'mobile' => v === 'desktop' || v === 'mobile'
      );
    }

    // Nested: ui.testUser
    const tu = uiRecord['testUser'];
    if (tu && typeof tu === 'object' && !Array.isArray(tu)) {
      const tuRec = tu as Record<string, unknown>;
      const testUserObj: NonNullable<typeof uiObj.testUser> = {};
      if (typeof tuRec['enabled'] === 'boolean') testUserObj.enabled = tuRec['enabled'] as boolean;
      if (typeof tuRec['email'] === 'string') testUserObj.email = tuRec['email'] as string;
      if (typeof tuRec['password'] === 'string') testUserObj.password = tuRec['password'] as string;
      if (typeof tuRec['seedCommand'] === 'string') testUserObj.seedCommand = tuRec['seedCommand'] as string;
      if (typeof tuRec['loginPath'] === 'string') testUserObj.loginPath = tuRec['loginPath'] as string;
      if (typeof tuRec['dashboardPath'] === 'string') testUserObj.dashboardPath = tuRec['dashboardPath'] as string;
      uiObj.testUser = testUserObj;
    }

    // Nested: ui.billing
    const bill = uiRecord['billing'];
    if (bill && typeof bill === 'object' && !Array.isArray(bill)) {
      const billRec = bill as Record<string, unknown>;
      const billingObj: NonNullable<typeof uiObj.billing> = {};
      if (typeof billRec['testMode'] === 'boolean') billingObj.testMode = billRec['testMode'] as boolean;
      if (typeof billRec['checkoutEndpoint'] === 'string') billingObj.checkoutEndpoint = billRec['checkoutEndpoint'] as string;
      uiObj.billing = billingObj;
    }

    (config as unknown as { ui: typeof uiObj }).ui = uiObj;
  }

  // Nested: fix
  const fx = parsed['fix'];
  if (fx && typeof fx === 'object' && !Array.isArray(fx)) {
    const fxRecord = fx as Record<string, unknown>;
    const fixObj: {
      mode?: 'patch-only' | 'apply' | 'auto-safe' | 'report-only';
      maxFilesChanged?: number;
      allowDependencyChanges?: boolean;
      allowFileDeletion?: boolean;
    } = {};
    if (typeof fxRecord['mode'] === 'string') {
      const m = fxRecord['mode'] as string;
      if (['patch-only', 'apply', 'auto-safe', 'report-only'].includes(m)) {
        fixObj.mode = m as 'patch-only' | 'apply' | 'auto-safe' | 'report-only';
      }
    }
    if (typeof fxRecord['maxFilesChanged'] === 'number') {
      fixObj.maxFilesChanged = fxRecord['maxFilesChanged'] as number;
    }
    if (typeof fxRecord['allowDependencyChanges'] === 'boolean') {
      fixObj.allowDependencyChanges = fxRecord['allowDependencyChanges'] as boolean;
    }
    if (typeof fxRecord['allowFileDeletion'] === 'boolean') {
      fixObj.allowFileDeletion = fxRecord['allowFileDeletion'] as boolean;
    }
    (config as unknown as { fix: typeof fixObj }).fix = fixObj;
  }

  // Nested: security
  const sec = parsed['security'];
  if (sec && typeof sec === 'object' && !Array.isArray(sec)) {
    const secRecord = sec as Record<string, unknown>;
    const secObj: { redactSecrets?: boolean } = {};
    if (typeof secRecord['redactSecrets'] === 'boolean') {
      secObj.redactSecrets = secRecord['redactSecrets'] as boolean;
    }
    // Nested: security.plugins (plugin sandboxing config)
    const pluginsSec = secRecord['plugins'];
    if (pluginsSec && typeof pluginsSec === 'object' && !Array.isArray(pluginsSec)) {
      const psRecord = pluginsSec as Record<string, unknown>;
      const psObj: {
        allowExternal?: boolean;
        sandboxExternal?: boolean;
        sandboxMode?: 'worker' | 'process';
        processSandbox?: {
          enabled?: boolean;
          memoryLimitMb?: number;
          timeoutMs?: number;
          allowNetwork?: boolean;
          allowCommands?: boolean;
        };
        maxPluginRuntimeMs?: number;
        memoryCapMb?: number;
        localTrustedPermissions?: string[];
        externalUntrustedPermissions?: string[];
        pluginTrust?: Record<string, { level?: string; permissions?: string[] }>;
      } = {};
      if (typeof psRecord['allowExternal'] === 'boolean') psObj.allowExternal = psRecord['allowExternal'] as boolean;
      if (typeof psRecord['sandboxExternal'] === 'boolean') psObj.sandboxExternal = psRecord['sandboxExternal'] as boolean;
      if (psRecord['sandboxMode'] === 'worker' || psRecord['sandboxMode'] === 'process') {
        psObj.sandboxMode = psRecord['sandboxMode'] as 'worker' | 'process';
      }
      if (psRecord['processSandbox'] && typeof psRecord['processSandbox'] === 'object') {
        const psSandbox = psRecord['processSandbox'] as Record<string, unknown>;
        psObj.processSandbox = {};
        if (typeof psSandbox['enabled'] === 'boolean') psObj.processSandbox.enabled = psSandbox['enabled'] as boolean;
        if (typeof psSandbox['memoryLimitMb'] === 'number') psObj.processSandbox.memoryLimitMb = psSandbox['memoryLimitMb'] as number;
        if (typeof psSandbox['timeoutMs'] === 'number') psObj.processSandbox.timeoutMs = psSandbox['timeoutMs'] as number;
        if (typeof psSandbox['allowNetwork'] === 'boolean') psObj.processSandbox.allowNetwork = psSandbox['allowNetwork'] as boolean;
        if (typeof psSandbox['allowCommands'] === 'boolean') psObj.processSandbox.allowCommands = psSandbox['allowCommands'] as boolean;
      }
      if (typeof psRecord['maxPluginRuntimeMs'] === 'number') psObj.maxPluginRuntimeMs = psRecord['maxPluginRuntimeMs'] as number;
      if (typeof psRecord['memoryCapMb'] === 'number') psObj.memoryCapMb = psRecord['memoryCapMb'] as number;
      if (Array.isArray(psRecord['localTrustedPermissions'])) psObj.localTrustedPermissions = psRecord['localTrustedPermissions'] as string[];
      if (Array.isArray(psRecord['externalUntrustedPermissions'])) psObj.externalUntrustedPermissions = psRecord['externalUntrustedPermissions'] as string[];
      if (psRecord['pluginTrust'] && typeof psRecord['pluginTrust'] === 'object') {
        const ptRecord = psRecord['pluginTrust'] as Record<string, unknown>;
        psObj.pluginTrust = {};
        for (const [k, v] of Object.entries(ptRecord)) {
          if (v && typeof v === 'object' && !Array.isArray(v)) {
            const vrec = v as Record<string, unknown>;
            psObj.pluginTrust![k] = {
              level: typeof vrec['level'] === 'string' ? vrec['level'] as string : undefined,
              permissions: Array.isArray(vrec['permissions']) ? vrec['permissions'] as string[] : undefined,
            };
          }
        }
      }
      (secObj as unknown as { plugins: typeof psObj }).plugins = psObj;
    }
    (config as unknown as { security: typeof secObj }).security = secObj;
  }

  // Nested: ignore
  const ig = parsed['ignore'];
  if (ig && typeof ig === 'object' && !Array.isArray(ig)) {
    const igRecord = ig as Record<string, unknown>;
    const ignoreObj: { paths?: string[]; globs?: string[] } = {};
    if (Array.isArray(igRecord['paths'])) ignoreObj.paths = igRecord['paths'] as string[];
    if (Array.isArray(igRecord['globs'])) ignoreObj.globs = igRecord['globs'] as string[];
    (config as unknown as { ignore: typeof ignoreObj }).ignore = ignoreObj;
  }

  // Nested: dependencyAudit
  const depAudit = parsed['dependencyAudit'];
  if (depAudit && typeof depAudit === 'object' && !Array.isArray(depAudit)) {
    const daRecord = depAudit as Record<string, unknown>;
    const daObj: {
      enabled?: boolean;
      online?: boolean;
      failOnCritical?: boolean;
      licensePolicy?: {
        disallowed?: string[];
        warnUnknown?: boolean;
      };
    } = {};
    if (typeof daRecord['enabled'] === 'boolean') daObj.enabled = daRecord['enabled'] as boolean;
    if (typeof daRecord['online'] === 'boolean') daObj.online = daRecord['online'] as boolean;
    if (typeof daRecord['failOnCritical'] === 'boolean') daObj.failOnCritical = daRecord['failOnCritical'] as boolean;
    if (daRecord['licensePolicy'] && typeof daRecord['licensePolicy'] === 'object') {
      const lp = daRecord['licensePolicy'] as Record<string, unknown>;
      daObj.licensePolicy = {};
      if (Array.isArray(lp['disallowed'])) daObj.licensePolicy.disallowed = lp['disallowed'] as string[];
      if (typeof lp['warnUnknown'] === 'boolean') daObj.licensePolicy.warnUnknown = lp['warnUnknown'] as boolean;
    }
    (config as unknown as { dependencyAudit: typeof daObj }).dependencyAudit = daObj;
  }

  return config;
}

// ─── Tiny YAML parser (Phase 1 workaround — covers common cases) ─────────────

/**
 * Simple YAML parser supporting:
 * - top-level scalars
 * - nested objects via 2-space indent
 * - arrays via `- value` under a key
 * - inline lists: `key: [a, b, c]`
 * - comments (`#`)
 * - booleans / numbers / strings (quoted and unquoted)
 * - empty lines
 */
export function parseYaml(yaml: string): Record<string, unknown> {
  const lines = yaml.split('\n');
  const root: Record<string, unknown> = {};
  const stack: Array<{ indent: number; container: unknown; isArray: boolean; key?: string }> = [
    { indent: -1, container: root, isArray: false },
  ];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const lineNo = i + 1;
    const trimmed = rawLine.replace(/\s+$/, '');
    if (!trimmed || /^\s*#/.test(trimmed)) continue;

    const noComment = stripComment(trimmed);
    const indentMatch = noComment.match(/^(\s*)(.*)$/);
    if (!indentMatch) continue;
    const indent = indentMatch[1].length;
    const content = indentMatch[2].trim();

    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];

    if (content.startsWith('- ') || content === '-') {
      if (!parent.isArray) {
        throw new ConfigParseError(`Unexpected array item outside of array`, lineNo);
      }
      const arr = parent.container as unknown[];
      const itemContent = content === '-' ? '' : content.slice(2).trim();
      if (!itemContent) {
        const newObj: Record<string, unknown> = {};
        arr.push(newObj);
        stack.push({ indent, container: newObj, isArray: false });
      } else if (itemContent.includes(':')) {
        const colonIdx = itemContent.indexOf(':');
        const key = itemContent.slice(0, colonIdx).trim();
        const valuePart = itemContent.slice(colonIdx + 1).trim();
        const newObj: Record<string, unknown> = {};
        if (valuePart) newObj[key] = parseScalar(valuePart);
        arr.push(newObj);
        stack.push({ indent, container: newObj, isArray: false });
        if (!valuePart) {
          stack.push({ indent: indent + 2, container: newObj, isArray: false, key });
        }
      } else {
        arr.push(parseScalar(itemContent));
      }
      continue;
    }

    const colonIdx = content.indexOf(':');
    if (colonIdx === -1) {
      throw new ConfigParseError(`Expected 'key: value', got '${content}'`, lineNo);
    }
    const key = content.slice(0, colonIdx).trim();
    const valuePart = content.slice(colonIdx + 1).trim();

    if (!parent.isArray) {
      const obj = parent.container as Record<string, unknown>;

      if (!valuePart) {
        const next = lines[i + 1]?.match(/^\s*(.*)$/)?.[1] ?? '';
        if (next.startsWith('- ') || next === '-') {
          const arr: unknown[] = [];
          obj[key] = arr;
          stack.push({ indent, container: arr, isArray: true, key });
        } else if (next.trim().length > 0 && /^\s/.test(lines[i + 1] ?? '')) {
          const newObj: Record<string, unknown> = {};
          obj[key] = newObj;
          stack.push({ indent, container: newObj, isArray: false, key });
        } else {
          obj[key] = null;
        }
      } else if (valuePart.startsWith('[') && valuePart.endsWith(']')) {
        obj[key] = parseInlineList(valuePart.slice(1, -1));
      } else {
        obj[key] = parseScalar(valuePart);
      }
    }
  }

  return root;
}

function stripComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === '#' && !inSingle && !inDouble) {
      const beforeComment = line.slice(0, i);
      if (beforeComment.includes(':')) return beforeComment.trimEnd();
    }
  }
  return line.trimEnd();
}

function parseScalar(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '~') return null;
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseInlineList(content: string): unknown[] {
  return content.split(',').map(s => parseScalar(s.trim())).filter(v => v !== '');
}

// ─── YAML serializer ─────────────────────────────────────────────────────────

export function stringifyYaml(obj: Record<string, unknown>): string {
  const lines: string[] = ['# Turpan Configuration', `# https://github.com/turpan/turpan`, ''];

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'object' && !Array.isArray(value)) {
      if (Object.keys(value as object).length === 0) continue;
      lines.push(`${key}:`);
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (v === undefined || v === null) continue;
        if (Array.isArray(v)) {
          if (v.length === 0) continue;
          if (v.every(x => typeof x !== 'object' || x === null)) {
            lines.push(`  ${k}: [${v.map(formatScalar).join(', ')}]`);
          } else {
            lines.push(`  ${k}:`);
            for (const item of v) {
              lines.push(`    - ${formatScalar(item)}`);
            }
          }
        } else {
          lines.push(`  ${k}: ${formatScalar(v)}`);
        }
      }
      lines.push('');
    } else if (Array.isArray(value)) {
      if (value.length === 0) continue;
      if (value.every(x => typeof x !== 'object' || x === null)) {
        lines.push(`${key}: [${value.map(formatScalar).join(', ')}]`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  - ${formatScalar(item)}`);
        }
      }
    } else {
      lines.push(`${key}: ${formatScalar(value)}`);
    }
  }

  return lines.join('\n') + '\n';
}

function formatScalar(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (value === null || value === undefined) return '';
  return JSON.stringify(value);
}
