/**
 * Detect Project
 * Main entry point for comprehensive project fingerprinting
 */
import { resolve, isAbsolute } from 'path';
import { readJsonFile, fileExists, getPackageJsonInfo, isGitRepository, getGitInfo } from '@turpan/shared';
import { detectPackageManager } from './detectPackageManager.js';
import { detectFrameworks } from './detectFrameworks.js';
import { detectScripts } from './detectScripts.js';
import { detectRoutes } from './detectRoutes.js';
import { detectEnv } from './detectEnv.js';
import { detectGit } from './detectGit.js';
import { getCachedFingerprint, cacheFingerprint } from './fingerprintCache.js';
/**
 * Basic project detection (backwards compatible with Phase 1)
 */
export function detectBasicProject(projectPath) {
    const path = resolveProjectPath(projectPath);
    const pkg = getPackageJsonInfo(path);
    const git = isGitRepository(path) ? getGitInfo(path) : undefined;
    return {
        path,
        name: path.split('/').pop() ?? path,
        packageName: pkg?.name,
        packageVersion: pkg?.version,
        isGitRepo: !!git,
        git: git ?? undefined,
        hasPackageJson: !!pkg,
        hasTurpanConfig: fileExists(`${path}/turpan.yml`),
        hasSrcDir: fileExists(`${path}/src`),
    };
}
export function formatProjectInfo(info) {
    const lines = [];
    lines.push(`Project: ${info.name}`);
    lines.push(`Path: ${info.path}`);
    if (info.packageName) {
        lines.push(`Package: ${info.packageName}@${info.packageVersion ?? 'unknown'}`);
    }
    if (info.isGitRepo && info.git) {
        lines.push(`Git: ${info.git.branch} @ ${info.git.commitHash}${info.git.isDirty ? ' (dirty)' : ''}`);
    }
    if (info.hasTurpanConfig) {
        lines.push('Turpan: configured');
    }
    return lines.join('\n');
}
function resolveProjectPath(input) {
    if (!input) {
        return process.cwd();
    }
    return isAbsolute(input) ? input : resolve(process.cwd(), input);
}
/**
 * Main function to fingerprint a project.
 * Uses a per-process cache to avoid redundant detection.
 * Performs comprehensive detection of all project characteristics.
 */
export async function detectProjectAsync(projectRoot) {
    const cached = await getCachedFingerprint(projectRoot);
    if (cached)
        return cached;
    const fp = computeFingerprint(projectRoot);
    await cacheFingerprint(projectRoot, fp);
    return fp;
}
/**
 * Synchronous version — for legacy callers that can't await.
 * Caches the result so subsequent calls in the same process are free.
 */
