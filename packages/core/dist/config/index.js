import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
const DEFAULT_CONFIG = {
    version: '0.1.0',
    projectPath: '',
    runPath: '',
    deepAnalysis: false,
    uiAnalysis: false,
    fixMode: false,
    logLevel: 'info',
};
export class ConfigParseError extends Error {
    line;
    constructor(message, line) {
        super(message);
        this.line = line;
        this.name = 'ConfigParseError';
    }
}
/**
 * Load turpan.yml from a project path.
 * Tries YAML first, falls back to JSON, then to defaults.
 * Never throws — returns defaults if anything goes wrong.
 */
export function loadConfig(projectPath) {
    const configPath = join(projectPath, 'turpan.yml');
    const jsonPath = join(projectPath, 'turpan.json');
    const baseConfig = {
        ...DEFAULT_CONFIG,
        projectPath,
        runPath: join(projectPath, '.turpan', 'runs'),
    };
    if (existsSync(configPath)) {
        try {
            const content = readFileSync(configPath, 'utf-8');
            const parsed = parseYaml(content);
            return mergeConfig(baseConfig, parsed, projectPath);
        }
        catch {
            return { ...baseConfig };
        }
    }
    if (existsSync(jsonPath)) {
        try {
            const content = readFileSync(jsonPath, 'utf-8');
            const parsed = JSON.parse(content);
            return mergeConfig(baseConfig, parsed, projectPath);
        }
        catch {
            return { ...baseConfig };
        }
    }
    return baseConfig;
}
export function saveConfig(projectPath, config) {
    const configPath = join(projectPath, 'turpan.yml');
    const fullConfig = loadConfig(projectPath);
    const merged = { ...fullConfig, ...config };
    const yaml = stringifyYaml(merged);
    writeFileSync(configPath, yaml, 'utf-8');
}
export function createDefaultConfig(projectPath) {
    const config = {
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
function mergeConfig(base, parsed, _projectPath) {
    const config = { ...base };
    // Top-level scalar fields
    if (typeof parsed['version'] === 'string')
        config.version = parsed['version'];
    if (typeof parsed['deepAnalysis'] === 'boolean')
        config.deepAnalysis = parsed['deepAnalysis'];
    if (typeof parsed['uiAnalysis'] === 'boolean')
        config.uiAnalysis = parsed['uiAnalysis'];
    if (typeof parsed['fixMode'] === 'boolean')
        config.fixMode = parsed['fixMode'];
    if (typeof parsed['logLevel'] === 'string') {
        const lvl = parsed['logLevel'];
        if (['debug', 'info', 'warn', 'error'].includes(lvl)) {
            config.logLevel = lvl;
        }
    }
    // Plugin list
    if (Array.isArray(parsed['plugins'])) {
        config.plugins = parsed['plugins'];
    }
    // Nested: project
    const proj = parsed['project'];
    if (proj && typeof proj === 'object' && !Array.isArray(proj)) {
        const projectObj = {};
        const projRecord = proj;
        if (typeof projRecord['name'] === 'string')
            projectObj.name = projRecord['name'];
        config.project = projectObj;
    }
    // Nested: commands
    const cmds = parsed['commands'];
    if (cmds && typeof cmds === 'object' && !Array.isArray(cmds)) {
        const cmdsRecord = cmds;
        const commandsObj = {};
        for (const key of ['install', 'build', 'test', 'lint', 'typecheck', 'dev']) {
            const v = cmdsRecord[key];
            if (typeof v === 'string' && v)
                commandsObj[key] = v;
        }
        config.commands = commandsObj;
    }
    // Nested: ui
    const ui = parsed['ui'];
    if (ui && typeof ui === 'object' && !Array.isArray(ui)) {
        const uiRecord = ui;
        const uiObj = {};
        if (typeof uiRecord['enabled'] === 'boolean')
            uiObj.enabled = uiRecord['enabled'];
        if (typeof uiRecord['baseUrl'] === 'string')
            uiObj.baseUrl = uiRecord['baseUrl'];
        if (Array.isArray(uiRecord['scenarios']))
            uiObj.scenarios = uiRecord['scenarios'];
        if (Array.isArray(uiRecord['viewports'])) {
            uiObj.viewports = uiRecord['viewports'].filter((v) => v === 'desktop' || v === 'mobile');
        }
        // Nested: ui.testUser
        const tu = uiRecord['testUser'];
        if (tu && typeof tu === 'object' && !Array.isArray(tu)) {
            const tuRec = tu;
            const testUserObj = {};
            if (typeof tuRec['enabled'] === 'boolean')
                testUserObj.enabled = tuRec['enabled'];
            if (typeof tuRec['email'] === 'string')
                testUserObj.email = tuRec['email'];
            if (typeof tuRec['password'] === 'string')
                testUserObj.password = tuRec['password'];
            if (typeof tuRec['seedCommand'] === 'string')
                testUserObj.seedCommand = tuRec['seedCommand'];
            if (typeof tuRec['loginPath'] === 'string')
                testUserObj.loginPath = tuRec['loginPath'];
            if (typeof tuRec['dashboardPath'] === 'string')
                testUserObj.dashboardPath = tuRec['dashboardPath'];
            uiObj.testUser = testUserObj;
        }
        // Nested: ui.billing
        const bill = uiRecord['billing'];
        if (bill && typeof bill === 'object' && !Array.isArray(bill)) {
            const billRec = bill;
            const billingObj = {};
            if (typeof billRec['testMode'] === 'boolean')
                billingObj.testMode = billRec['testMode'];
            if (typeof billRec['checkoutEndpoint'] === 'string')
                billingObj.checkoutEndpoint = billRec['checkoutEndpoint'];
            uiObj.billing = billingObj;
        }
        config.ui = uiObj;
    }
    // Nested: fix
    const fx = parsed['fix'];
    if (fx && typeof fx === 'object' && !Array.isArray(fx)) {
        const fxRecord = fx;
        const fixObj = {};
        if (typeof fxRecord['mode'] === 'string') {
            const m = fxRecord['mode'];
            if (['patch-only', 'apply', 'auto-safe', 'report-only'].includes(m)) {
                fixObj.mode = m;
            }
        }
        if (typeof fxRecord['maxFilesChanged'] === 'number') {
            fixObj.maxFilesChanged = fxRecord['maxFilesChanged'];
        }
        if (typeof fxRecord['allowDependencyChanges'] === 'boolean') {
            fixObj.allowDependencyChanges = fxRecord['allowDependencyChanges'];
        }
        if (typeof fxRecord['allowFileDeletion'] === 'boolean') {
            fixObj.allowFileDeletion = fxRecord['allowFileDeletion'];
        }
        config.fix = fixObj;
    }
    // Nested: security
    const sec = parsed['security'];
    if (sec && typeof sec === 'object' && !Array.isArray(sec)) {
        const secRecord = sec;
        const secObj = {};
        if (typeof secRecord['redactSecrets'] === 'boolean') {
            secObj.redactSecrets = secRecord['redactSecrets'];
        }
        // Nested: security.plugins (plugin sandboxing config)
        const pluginsSec = secRecord['plugins'];
        if (pluginsSec && typeof pluginsSec === 'object' && !Array.isArray(pluginsSec)) {
            const psRecord = pluginsSec;
            const psObj = {};
            if (typeof psRecord['allowExternal'] === 'boolean')
                psObj.allowExternal = psRecord['allowExternal'];
            if (typeof psRecord['sandboxExternal'] === 'boolean')
                psObj.sandboxExternal = psRecord['sandboxExternal'];
            if (psRecord['sandboxMode'] === 'worker' || psRecord['sandboxMode'] === 'process') {
                psObj.sandboxMode = psRecord['sandboxMode'];
            }
            if (psRecord['processSandbox'] && typeof psRecord['processSandbox'] === 'object') {
                const psSandbox = psRecord['processSandbox'];
                psObj.processSandbox = {};
                if (typeof psSandbox['enabled'] === 'boolean')
                    psObj.processSandbox.enabled = psSandbox['enabled'];
                if (typeof psSandbox['memoryLimitMb'] === 'number')
                    psObj.processSandbox.memoryLimitMb = psSandbox['memoryLimitMb'];
                if (typeof psSandbox['timeoutMs'] === 'number')
                    psObj.processSandbox.timeoutMs = psSandbox['timeoutMs'];
                if (typeof psSandbox['allowNetwork'] === 'boolean')
                    psObj.processSandbox.allowNetwork = psSandbox['allowNetwork'];
                if (typeof psSandbox['allowCommands'] === 'boolean')
                    psObj.processSandbox.allowCommands = psSandbox['allowCommands'];
            }
            if (typeof psRecord['maxPluginRuntimeMs'] === 'number')
                psObj.maxPluginRuntimeMs = psRecord['maxPluginRuntimeMs'];
            if (typeof psRecord['memoryCapMb'] === 'number')
                psObj.memoryCapMb = psRecord['memoryCapMb'];
            if (Array.isArray(psRecord['localTrustedPermissions']))
                psObj.localTrustedPermissions = psRecord['localTrustedPermissions'];
            if (Array.isArray(psRecord['externalUntrustedPermissions']))
                psObj.externalUntrustedPermissions = psRecord['externalUntrustedPermissions'];
            if (psRecord['pluginTrust'] && typeof psRecord['pluginTrust'] === 'object') {
                const ptRecord = psRecord['pluginTrust'];
                psObj.pluginTrust = {};
                for (const [k, v] of Object.entries(ptRecord)) {
                    if (v && typeof v === 'object' && !Array.isArray(v)) {
                        const vrec = v;
                        psObj.pluginTrust[k] = {
                            level: typeof vrec['level'] === 'string' ? vrec['level'] : undefined,
                            permissions: Array.isArray(vrec['permissions']) ? vrec['permissions'] : undefined,
                        };
                    }
                }
            }
            secObj.plugins = psObj;
        }
        config.security = secObj;
    }
    // Nested: ignore
    const ig = parsed['ignore'];
    if (ig && typeof ig === 'object' && !Array.isArray(ig)) {
        const igRecord = ig;
        const ignoreObj = {};
        if (Array.isArray(igRecord['paths']))
            ignoreObj.paths = igRecord['paths'];
        if (Array.isArray(igRecord['globs']))
            ignoreObj.globs = igRecord['globs'];
        config.ignore = ignoreObj;
    }
    // Nested: dependencyAudit
    const depAudit = parsed['dependencyAudit'];
    if (depAudit && typeof depAudit === 'object' && !Array.isArray(depAudit)) {
        const daRecord = depAudit;
        const daObj = {};
        if (typeof daRecord['enabled'] === 'boolean')
            daObj.enabled = daRecord['enabled'];
        if (typeof daRecord['online'] === 'boolean')
            daObj.online = daRecord['online'];
        if (typeof daRecord['failOnCritical'] === 'boolean')
            daObj.failOnCritical = daRecord['failOnCritical'];
        if (daRecord['licensePolicy'] && typeof daRecord['licensePolicy'] === 'object') {
            const lp = daRecord['licensePolicy'];
            daObj.licensePolicy = {};
            if (Array.isArray(lp['disallowed']))
                daObj.licensePolicy.disallowed = lp['disallowed'];
            if (typeof lp['warnUnknown'] === 'boolean')
                daObj.licensePolicy.warnUnknown = lp['warnUnknown'];
        }
        config.dependencyAudit = daObj;
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
export function parseYaml(yaml) {
    const lines = yaml.split('\n');
    const root = {};
    const stack = [
        { indent: -1, container: root, isArray: false },
    ];
    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const lineNo = i + 1;
        const trimmed = rawLine.replace(/\s+$/, '');
        if (!trimmed || /^\s*#/.test(trimmed))
            continue;
        const noComment = stripComment(trimmed);
        const indentMatch = noComment.match(/^(\s*)(.*)$/);
        if (!indentMatch)
            continue;
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
            const arr = parent.container;
            const itemContent = content === '-' ? '' : content.slice(2).trim();
            if (!itemContent) {
                const newObj = {};
                arr.push(newObj);
                stack.push({ indent, container: newObj, isArray: false });
            }
            else if (itemContent.includes(':')) {
                const colonIdx = itemContent.indexOf(':');
                const key = itemContent.slice(0, colonIdx).trim();
                const valuePart = itemContent.slice(colonIdx + 1).trim();
                const newObj = {};
                if (valuePart)
                    newObj[key] = parseScalar(valuePart);
                arr.push(newObj);
                stack.push({ indent, container: newObj, isArray: false });
                if (!valuePart) {
                    stack.push({ indent: indent + 2, container: newObj, isArray: false, key });
                }
            }
            else {
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
            const obj = parent.container;
            if (!valuePart) {
                const next = lines[i + 1]?.match(/^\s*(.*)$/)?.[1] ?? '';
                if (next.startsWith('- ') || next === '-') {
                    const arr = [];
                    obj[key] = arr;
                    stack.push({ indent, container: arr, isArray: true, key });
                }
                else if (next.trim().length > 0 && /^\s/.test(lines[i + 1] ?? '')) {
                    const newObj = {};
                    obj[key] = newObj;
                    stack.push({ indent, container: newObj, isArray: false, key });
                }
                else {
                    obj[key] = null;
                }
            }
            else if (valuePart.startsWith('[') && valuePart.endsWith(']')) {
                obj[key] = parseInlineList(valuePart.slice(1, -1));
            }
            else {
                obj[key] = parseScalar(valuePart);
            }
        }
    }
    return root;
}
function stripComment(line) {
    let inSingle = false;
    let inDouble = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === "'" && !inDouble)
            inSingle = !inSingle;
        else if (c === '"' && !inSingle)
            inDouble = !inDouble;
        else if (c === '#' && !inSingle && !inDouble) {
            const beforeComment = line.slice(0, i);
            if (beforeComment.includes(':'))
                return beforeComment.trimEnd();
        }
    }
    return line.trimEnd();
}
function parseScalar(value) {
    if (value === 'true')
        return true;
    if (value === 'false')
        return false;
    if (value === 'null' || value === '~')
        return null;
    if (/^-?\d+$/.test(value))
        return parseInt(value, 10);
    if (/^-?\d+\.\d+$/.test(value))
        return parseFloat(value);
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
        return value.slice(1, -1);
    }
    return value;
}
function parseInlineList(content) {
    return content.split(',').map(s => parseScalar(s.trim())).filter(v => v !== '');
}
// ─── YAML serializer ─────────────────────────────────────────────────────────
export function stringifyYaml(obj) {
    const lines = ['# Turpan Configuration', `# https://github.com/turpan/turpan`, ''];
    for (const [key, value] of Object.entries(obj)) {
        if (value === undefined || value === null)
            continue;
        if (typeof value === 'object' && !Array.isArray(value)) {
            if (Object.keys(value).length === 0)
                continue;
            lines.push(`${key}:`);
            for (const [k, v] of Object.entries(value)) {
                if (v === undefined || v === null)
                    continue;
                if (Array.isArray(v)) {
                    if (v.length === 0)
                        continue;
                    if (v.every(x => typeof x !== 'object' || x === null)) {
                        lines.push(`  ${k}: [${v.map(formatScalar).join(', ')}]`);
                    }
                    else {
                        lines.push(`  ${k}:`);
                        for (const item of v) {
                            lines.push(`    - ${formatScalar(item)}`);
                        }
                    }
                }
                else {
                    lines.push(`  ${k}: ${formatScalar(v)}`);
                }
            }
            lines.push('');
        }
        else if (Array.isArray(value)) {
            if (value.length === 0)
                continue;
            if (value.every(x => typeof x !== 'object' || x === null)) {
                lines.push(`${key}: [${value.map(formatScalar).join(', ')}]`);
            }
            else {
                lines.push(`${key}:`);
                for (const item of value) {
                    lines.push(`  - ${formatScalar(item)}`);
                }
            }
        }
        else {
            lines.push(`${key}: ${formatScalar(value)}`);
        }
    }
    return lines.join('\n') + '\n';
}
function formatScalar(value) {
    if (typeof value === 'string')
        return value;
    if (typeof value === 'boolean' || typeof value === 'number')
        return String(value);
    if (value === null || value === undefined)
        return '';
    return JSON.stringify(value);
}
//# sourceMappingURL=index.js.map