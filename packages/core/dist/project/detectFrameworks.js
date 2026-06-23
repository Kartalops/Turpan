/**
 * Detect Frameworks
 * Detects app type, UI framework, backend framework, and test tools
 */
import { readJsonFile, fileExists } from '@turpan/shared';
import { readFileSync } from 'fs';
export function detectFrameworks(projectRoot) {
    const pkg = readJsonFile(`${projectRoot}/package.json`);
    const deps = {
        ...pkg?.dependencies,
        ...pkg?.devDependencies,
    };
    const result = {
        appType: 'unknown',
        uiFramework: 'unknown',
        backendFramework: 'unknown',
        testTools: [],
        databaseHints: [],
        authHints: [],
        deploymentHints: {},
    };
    // Detect app type
    result.appType = detectAppType(projectRoot, deps);
    result.uiFramework = detectUiFramework(deps);
    result.backendFramework = detectBackendFramework(deps, result.appType);
    result.testTools = detectTestTools(deps);
    result.databaseHints = detectDatabases(projectRoot, deps);
    result.authHints = detectAuth(deps);
    result.deploymentHints = detectDeployment(projectRoot);
    return result;
}
function detectAppType(projectRoot, deps) {
    // Next.js
    if (deps.next) {
        return 'nextjs';
    }
    // Vite + React
    if (deps.vite && (deps.react || deps['react-dom'])) {
        return 'vite-react';
    }
    // Telegram bot
    if (deps['node-telegram-bot-api'] || deps.telegram || deps['telegraf']) {
        return 'telegram-bot';
    }
    // MCP server
    if (deps['@modelcontextprotocol/sdk'] || deps.mcp) {
        return 'mcp-server';
    }
    // Chrome extension
    if (fileExists(`${projectRoot}/manifest.json`)) {
        return 'chrome-extension';
    }
    // Docker project (has Dockerfile but no other indicators)
    if (fileExists(`${projectRoot}/Dockerfile`)) {
        return 'docker';
    }
    // Node backend (Express/Fastify but not a React app)
    if (deps.express || deps.fastify || deps.koa || deps.nestjs) {
        return 'node-backend';
    }
    // Check for Python files (FastAPI should be detected before python-bot)
    if (fileExists(`${projectRoot}/bot.py`) || fileExists(`${projectRoot}/main.py`)) {
        const pyprojectExists = fileExists(`${projectRoot}/pyproject.toml`);
        const requirementsExists = fileExists(`${projectRoot}/requirements.txt`);
        // Check pyproject.toml for FastAPI/Flask/Django
        if (pyprojectExists) {
            try {
                const pyprojectContent = readFileSync(`${projectRoot}/pyproject.toml`, 'utf-8');
                if (pyprojectContent.includes('fastapi')) {
                    return 'fastapi';
                }
                if (pyprojectContent.includes('flask')) {
                    return 'fastapi'; // Flask uses similar patterns
                }
                if (pyprojectContent.includes('django')) {
                    return 'fastapi'; // Django REST framework
                }
            }
            catch {
                // Ignore
            }
        }
        // Also check deps from package.json
        if (deps.fastapi || deps.flask || deps.django) {
            return 'fastapi';
        }
        if (pyprojectExists || requirementsExists) {
            return 'python-bot';
        }
    }
    // FastAPI (Python)
    if (deps.fastapi) {
        return 'fastapi';
    }
    return 'unknown';
}
function detectUiFramework(deps) {
    if (deps.next)
        return 'nextjs';
    if (deps.react)
        return 'react';
    if (deps.vue)
        return 'vue';
    if (deps.svelte)
        return 'svelte';
    if (deps.solid)
        return 'solid';
    if (deps['@angular/core'])
        return 'angular';
    return 'unknown';
}
function detectBackendFramework(deps, appType) {
    // If it's a Next.js app, backend is Next.js
    if (appType === 'nextjs')
        return 'nextjs';
    if (deps.nestjs)
        return 'nestjs';
    if (deps.fastify)
        return 'fastify';
    if (deps.express)
        return 'express';
    if (deps.fastapi)
        return 'fastapi';
    if (deps.django)
        return 'django';
    if (deps.flask)
        return 'flask';
    // If UI framework detected but no backend, it's probably "none"
    if (deps.react || deps.vue || deps.svelte || deps.solid) {
        return 'none';
    }
    return 'unknown';
}
function detectTestTools(deps) {
    const tools = [];
    if (deps.vitest || deps['@vitest/coverage-v8']) {
        tools.push('vitest');
    }
    if (deps.jest || deps['@jest/globals']) {
        tools.push('jest');
    }
    if (deps.playwright || deps['@playwright/test']) {
        tools.push('playwright');
    }
    if (deps.cypress || deps['@cypress/code-coverage']) {
        tools.push('cypress');
    }
    if (deps.pytest) {
        tools.push('pytest');
    }
    if (tools.length === 0) {
        return ['unknown'];
    }
    return tools;
}
function detectDatabases(projectRoot, deps) {
    const hints = [];
    // Prisma
    if (deps.prisma || fileExists(`${projectRoot}/prisma/schema.prisma`)) {
        hints.push({
            type: 'prisma',
            orm: 'prisma',
            schemaFiles: fileExists(`${projectRoot}/prisma/schema.prisma`)
                ? ['prisma/schema.prisma']
                : undefined,
        });
    }
    // Drizzle
    if (deps['drizzle-orm'] || fileExists(`${projectRoot}/drizzle.config.ts`)) {
        hints.push({
            type: 'drizzle',
            orm: 'drizzle',
        });
    }
    // MongoDB
    if (deps.mongoose || deps['@nestjs/mongoose'] || deps.mongodb) {
        hints.push({ type: 'mongodb' });
    }
    // PostgreSQL (common drivers)
    if (deps.pg || deps['pg-pool'] || deps['postgres'] || deps['@nestjs/typeorm']) {
        hints.push({ type: 'postgresql' });
    }
    // Redis
    if (deps.ioredis || deps.redis || deps['@nestjs/cache-manager']) {
        hints.push({ type: 'redis' });
    }
    return hints;
}
function detectAuth(deps) {
    const hints = [];
    const types = [];
    if (deps['next-auth'] || deps['@next-auth'] || deps['nextauth']) {
        types.push('next-auth');
    }
    if (deps['@clerk/clerk-sdk-node'] || deps['@clerk/express']) {
        types.push('clerk');
    }
    if (deps['@supabase/supabase-js'] || deps.supabase) {
        types.push('supabase');
    }
    if (deps['firebase-admin'] || deps.firebase) {
        types.push('firebase');
    }
    if (deps['passport'] || deps['passport-local'] || deps['@nestjs/passport']) {
        types.push('passport');
    }
    if (deps.jsonwebtoken || deps['@types/jsonwebtoken']) {
        types.push('jwt');
    }
    if (types.length > 0) {
        hints.push({ type: types });
    }
    return hints;
}
function detectDeployment(projectRoot) {
    const hints = {};
    hints.dockerfile = fileExists(`${projectRoot}/Dockerfile`);
    hints.dockerCompose = fileExists(`${projectRoot}/docker-compose.yml`) ||
        fileExists(`${projectRoot}/docker-compose.yaml`);
    // Check for common deployment platforms
    const pkg = readJsonFile(`${projectRoot}/package.json`);
    const scripts = pkg?.scripts || {};
    hints.hasBuildScript = !!(scripts.build || scripts.deploy);
    // Detect platform
    if (fileExists(`${projectRoot}/vercel.json`)) {
        hints.platform = 'vercel';
    }
    else if (fileExists(`${projectRoot}/netlify.toml`)) {
        hints.platform = 'netlify';
    }
    else if (fileExists(`${projectRoot}/render.yaml`)) {
        hints.platform = 'render';
    }
    else if (fileExists(`${projectRoot}/fly.toml`)) {
        hints.platform = 'flyio';
    }
    return hints;
}
//# sourceMappingURL=detectFrameworks.js.map