export function detectProject(projectRoot) {
    // Note: synchronous path cannot read the async cache; compute every time.
    // Callers needing caching should use detectProjectAsync.
    return computeFingerprint(projectRoot);
}
function computeFingerprint(projectRoot) {
    // Run all detectors
    const gitStatus = detectGit(projectRoot);
    const pkg = readJsonFile(`${projectRoot}/package.json`);
    const packageManager = detectPackageManager(projectRoot);
    const frameworks = detectFrameworks(projectRoot);
    const scripts = detectScripts(projectRoot);
    const routes = detectRoutes(projectRoot);
    const env = detectEnv(projectRoot);
    const languages = detectLanguages(projectRoot, pkg);
    // Build the fingerprint
    const fingerprint = {
        projectRoot,
        projectName: pkg?.name || projectRoot.split('/').pop() || projectRoot,
        repositoryStatus: {
            isGitRepo: gitStatus.isGitRepo,
            branch: gitStatus.branch,
            commitHash: gitStatus.commitHash,
            isDirty: gitStatus.isDirty,
        },
        packageManager: packageManager.packageManager,
        lockFile: packageManager.lockFile,
        languages,
        runtimeType: detectRuntimeType(languages, pkg),
        appType: frameworks.appType,
        uiFramework: frameworks.uiFramework,
        backendFramework: frameworks.backendFramework,
        testTools: frameworks.testTools,
        buildCommands: scripts.buildCommands,
        devCommands: scripts.devCommands,
        lintCommands: scripts.lintCommands,
        typecheckCommands: scripts.typecheckCommands,
        testCommands: scripts.testCommands,
        packageScripts: scripts.packageScripts,
        dockerAvailable: frameworks.deploymentHints.dockerfile || false,
        dockerComposeAvailable: frameworks.deploymentHints.dockerCompose || false,
        envFiles: env.envFiles,
        envRequirements: env.envRequirements,
        routeHints: routes.routeHints,
        entrypoints: routes.entrypoints,
        databaseHints: frameworks.databaseHints,
        authHints: frameworks.authHints,
        deploymentHints: frameworks.deploymentHints,
        detectedFiles: [],
        missingFiles: [],
        fingerprintedAt: new Date().toISOString(),
    };
    // Detect important files
    fingerprint.detectedFiles = detectImportantFiles(projectRoot, fingerprint);
    fingerprint.missingFiles = detectMissingFiles(fingerprint);
    return fingerprint;
}
function detectLanguages(projectRoot, pkg) {
    const languages = new Set();
    // JavaScript/TypeScript
    if (pkg) {
        if (pkg.dependencies || pkg.devDependencies) {
            // Has package.json, likely JS/TS
            if (fileExists(`${projectRoot}/tsconfig.json`)) {
                languages.add('TypeScript');
            }
            else {
                languages.add('JavaScript');
            }
        }
    }
    // Python
    if (fileExists(`${projectRoot}/pyproject.toml`) ||
        fileExists(`${projectRoot}/requirements.txt`) ||
        fileExists(`${projectRoot}/poetry.lock`) ||
        fileExists(`${projectRoot}/uv.lock`) ||
        fileExists(`${projectRoot}/setup.py`) ||
        fileExists(`${projectRoot}/bot.py`) ||
        fileExists(`${projectRoot}/main.py`)) {
        languages.add('Python');
    }
    // Go
    if (fileExists(`${projectRoot}/go.mod`) ||
        fileExists(`${projectRoot}/go.sum`)) {
        languages.add('Go');
    }
    // Rust
    if (fileExists(`${projectRoot}/Cargo.toml`) ||
        fileExists(`${projectRoot}/Cargo.lock`)) {
        languages.add('Rust');
    }
    // Java
    if (fileExists(`${projectRoot}/pom.xml`) ||
        fileExists(`${projectRoot}/build.gradle`) ||
        fileExists(`${projectRoot}/build.gradle.kts`)) {
        languages.add('Java');
    }
    // Ruby
    if (fileExists(`${projectRoot}/Gemfile`) ||
        fileExists(`${projectRoot}/Gemfile.lock`)) {
        languages.add('Ruby');
    }
    // PHP
    if (fileExists(`${projectRoot}/composer.json`) ||
        fileExists(`${projectRoot}/composer.lock`)) {
        languages.add('PHP');
    }
    // C/C++
    if (fileExists(`${projectRoot}/CMakeLists.txt`) ||
        fileExists(`${projectRoot}/Makefile`) ||
        fileExists(`${projectRoot}/*.c`)) {
        languages.add('C/C++');
    }
    // Docker (special case - is a config format)
    if (fileExists(`${projectRoot}/Dockerfile`) ||
        fileExists(`${projectRoot}/docker-compose.yml`)) {
        // Docker is more of a deployment technology than a language
        // but we note it for completeness
    }
    return languages.size > 0 ? Array.from(languages) : ['Unknown'];
}
function detectRuntimeType(languages, pkg) {
    if (languages.includes('Python')) {
        return 'python';
    }
    if (languages.includes('JavaScript') || languages.includes('TypeScript')) {
        if (pkg?.dependencies?.bun || pkg?.devDependencies?.bun) {
            return 'bun';
        }
        // Check for Deno
        if (pkg?.dependencies?.deno || fileExists('.deno')) {
            return 'deno';
        }
        return 'node';
    }
    return 'unknown';
}
function detectImportantFiles(projectRoot, fp) {
    const files = [];
    // Core project files
    const coreFiles = [
        'package.json',
        'tsconfig.json',
        'vite.config.ts',
        'vite.config.js',
        'next.config.js',
        'next.config.ts',
        'Dockerfile',
        'docker-compose.yml',
        'docker-compose.yaml',
        'pyproject.toml',
        'requirements.txt',
        'poetry.lock',
        'README.md',
        'CONTRIBUTING.md',
        '.gitignore',
        '.env.example',
        'turpan.yml',
    ];
    for (const file of coreFiles) {
        if (fileExists(`${projectRoot}/${file}`)) {
            files.push(file);
        }
    }
    // Framework-specific files
    switch (fp.appType) {
        case 'nextjs':
            if (fileExists(`${projectRoot}/app`))
                files.push('app/');
            if (fileExists(`${projectRoot}/pages`))
                files.push('pages/');
            if (fileExists(`${projectRoot}/src/app`))
                files.push('src/app/');
            if (fileExists(`${projectRoot}/src/pages`))
                files.push('src/pages/');
            break;
        case 'vite-react':
            if (fileExists(`${projectRoot}/src/main.tsx`))
                files.push('src/main.tsx');
            if (fileExists(`${projectRoot}/src/main.ts`))
                files.push('src/main.ts');
            if (fileExists(`${projectRoot}/index.html`))
                files.push('index.html');
            break;
        case 'fastapi':
            if (fileExists(`${projectRoot}/main.py`))
                files.push('main.py');
            if (fileExists(`${projectRoot}/app.py`))
                files.push('app.py');
            break;
        case 'telegram-bot':
            if (fileExists(`${projectRoot}/bot.py`))
                files.push('bot.py');
            break;
        case 'chrome-extension':
            if (fileExists(`${projectRoot}/manifest.json`))
                files.push('manifest.json');
            if (fileExists(`${projectRoot}/background.js`))
                files.push('background.js');
            break;
        case 'mcp-server':
            if (fileExists(`${projectRoot}/src/index.ts`))
                files.push('src/index.ts');
            if (fileExists(`${projectRoot}/src/server.ts`))
                files.push('src/server.ts');
            break;
    }
    // Database schemas
    if (fileExists(`${projectRoot}/prisma/schema.prisma`)) {
        files.push('prisma/schema.prisma');
    }
    if (fileExists(`${projectRoot}/drizzle.config.ts`)) {
        files.push('drizzle.config.ts');
    }
    return files;
}
function detectMissingFiles(fp) {
    const missing = [];
    // Important missing files based on app type
    switch (fp.appType) {
        case 'nextjs':
        case 'vite-react':
            if (fp.testTools.length === 0 || fp.testTools[0] === 'unknown') {
                missing.push('No test framework detected');
            }
            if (fp.buildCommands.length === 0) {
                missing.push('No build script detected');
            }
            break;
        case 'node-backend':
            if (!fp.envFiles.some(f => f.includes('.env'))) {
                missing.push('No .env file detected');
            }
            break;
    }
    // If it's a git repo but has no .gitignore
    if (fp.repositoryStatus.isGitRepo) {
        // This would need access to project root to check
        // Skipping for now
    }
    return missing;
}
/**
 * Format a project fingerprint as a readable summary
 */
