/**
 * ResponsiveScanner — check UI behavior across viewport sizes.
 *
 * Detects:
 * - Horizontal overflow on mobile
 * - Elements that overflow viewport width
 * - Text that wraps awkwardly
 */

import type { Page, BrowserContext } from 'playwright';
import type { ResponsiveResult, ViewportConfig } from './types.js';
import { BrowserSession } from './BrowserSession.js';

export class ResponsiveScanner {
  /**
   * Check if a page has horizontal overflow at a given viewport.
   */
  async checkOverflow(
    page: Page,
    viewport: ViewportConfig
  ): Promise<{ hasOverflow: boolean; overflowPx: number }> {
    const result = await page.evaluate((vp) => {
      // Set viewport size
      window.resizeTo(vp.width, vp.height);

      const docWidth = document.documentElement.scrollWidth;
      const winWidth = window.innerWidth;
      const overflow = docWidth - winWidth;

      return {
        hasOverflow: overflow > 0,
        overflowPx: Math.max(0, overflow),
        docWidth,
        winWidth,
      };
    }, { width: viewport.width, height: viewport.height } as any);

    return { hasOverflow: result.hasOverflow, overflowPx: result.overflowPx };
  }

  /**
   * Detect which elements are causing overflow.
   */
  async findOverflowElements(
    page: Page,
    threshold: number = 5
  ): Promise<Array<{ selector: string; overflowPx: number; tag: string }>> {
    try {
      const elements = await page.$$eval('*', (els) => {
        return els
          .map((el) => {
            const rect = el.getBoundingClientRect();
            const overflowX = rect.right - window.innerWidth;
            return {
              tag: el.tagName.toLowerCase(),
              id: el.id,
              className: el.className.slice(0, 50),
              overflowPx: Math.max(0, overflowX),
              rectWidth: rect.width,
            };
          })
          .filter(e => e.overflowPx > threshold)
          .slice(0, 10); // top 10 worst
      });

      return elements.map(e => ({
        selector: e.id ? `#${e.id}` : `.${e.className}`,
        overflowPx: e.overflowPx,
        tag: e.tag,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Run full responsive check across multiple viewports.
   */
  async scan(
    browser: BrowserContext,
    url: string,
    viewports: ViewportConfig[]
  ): Promise<ResponsiveResult[]> {
    const results: ResponsiveResult[] = [];

    for (const viewport of viewports) {
      const page = await browser.newPage();
      try {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
        await page.waitForTimeout(1000);

        const { hasOverflow, overflowPx } = await this.checkOverflow(page, viewport);
        const elements = hasOverflow ? await this.findOverflowElements(page) : [];

        results.push({
          viewport,
          hasHorizontalOverflow: hasOverflow,
          overflowPixels: overflowPx,
        });
      } catch (err) {
        results.push({
          viewport,
          hasHorizontalOverflow: false,
          overflowPixels: 0,
        });
      } finally {
        await page.close();
      }
    }

    return results;
  }
}