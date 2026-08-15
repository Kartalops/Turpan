import type { BrowserObservation, UiAction, UiStateGraph } from './types.js';
import { SafeExplorationPolicy } from './SafeExplorationPolicy.js';

export interface SemanticBrowser {
  openPage(url: string): Promise<BrowserObservation>;
  inspectPage(): Promise<BrowserObservation>;
  click(action: UiAction): Promise<BrowserObservation>;
  type(action: UiAction): Promise<BrowserObservation>;
  select(action: UiAction): Promise<BrowserObservation>;
  submit(action: UiAction): Promise<BrowserObservation>;
  back(): Promise<BrowserObservation>;
  reload(): Promise<BrowserObservation>;
  waitFor(label: string, timeoutMs: number): Promise<BrowserObservation>;
  readConsole(): Promise<string[]>;
  readNetwork(): Promise<BrowserObservation['networkErrors']>;
  takeScreenshot(label: string): Promise<string>;
  getAccessibilityTree(): Promise<unknown>;
}

export class BrowserAgent {
  constructor(
    private readonly browser: SemanticBrowser,
    private readonly policy = new SafeExplorationPolicy(),
  ) {}

  async explore(startUrl: string, options: { maxStates: number }): Promise<UiStateGraph> {
    const graph: UiStateGraph = { states: [], transitions: [], visitedRoutes: [] };
    const queue: BrowserObservation[] = [await this.browser.openPage(startUrl)];
    const visited = new Set<string>();

    while (queue.length > 0 && graph.states.length < options.maxStates) {
      const observation = queue.shift()!;
      if (visited.has(observation.route)) continue;
      visited.add(observation.route);
      graph.visitedRoutes.push(observation.route);
      graph.states.push({
        id: observation.route,
        route: observation.route,
        screenshotPath: observation.screenshotPath,
        consoleErrors: observation.consoleErrors,
        networkErrors: observation.networkErrors,
      });

      for (const action of observation.actions) {
        if (graph.states.length + queue.length >= options.maxStates) break;
        const decision = this.policy.classify(action);
        if (decision.risk !== 'SAFE') continue;
        const next = await this.perform(action);
        graph.transitions.push({ from: observation.route, to: next.route, actionId: action.id, risk: decision.risk });
        if (!visited.has(next.route)) queue.push(next);
      }
    }

    return graph;
  }

  private perform(action: UiAction): Promise<BrowserObservation> {
    switch (action.kind) {
      case 'click': return this.browser.click(action);
      case 'type': return this.browser.type(action);
      case 'select': return this.browser.select(action);
      case 'submit': return this.browser.submit(action);
      case 'back': return this.browser.back();
      case 'reload': return this.browser.reload();
      case 'waitFor': return this.browser.waitFor(action.id, 5_000);
      case 'openPage': return this.browser.inspectPage();
    }
  }
}
