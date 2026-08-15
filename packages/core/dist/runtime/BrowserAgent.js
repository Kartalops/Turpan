import { SafeExplorationPolicy } from './SafeExplorationPolicy.js';
export class BrowserAgent {
    browser;
    policy;
    constructor(browser, policy = new SafeExplorationPolicy()) {
        this.browser = browser;
        this.policy = policy;
    }
    async explore(startUrl, options) {
        const graph = { states: [], transitions: [], visitedRoutes: [] };
        const queue = [await this.browser.openPage(startUrl)];
        const visited = new Set();
        while (queue.length > 0 && graph.states.length < options.maxStates) {
            const observation = queue.shift();
            if (visited.has(observation.route))
                continue;
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
                if (graph.states.length + queue.length >= options.maxStates)
                    break;
                const decision = this.policy.classify(action);
                if (decision.risk !== 'SAFE')
                    continue;
                const next = await this.perform(action);
                graph.transitions.push({ from: observation.route, to: next.route, actionId: action.id, risk: decision.risk });
                if (!visited.has(next.route))
                    queue.push(next);
            }
        }
        return graph;
    }
    perform(action) {
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
//# sourceMappingURL=BrowserAgent.js.map