export function formatFingerprintSummary(fp) {
    const lines = [];
    lines.push(`Project: ${fp.projectName}`);
    lines.push(`Path: ${fp.projectRoot}`);
    lines.push(`Type: ${fp.appType}`);
    // Repository
    if (fp.repositoryStatus.isGitRepo) {
        lines.push(`Git: ${fp.repositoryStatus.branch} @ ${fp.repositoryStatus.commitHash}${fp.repositoryStatus.isDirty ? ' (dirty)' : ''}`);
    }
    // Languages & Package Manager
    lines.push(`Languages: ${fp.languages.join(', ')}`);
    if (fp.packageManager !== 'unknown') {
        lines.push(`Package Manager: ${fp.packageManager}`);
    }
    // Frameworks
    if (fp.uiFramework !== 'unknown' && fp.uiFramework !== 'none') {
        lines.push(`UI: ${fp.uiFramework}`);
    }
    if (fp.backendFramework !== 'unknown' && fp.backendFramework !== 'none') {
        lines.push(`Backend: ${fp.backendFramework}`);
    }
    // Scripts
    const scriptParts = [];
    if (fp.buildCommands.length > 0)
        scriptParts.push(`build: ${fp.buildCommands.join(', ')}`);
    if (fp.devCommands.length > 0)
        scriptParts.push(`dev: ${fp.devCommands.join(', ')}`);
    if (fp.testCommands.length > 0)
        scriptParts.push(`test: ${fp.testCommands.join(', ')}`);
    if (scriptParts.length > 0) {
        lines.push(`Scripts: ${scriptParts.join(' | ')}`);
    }
    // Docker
    if (fp.dockerAvailable)
        lines.push('Docker: available');
    if (fp.dockerComposeAvailable)
        lines.push('Docker Compose: available');
    // Env files (without showing secrets)
    if (fp.envFiles.length > 0) {
        lines.push(`Env Files: ${fp.envFiles.join(', ')}`);
    }
    // Test tools
    if (fp.testTools.length > 0 && fp.testTools[0] !== 'unknown') {
        lines.push(`Test Tools: ${fp.testTools.join(', ')}`);
    }
    // Missing
    if (fp.missingFiles.length > 0) {
        lines.push(`⚠ Missing: ${fp.missingFiles.join(', ')}`);
    }
    return lines.join('\n');
}
//# sourceMappingURL=detectProject.js.map