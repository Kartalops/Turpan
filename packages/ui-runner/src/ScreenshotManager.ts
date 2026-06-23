/**
 * ScreenshotManager — capture and organize UI screenshots.
 *
 * Artifacts written to:
 *   .turpan/runs/<runId>/screenshots/<viewport>/<route-slug>.png
 */

import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { Page } from 'playwright';
import type { ScreenshotArtifact, ViewportConfig } from './types.js';

export class ScreenshotManager {
  private baseDir: string;
  private artifacts: ScreenshotArtifact[] = [];

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    mkdirSync(this.baseDir, { recursive: true });
  }

  /**
   * Capture a screenshot of the current page state.
   */
  async capture(
    page: Page,
    routePath: string,
    viewport: ViewportConfig,
    label?: string
  ): Promise<ScreenshotArtifact> {
    const slug = this.slugifyRoute(routePath);
    const viewportDir = join(this.baseDir, viewport.name);
    mkdirSync(viewportDir, { recursive: true });

    const filename = label ? `${slug}--${label}.png` : `${slug}.png`;
    const filePath = join(viewportDir, filename);

    await page.screenshot({
      path: filePath,
      fullPage: true,
      timeout: 10_000,
    });

    const artifact: ScreenshotArtifact = {
      route: routePath,
      viewport: viewport.name,
      path: filePath,
      url: page.url(),
    };

    this.artifacts.push(artifact);
    return artifact;
  }

  /**
   * Capture a screenshot of just the visible viewport (not full page).
   */
  async captureViewport(
    page: Page,
    routePath: string,
    viewport: ViewportConfig,
    label?: string
  ): Promise<ScreenshotArtifact> {
    const slug = this.slugifyRoute(routePath);
    const viewportDir = join(this.baseDir, viewport.name);
    mkdirSync(viewportDir, { recursive: true });

    const filename = label ? `${slug}--${viewport.name}--${label}.png` : `${slug}--${viewport.name}.png`;
    const filePath = join(viewportDir, filename);

    await page.screenshot({
      path: filePath,
      timeout: 10_000,
    });

    const artifact: ScreenshotArtifact = {
      route: routePath,
      viewport: viewport.name,
      path: filePath,
      url: page.url(),
    };

    this.artifacts.push(artifact);
    return artifact;
  }

  getArtifacts(): ScreenshotArtifact[] { return this.artifacts; }

  private slugifyRoute(route: string): string {
    return route
      .replace(/^\//, '')
      .replace(/\//g, '__')
      .replace(/[^\w\-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || 'home';
  }
}