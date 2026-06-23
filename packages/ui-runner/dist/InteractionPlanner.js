/**
 * InteractionPlanner — plans and executes realistic user interactions on a page.
 *
 * Philosophy: human-like QA — not a test runner.
 * - Scroll through the page to lazy-load content
 * - Click visible navigation links
 * - Open dropdowns and modals
 * - Fill forms with safe test data (no destructive submissions)
 * - Detect if buttons are wired or no-op
 *
 * Safety rules:
 * - No destructive actions (delete, payment submission)
 * - No real auth — only detect if login form exists and is wired
 * - No external payment flows
 */
const DESTRUCTIVE_PATTERNS = [
    /delete/i, /remove/i, /destroy/i, /drop/i, /truncate/i,
    /reset.*db/i, /clear.*data/i, /rm\s+-rf/i, /purge/i,
    /unsubscribe.*permanently/i,
];
const PAYMENT_PATTERNS = [
    /stripe/i, /paypal/i, /credit card/i, /subscribe.*now/i,
    /upgrade.*now/i, /buy.*now/i, /purchase/i,
];
const SAFE_TEST_DATA = {
    email: 'test@example.com',
    name: 'Test User',
    firstName: 'Test',
    lastName: 'User',
    phone: '555-000-0000',
    company: 'Test Company',
    message: 'This is a test message for UI testing purposes.',
    password: 'TestPassword123!',
    username: 'testuser',
};
export class InteractionPlanner {
    steps = [];
    results = [];
    page = null;
    viewport = null;
    /**
     * Plan interactions for a given page.
     * Analyzes the DOM to determine what interactions are possible.
     */
    async plan(page, viewport) {
        if (!page)
            return [];
        this.page = page;
        this.viewport = viewport;
        this.steps = [];
        // Scroll to trigger lazy loading
        this.steps.push({ type: 'scroll', description: 'Scroll to load lazy content' });
        // Find and click primary CTA buttons
        const ctas = await this.planCtaClicks(page);
        this.steps.push(...ctas);
        // Plan dropdown/menu opens
        const dropdowns = await this.planDropdownOpens(page);
        this.steps.push(...dropdowns);
        // Plan modal opens
        const modals = await this.planModalOpens(page);
        this.steps.push(...modals);
        // Plan form interactions (detect wiring, don't submit destructively)
        const formSteps = await this.planFormInteractions(page);
        this.steps.push(...formSteps);
        return [...this.steps];
    }
    /**
     * Execute a planned interaction and record the result.
     */
    async execute(step) {
        if (!this.page)
            return { step, success: false, error: 'No page set' };
        const result = { step, success: false };
        try {
            switch (step.type) {
                case 'scroll':
                    await this.executeScroll();
                    result.success = true;
                    break;
                case 'click':
                    if (step.selector) {
                        const clicked = await this.executeClick(step.selector, step.index);
                        result.success = clicked;
                        result.url = this.page.url();
                    }
                    break;
                case 'fill':
                    if (step.selector && step.value) {
                        await this.executeFill(step.selector, step.value);
                        result.success = true;
                    }
                    break;
                case 'hover':
                    if (step.selector) {
                        await this.executeHover(step.selector);
                        result.success = true;
                    }
                    break;
                case 'wait':
                    await this.page.waitForTimeout(1000);
                    result.success = true;
                    break;
                default:
                    result.success = false;
                    result.error = `Unknown interaction type: ${step.type}`;
            }
        }
        catch (err) {
            result.success = false;
            result.error = String(err);
        }
        this.results.push(result);
        return result;
    }
    async executeScroll() {
        if (!this.page)
            return;
        // Scroll in steps to trigger lazy loading
        for (let i = 0; i < 3; i++) {
            await this.page.evaluate(() => window.scrollBy(0, 400));
            await this.page.waitForTimeout(300);
        }
        // Scroll back to top
        await this.page.evaluate(() => window.scrollTo(0, 0));
    }
    async executeClick(selector, index) {
        if (!this.page)
            return false;
        // Check for destructive actions before clicking
        const isDestructive = await this.isSelectorDestructive(selector);
        if (isDestructive)
            return false;
        const elements = await this.page.locator(selector).all();
        if (elements.length === 0)
            return false;
        const el = index !== undefined ? elements[index] : elements[0];
        try {
            await el.scrollIntoViewIfNeeded();
            await el.click({ timeout: 5000 });
            return true;
        }
        catch {
            return false;
        }
    }
    async executeFill(selector, value) {
        if (!this.page)
            return;
        const el = this.page.locator(selector).first();
        await el.scrollIntoViewIfNeeded();
        await el.fill(value, { timeout: 5000 });
    }
    async executeHover(selector) {
        if (!this.page)
            return;
        const el = this.page.locator(selector).first();
        await el.scrollIntoViewIfNeeded();
        await el.hover({ timeout: 5000 });
    }
    async isSelectorDestructive(selector) {
        if (!this.page)
            return false;
        try {
            const text = await this.page.locator(selector).first().textContent({ timeout: 3000 });
            return DESTRUCTIVE_PATTERNS.some(p => p.test(text ?? ''));
        }
        catch {
            return false;
        }
    }
    async isPaymentButton(selector) {
        if (!this.page)
            return false;
        try {
            const text = await this.page.locator(selector).first().textContent({ timeout: 3000 });
            return PAYMENT_PATTERNS.some(p => p.test(text ?? ''));
        }
        catch {
            return false;
        }
    }
    async planCtaClicks(page) {
        const steps = [];
        // Find buttons with common CTA text
        const ctaSelectors = [
            'button:has-text("Get Started")',
            'button:has-text("Sign Up")',
            'button:has-text("Learn More")',
            'button:has-text("Try Free")',
            'button:has-text("Start")',
            'a:has-text("Get Started")',
            'a:has-text("Sign Up")',
            '[role="button"]:has-text("Start")',
        ];
        for (const sel of ctaSelectors) {
            const count = await page.locator(sel).count();
            if (count > 0) {
                const text = await page.locator(sel).first().textContent({ timeout: 3000 }).catch(() => 'button');
                if (!DESTRUCTIVE_PATTERNS.some(p => p.test(text ?? '')) &&
                    !PAYMENT_PATTERNS.some(p => p.test(text ?? ''))) {
                    steps.push({ type: 'click', selector: sel, description: `Click CTA: ${text?.trim()}` });
                    break; // Only click the first matching CTA
                }
            }
        }
        return steps;
    }
    async planDropdownOpens(page) {
        const steps = [];
        // Find dropdown toggles
        const dropdownSelectors = [
            '[role="combobox"]',
            'select',
            'button:has-text("▼")',
            'button:has-text("▾")',
            '.dropdown-toggle',
            '[data-dropdown-toggle]',
        ];
        for (const sel of dropdownSelectors) {
            const count = await page.locator(sel).count();
            if (count > 0) {
                steps.push({ type: 'click', selector: sel, description: `Open dropdown: ${sel}` });
                break;
            }
        }
        return steps;
    }
    async planModalOpens(page) {
        const steps = [];
        // Find modal/dialog openers
        const modalSelectors = [
            'button:has-text("Close")',
            '[data-modal-toggle]',
            '[data-modal-target]',
            '[aria-haspopup="dialog"]',
            'button:has-text("Demo")',
            'button:has-text("Watch")',
            'a:has-text("Learn More")',
        ];
        for (const sel of modalSelectors) {
            const count = await page.locator(sel).count();
            if (count > 0) {
                const text = await page.locator(sel).first().textContent({ timeout: 3000 }).catch(() => sel);
                steps.push({ type: 'click', selector: sel, description: `Open modal/overlay: ${text?.trim()}` });
                break;
            }
        }
        return steps;
    }
    async planFormInteractions(page) {
        const steps = [];
        // Detect login/signup forms
        const emailField = await page.locator('input[type="email"], input[name="email"], input[id="email"]').count();
        const passField = await page.locator('input[type="password"], input[name="password"], input[id="password"]').count();
        if (emailField > 0 && passField > 0) {
            // Fill but do NOT submit — just detect wiring
            steps.push({
                type: 'fill',
                selector: 'input[type="email"], input[name="email"], input[id="email"]',
                value: SAFE_TEST_DATA.email,
                description: 'Fill email field with test data',
            });
            steps.push({
                type: 'fill',
                selector: 'input[type="password"], input[name="password"], input[id="password"]',
                value: SAFE_TEST_DATA.password,
                description: 'Fill password field with test data',
            });
            // Check if submit button is wired (look for form submit, not just button click)
            const formEl = await page.locator('form').count();
            if (formEl > 0) {
                steps.push({ type: 'wait', description: 'Wait to see if form submission occurs' });
            }
        }
        // Detect search/input forms
        const searchSelectors = [
            'input[type="search"]',
            'input[placeholder*="Search" i]',
            'input[name="search"]',
            '[role="search"] input',
        ];
        for (const sel of searchSelectors) {
            const count = await page.locator(sel).count();
            if (count > 0) {
                steps.push({
                    type: 'fill',
                    selector: sel,
                    value: 'test query',
                    description: `Fill search field: ${sel}`,
                });
                break;
            }
        }
        return steps;
    }
    getResults() { return [...this.results]; }
    getFailures() {
        return this.results.filter(r => !r.success);
    }
    summary() {
        return {
            total: this.results.length,
            succeeded: this.results.filter(r => r.success).length,
            failed: this.getFailures().length,
        };
    }
}
//# sourceMappingURL=InteractionPlanner.js.map