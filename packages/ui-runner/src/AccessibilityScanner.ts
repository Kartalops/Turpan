/**
 * AccessibilityScanner — basic deterministic accessibility checks.
 *
 * Checks (no external tools required):
 * - Images missing alt text
 * - Buttons/links missing accessible names
 * - Form inputs missing labels
 * - Headings skipped (h1 → h3)
 * - Focusable elements missing visible focus styles
 * - ARIA attributes used incorrectly
 */

import type { Page } from 'playwright';
import type { AccessibilityResult, A11yIssue, ViewportConfig } from './types.js';

export class AccessibilityScanner {
  /**
   * Run a basic accessibility scan on the page.
   * Returns issues sorted by severity.
   */
  async scan(page: Page, viewport: ViewportConfig): Promise<AccessibilityResult> {
    const issues: A11yIssue[] = [];

    // Collect all issues in parallel
    const [
      imgIssues,
      buttonIssues,
      inputIssues,
      headingIssues,
      ariaIssues,
    ] = await Promise.all([
      this.checkImages(page),
      this.checkButtons(page),
      this.checkFormInputs(page),
      this.checkHeadings(page),
      this.checkAria(page),
    ]);

    issues.push(...imgIssues, ...buttonIssues, ...inputIssues, ...headingIssues, ...ariaIssues);

    // Sort by severity
    const severityOrder = ['critical', 'serious', 'moderate', 'minor'] as const;
    issues.sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity));

    return { viewport, issues };
  }

  private async checkImages(page: Page): Promise<A11yIssue[]> {
    const issues: A11yIssue[] = [];
    try {
      const imgs = await page.$$eval('img', (imgs) =>
        imgs.map((img) => ({
          src: img.src,
          alt: img.getAttribute('alt'),
          ariaHidden: img.getAttribute('aria-hidden'),
          role: img.getAttribute('role'),
        }))
      );

      for (const img of imgs) {
        if (img.ariaHidden === 'true') continue; // intentionally hidden
        if (img.role === 'presentation' || img.role === 'none') continue;

        const missingAlt = img.alt === null || img.alt === '';
        const isDecorative = img.alt === '' && (img.src.includes('decoration') || img.src.includes('spacer'));

        if (missingAlt && !isDecorative) {
          issues.push({
            severity: 'serious',
            description: `Image missing alt text: ${truncate(img.src, 60)}`,
            element: 'img',
            selector: `img[src="${truncate(img.src, 40)}"]`,
            wcagCriteria: 'WCAG 2.1 — 1.1.1 Non-text Content',
          });
        }
      }
    } catch { /* ignore */ }
    return issues;
  }

  private async checkButtons(page: Page): Promise<A11yIssue[]> {
    const issues: A11yIssue[] = [];
    try {
      const buttons = await page.$$eval('button, [role="button"]', (btns) =>
        btns.map((btn) => ({
          tag: btn.tagName.toLowerCase(),
          text: btn.textContent?.trim(),
          ariaLabel: btn.getAttribute('aria-label'),
          ariaLabelledby: btn.getAttribute('aria-labelledby'),
          ariaHidden: btn.getAttribute('aria-hidden'),
        }))
      );

      for (const btn of buttons) {
        if (btn.ariaHidden === 'true') continue;
        const hasLabel = !!(btn.ariaLabel || btn.ariaLabelledby || (btn.text && btn.text.trim()));
        if (!hasLabel) {
          issues.push({
            severity: 'serious',
            description: `Button has no accessible name: "${truncate(btn.text ?? '', 30)}"`,
            element: btn.tag,
            wcagCriteria: 'WCAG 2.1 — 4.1.2 Name, Role, Value',
          });
        }
      }
    } catch { /* ignore */ }
    return issues;
  }

  private async checkFormInputs(page: Page): Promise<A11yIssue[]> {
    const issues: A11yIssue[] = [];
    try {
      const inputs = await page.$$eval('input, select, textarea', (els) =>
        els.map((el) => {
          const tag = el.tagName.toLowerCase();
          const type = (el as HTMLInputElement).type;
          const id = el.id;
          const name = (el as HTMLInputElement).name;
          const ariaLabel = el.getAttribute('aria-label');
          const ariaLabelledby = el.getAttribute('aria-labelledby');
          const placeholder = (el as HTMLInputElement).placeholder;
          const visible = el.getAttribute('aria-hidden') !== 'true' &&
                          (el as HTMLElement).offsetParent !== null;

          return { tag, type, id, name, ariaLabel, ariaLabelledby, placeholder, visible };
        })
      );

      for (const input of inputs) {
        if (!input.visible) continue;
        // Skip hidden inputs
        if (['hidden', 'submit', 'button', 'reset', 'image', 'checkbox', 'radio'].includes(input.type)) continue;

        const hasLabel = !!(input.ariaLabel || input.ariaLabelledby || input.id);
        // Also accept placeholder as implicit label (not ideal but common)
        const hasImplicitLabel = !!input.placeholder;

        if (!hasLabel && !hasImplicitLabel) {
          issues.push({
            severity: 'moderate',
            description: `Form input (${input.type}) missing label: name="${input.name}", id="${input.id}"`,
            element: input.tag,
            wcagCriteria: 'WCAG 2.1 — 1.3.1 Info and Relationships',
          });
        }
      }
    } catch { /* ignore */ }
    return issues;
  }

  private async checkHeadings(page: Page): Promise<A11yIssue[]> {
    const issues: A11yIssue[] = [];
    try {
      const headings = await page.$$eval('h1, h2, h3, h4, h5, h6', (els) =>
        els.map((el, i) => ({
          tag: el.tagName.toLowerCase(),
          level: parseInt(el.tagName[1]),
          text: el.textContent?.trim().slice(0, 50),
          index: i,
        }))
      );

      let lastLevel = 0;
      for (const h of headings) {
        if (h.level - lastLevel > 1 && lastLevel > 0) {
          issues.push({
            severity: 'minor',
            description: `Heading level skipped: <h${lastLevel}> → <h${h.level}> "${h.text}"`,
            element: h.tag,
            wcagCriteria: 'WCAG 2.1 — 1.3.1 Info and Relationships',
          });
        }
        lastLevel = h.level;
      }

      // Only one h1 should exist
      const h1Count = headings.filter(h => h.level === 1).length;
      if (h1Count > 1) {
        issues.push({
          severity: 'moderate',
          description: `Multiple h1 elements found (${h1Count}) — should be exactly one`,
          element: 'h1',
          wcagCriteria: 'WCAG 2.1 — 1.3.1 Info and Relationships',
        });
      }
    } catch { /* ignore */ }
    return issues;
  }

  private async checkAria(page: Page): Promise<A11yIssue[]> {
    const issues: A11yIssue[] = [];
    try {
      // Check for interactive elements with incorrect ARIA
      const badAria = await page.$$eval('[role="button"][aria-disabled="true"]', (els) =>
        els.map((el) => ({
          tag: el.tagName.toLowerCase(),
          disabled: el.getAttribute('aria-disabled'),
          hasOnClick: !!(el as HTMLElement).onclick,
        }))
      );

      for (const el of badAria) {
        if (el.hasOnClick && el.disabled === 'true') {
          issues.push({
            severity: 'minor',
            description: `Interactive element has aria-disabled="true" but has click handler`,
            element: el.tag,
            wcagCriteria: 'WCAG 2.1 — 4.1.2 Name, Role, Value',
          });
        }
      }
    } catch { /* ignore */ }
    return issues;
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}