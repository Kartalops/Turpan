/**
 * ReadmeMismatchAnalyzer — detects README claims not backed by code
 *
 * Detects when README.md says a feature exists but the code doesn't support it,
 * or when documentation contradicts actual implementation.
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
const README_PATTERNS = [
    {
        category: 'auth',
        label: 'README claims authentication features',
        keywords: ['authenticate', 'built-in auth', 'JWT auth', 'login built-in', 'OAuth built-in', 'session built-in'],
    },
    {
        category: 'billing',
        label: 'README claims billing/payment features',
        keywords: ['Stripe integration', 'billing built-in', 'payment built-in', 'accepts payment', 'subscription built-in'],
    },
    {
        category: 'database',
        label: 'README claims database persistence',
        keywords: ['Prisma ORM', 'PostgreSQL built', 'MongoDB built', 'database built', 'data persists'],
    },
    {
        category: 'api',
        label: 'README claims API endpoints',
        keywords: ['REST API', 'GraphQL API', 'API endpoints built', 'API built-in', '/api/ endpoint'],
    },
    {
        category: 'email',
        label: 'README claims email features',
        keywords: ['sendgrid', 'nodemailer', 'mailgun', 'built-in email', 'email built-in', 'sends email'],
    },
    {
        category: 'mcp',
        label: 'README claims MCP server',
        keywords: ['MCP server', 'Model Context Protocol'],
    },
    {
        category: 'deployment',
        label: 'README claims deployment automation',
        keywords: ['one-click deploy', 'Docker built-in', 'deploy built-in', 'GitHub Action built'],
    },
    {
        category: 'tests',
        label: 'README claims testing',
        keywords: ['Playwright built', 'testing built-in', 'tests built-in', 'batteries included'],
    },
];
// Patterns that indicate the feature IS actually implemented
const IMPLEMENTATION_PATTERNS = {
    auth: ['verifyJwt', 'jwtVerify', 'bcrypt.hash', 'argon2', 'passport.authenticate', 'sessionStore', 'authenticate('],
    billing: ['stripe.paymentIntent', 'stripe.subscribe', 'stripe.checkout', 'paymentIntent.create', 'checkoutSession'],
    database: ['prisma.', 'drizzle.', 'sequelize.', 'typeorm.', 'db.create(', 'db.findMany', 'db.findUnique'],
    api: ['router.get', 'router.post', 'app.get(', 'app.post(', '@app.get', 'fastify.get', '/api/'],
    email: ['sendgrid.', 'nodemailer.', 'mailgun.', '.sendMail(', '.send('],
    mcp: ['@modelcontextprotocol', 'createMcpServer', 'mcp-server'],
    deployment: ['docker-compose', 'Dockerfile', '.github/workflows', 'vercel.json', 'netlify.toml'],
    tests: ['playwright.', 'vitest', 'jest.', '.test.ts', '.spec.ts', 'describe(', 'it('],
};
export function analyzeReadmeMismatch(opts) {
    const { projectRoot, taskCapabilities } = opts;
    const issues = [];
    const readmePath = join(projectRoot, 'README.md');
    if (!existsSync(readmePath))
        return issues;
    let readmeContent = '';
    try {
        readmeContent = readFileSync(readmePath, 'utf-8');
    }
    catch {
        return issues;
    }
    const lines = readmeContent.split('\n');
    for (const { category, label, keywords } of README_PATTERNS) {
        const inTask = taskCapabilities.some(c => c.toLowerCase() === category.toLowerCase());
        if (!inTask)
            continue;
        for (const keyword of keywords) {
            const lowerContent = readmeContent.toLowerCase();
            const lowerKeyword = keyword.toLowerCase();
            if (!lowerContent.includes(lowerKeyword))
                continue;
            // Find which line contains this
            let matchLine = -1;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].toLowerCase().includes(lowerKeyword)) {
                    matchLine = i;
                    break;
                }
            }
            // Check if any implementation evidence exists
            const implPatterns = IMPLEMENTATION_PATTERNS[category] ?? [];
            const hasImpl = implPatterns.length > 0 && scanForStrings(projectRoot, implPatterns);
            if (!hasImpl) {
                issues.push({
                    kind: 'readme-mismatch',
                    severity: 'medium',
                    title: `README claims ${category} but no evidence of real implementation found`,
                    explanation: `README line ${matchLine + 1} mentions "${keyword}" for ${category}, but no corresponding implementation files were found. This suggests the README describes a planned feature that was not built.`,
                    file: 'README.md',
                    line: matchLine + 1,
                    suggestedFix: `Either implement the ${category} feature or remove the claim from README. If it is planned, mark it as "(coming soon)" or move it to a ROADMAP section.`,
                    confidence: 70,
                    evidence: [
                        {
                            type: 'readme',
                            path: 'README.md',
                            line: matchLine + 1,
                            excerpt: lines[matchLine]?.trim().slice(0, 200) ?? '',
                        },
                    ],
                });
            }
            break; // one match per category is enough
        }
    }
    return issues;
}
function scanForStrings(projectRoot, strings) {
    function walk(dir, depth) {
        if (depth > 4)
            return false;
        try {
            const entries = readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'build')
                    continue;
                const fullPath = join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (walk(fullPath, depth + 1))
                        return true;
                }
                else if (entry.isFile()) {
                    const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
                    const textExts = ['ts', 'tsx', 'js', 'jsx', 'mjs', 'py', 'go', 'rs', 'java', 'sh', 'json', 'yaml', 'yml'];
                    if (!textExts.includes(ext))
                        continue;
                    try {
                        const content = readFileSync(fullPath, 'utf-8');
                        for (const s of strings) {
                            if (content.includes(s))
                                return true;
                        }
                    }
                    catch {
                        // skip
                    }
                }
            }
        }
        catch {
            // skip
        }
        return false;
    }
    return walk(projectRoot, 0);
}
//# sourceMappingURL=ReadmeMismatchAnalyzer.js.map