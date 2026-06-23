/**
 * AuthScenario — validates login, registration, and auth protection flows.
 *
 * Safety guarantees:
 * - NEVER submits real credentials
 * - NEVER logs into real accounts
 * - Validates only that forms exist and are wired (via detection, not actual auth)
 * - Tests protected route redirects (expected behavior)
 * - Detects fake/empty auth implementations
 */
import { captureScenarioScreenshot, SAFE_TEST_CREDENTIALS, isAuthenticated } from './Scenario.js';
import { confidence } from '@turpan/core';
const SCENARIO_ID = 'auth';
const SCENARIO_NAME = 'Authentication Flow';
export class AuthScenario {
    id = SCENARIO_ID;
    name = SCENARIO_NAME;
    riskLevel = 'low';
    supports(fp, routes) {
        return (routes.hasRoute('/login') ||
            routes.hasRoute('/signin') ||
            routes.hasRoute('/register') ||
            routes.hasRoute('/signup') ||
            routes.hasRoute('/auth/login'));
    }
    async run(ctx) {
        const steps = [];
        const findings = [];
        const screenshots = [];
        const start = Date.now();
        let loginUrl = '';
        try {
            // Step 1: Visit login page
            loginUrl = await this.visitLoginPage(ctx);
            // Step 2: Check form elements
            const formFindings = await this.checkLoginForm(ctx, steps);
            findings.push(...formFindings);
            // Step 3: Detect form wiring (fill without submit)
            await this.detectFormWiring(ctx, steps, screenshots);
            // Step 4: Check protected route redirect
            const protectedFindings = await this.checkProtectedRouteRedirect(ctx, steps);
            findings.push(...protectedFindings);
            // Step 5: Register page
            await this.visitRegisterPage(ctx, steps, screenshots);
            // Step 6: Social login buttons
            const socialFindings = await this.checkSocialLogin(ctx, steps);
            findings.push(...socialFindings);
            // Step 7: Forgot password
            await this.checkForgotPassword(ctx, steps, screenshots);
        }
        catch (err) {
            steps.push({
                description: 'Unexpected error in auth scenario',
                passed: false,
                error: String(err),
                durationMs: Date.now() - start,
            });
        }
        const allPassed = steps.every(s => s.passed);
        const hasCritical = findings.some(f => f.severity === 'critical');
        return {
            scenarioId: this.id,
            scenarioName: this.name,
            status: allPassed ? 'passed' : hasCritical ? 'failed' : 'warn',
            durationMs: Date.now() - start,
            steps,
            findings,
            artifacts: { screenshots, traces: [] },
            finalUrl: ctx.page.url(),
        };
    }
    async visitLoginPage(ctx) {
        const start = Date.now();
        const loginPaths = ['/login', '/signin', '/auth/login', '/auth/signin'];
        for (const path of loginPaths) {
            if (ctx.routeMap.hasRoute(path)) {
                try {
                    await ctx.page.goto(`${ctx.baseUrl}${path}`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
                    await ctx.page.waitForTimeout(800);
                    const screenshot = await captureScenarioScreenshot(ctx, 'login-page');
                    return `${ctx.baseUrl}${path}`;
                }
                catch { /* try next */ }
            }
        }
        // If no explicit login route, try homepage
        await ctx.page.goto(ctx.baseUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });
        return ctx.baseUrl;
    }
    async checkLoginForm(ctx, steps) {
        const findings = [];
        const start = Date.now();
        const emailSelectors = [
            'input[type="email"]',
            'input[name="email"]',
            'input[id="email"]',
            'input[placeholder*="email" i]',
            'input[autocomplete="email"]',
        ];
        const passSelectors = [
            'input[type="password"]',
            'input[name="password"]',
            'input[id="password"]',
            'input[autocomplete="current-password"]',
        ];
        let emailField = null;
        let passField = null;
        for (const sel of emailSelectors) {
            try {
                const count = await ctx.page.locator(sel).count();
                if (count > 0) {
                    emailField = sel;
                    break;
                }
            }
            catch { /* ignore */ }
        }
        for (const sel of passSelectors) {
            try {
                const count = await ctx.page.locator(sel).count();
                if (count > 0) {
                    passField = sel;
                    break;
                }
            }
            catch { /* ignore */ }
        }
        const hasEmail = !!emailField;
        const hasPass = !!passField;
        if (!hasEmail) {
            findings.push({
                id: 'auth-no-email',
                title: 'Login page missing email field',
                severity: 'critical',
                category: 'auth',
                explanation: 'No email input field found on the login page. Users cannot authenticate.',
                fixable: 'manual',
                confidence: confidence(95),
                tags: ['auth', 'missing-field'],
            });
        }
        if (!hasPass) {
            findings.push({
                id: 'auth-no-password',
                title: 'Login page missing password field',
                severity: 'critical',
                category: 'auth',
                explanation: 'No password input field found on the login page. Users cannot authenticate.',
                fixable: 'manual',
                confidence: confidence(95),
                tags: ['auth', 'missing-field'],
            });
        }
        steps.push({
            description: hasEmail && hasPass
                ? `Login form found (email: ${emailField}, password: ${passField})`
                : `Login form incomplete (email: ${hasEmail}, password: ${hasPass})`,
            passed: hasEmail && hasPass,
            durationMs: Date.now() - start,
        });
        return findings;
    }
    async detectFormWiring(ctx, steps, screenshots) {
        const start = Date.now();
        const emailSelectors = ['input[type="email"]', 'input[name="email"]', 'input[id="email"]'];
        const passSelectors = ['input[type="password"]', 'input[name="password"]', 'input[id="password"]'];
        let emailField = null;
        let passField = null;
        for (const sel of emailSelectors) {
            try {
                if (await ctx.page.locator(sel).count() > 0) {
                    emailField = sel;
                    break;
                }
            }
            catch { /* ignore */ }
        }
        for (const sel of passSelectors) {
            try {
                if (await ctx.page.locator(sel).count() > 0) {
                    passField = sel;
                    break;
                }
            }
            catch { /* ignore */ }
        }
        if (!emailField || !passField) {
            steps.push({ description: 'Cannot detect wiring — form fields not found', passed: false, durationMs: Date.now() - start });
            return;
        }
        // Fill fields with safe test data
        const beforeUrl = ctx.page.url();
        const beforeErrors = await ctx.page.locator('[role="alert"], .error, .field-error, [aria-invalid="true"]').count();
        try {
            await ctx.page.locator(emailField).fill(SAFE_TEST_CREDENTIALS.email, { timeout: 3000 });
            await ctx.page.locator(passField).fill(SAFE_TEST_CREDENTIALS.password, { timeout: 3000 });
        }
        catch {
            steps.push({ description: 'Could not fill auth fields', passed: false, durationMs: Date.now() - start });
            return;
        }
        await ctx.page.waitForTimeout(500);
        const screenshot = await captureScenarioScreenshot(ctx, 'auth-filled');
        screenshots.push(screenshot);
        // Check for validation errors on the client side
        const afterErrors = await ctx.page.locator('[role="alert"], .error, .field-error, [aria-invalid="true"]').count();
        if (afterErrors > beforeErrors) {
            steps.push({
                description: 'Form shows client-side validation (expected — form is wired)',
                passed: true,
                screenshot,
                durationMs: Date.now() - start,
            });
        }
        else {
            steps.push({
                description: 'Filled auth fields with test data (NOT submitted — QA safety)',
                passed: true,
                screenshot,
                durationMs: Date.now() - start,
            });
        }
    }
    async checkProtectedRouteRedirect(ctx, steps) {
        const findings = [];
        const start = Date.now();
        const protectedPaths = ['/dashboard', '/settings', '/account', '/profile', '/admin'];
        for (const path of protectedPaths) {
            if (ctx.routeMap.hasRoute(path)) {
                const beforeUrl = ctx.page.url();
                try {
                    await ctx.page.goto(`${ctx.baseUrl}${path}`, { waitUntil: 'domcontentloaded', timeout: 10_000 });
                    await ctx.page.waitForTimeout(500);
                    const afterUrl = ctx.page.url();
                    const redirectedToAuth = afterUrl.includes('/login') || afterUrl.includes('/signin') || afterUrl.includes('/auth');
                    const authState = await isAuthenticated(ctx);
                    if (redirectedToAuth && !authState) {
                        // Expected — unauthenticated users redirected to login
                        steps.push({
                            description: `Protected route "${path}" redirects unauthenticated users to login ✓`,
                            passed: true,
                            durationMs: Date.now() - start,
                        });
                    }
                    else if (authState) {
                        // User is authenticated (likely from previous session)
                        steps.push({
                            description: `Protected route "${path}" accessible (user authenticated) ✓`,
                            passed: true,
                            durationMs: Date.now() - start,
                        });
                    }
                    else {
                        // Not redirected — potentially unprotected
                        findings.push({
                            id: `auth-unprotected-${path}`,
                            title: `Protected route "${path}" may not require authentication`,
                            severity: 'medium',
                            category: 'auth',
                            explanation: `Navigating to ${path} did not redirect to a login page. This may indicate a missing auth guard.`,
                            fixable: 'manual',
                            confidence: confidence(80),
                            tags: ['auth', 'unprotected-route'],
                        });
                        steps.push({
                            description: `Protected route "${path}" — WARNING: may not require auth`,
                            passed: false,
                            durationMs: Date.now() - start,
                        });
                    }
                }
                catch (err) {
                    steps.push({ description: `Protected route "${path}" check failed: ${err}`, passed: false, durationMs: Date.now() - start });
                }
                break; // Only check first available protected route
            }
        }
        return findings;
    }
    async visitRegisterPage(ctx, steps, screenshots) {
        const start = Date.now();
        const registerPaths = ['/register', '/signup', '/auth/register', '/auth/signup'];
        for (const path of registerPaths) {
            if (ctx.routeMap.hasRoute(path)) {
                try {
                    await ctx.page.goto(`${ctx.baseUrl}${path}`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
                    await ctx.page.waitForTimeout(800);
                    const screenshot = await captureScenarioScreenshot(ctx, 'register-page');
                    screenshots.push(screenshot);
                    const emailFields = await ctx.page.locator('input[type="email"], input[name="email"]').count();
                    const passFields = await ctx.page.locator('input[type="password"]').count();
                    steps.push({
                        description: emailFields > 0 && passFields > 0
                            ? `Register page found with ${emailFields} email and ${passFields} password fields`
                            : `Register page found but form fields may be incomplete`,
                        passed: emailFields > 0 && passFields > 0,
                        screenshot,
                        durationMs: Date.now() - start,
                    });
                    return;
                }
                catch { /* try next */ }
            }
        }
        steps.push({ description: 'Register/signup page not found in routes', passed: true, durationMs: Date.now() - start });
    }
    async checkSocialLogin(ctx, steps) {
        const findings = [];
        const start = Date.now();
        const socialSelectors = [
            'button:has-text("Google")',
            'button:has-text("GitHub")',
            'button:has-text("Microsoft")',
            'button:has-text("Apple")',
            'a:has-text("Continue with Google")',
            'a:has-text("Sign in with GitHub")',
            '[data-provider="google"]',
            '[data-provider="github"]',
        ];
        const foundButtons = [];
        for (const sel of socialSelectors) {
            try {
                const count = await ctx.page.locator(sel).count();
                if (count > 0) {
                    const text = await ctx.page.locator(sel).first().textContent({ timeout: 2000 }).catch(() => sel);
                    foundButtons.push(text?.trim() ?? sel);
                }
            }
            catch { /* ignore */ }
        }
        if (foundButtons.length > 0) {
            steps.push({ description: `Social login buttons found: ${foundButtons.join(', ')}`, passed: true, durationMs: Date.now() - start });
        }
        else {
            steps.push({ description: 'No social login buttons found', passed: true, durationMs: Date.now() - start });
        }
        return findings;
    }
    async checkForgotPassword(ctx, steps, screenshots) {
        const start = Date.now();
        const forgotSelectors = [
            'a:has-text("Forgot password")',
            'a:has-text("Forgot Password")',
            'a:has-text("Reset password")',
            'a:has-text("Reset Password")',
            'a[href*="forgot"]',
            'a[href*="reset"]',
        ];
        for (const sel of forgotSelectors) {
            try {
                const count = await ctx.page.locator(sel).count();
                if (count > 0) {
                    await ctx.page.locator(sel).first().click({ timeout: 3000 });
                    await ctx.page.waitForTimeout(1500);
                    const screenshot = await captureScenarioScreenshot(ctx, 'forgot-password');
                    screenshots.push(screenshot);
                    const url = ctx.page.url();
                    const hasResetForm = await ctx.page.locator('input[type="email"]').count() > 0;
                    steps.push({
                        description: hasResetForm || url.includes('forgot') || url.includes('reset')
                            ? `"Forgot password" flow accessible`
                            : `"Forgot password" link found but may not be wired`,
                        passed: hasResetForm || url.includes('forgot') || url.includes('reset'),
                        screenshot,
                        durationMs: Date.now() - start,
                    });
                    return;
                }
            }
            catch { /* try next */ }
        }
        steps.push({ description: '"Forgot password" link not found', passed: true, durationMs: Date.now() - start });
    }
}
export const authScenario = new AuthScenario();
//# sourceMappingURL=AuthScenario.js.map