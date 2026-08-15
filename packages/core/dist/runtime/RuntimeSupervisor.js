export class RuntimeSupervisor {
    runId;
    signal;
    resources = new Map();
    events = [];
    constructor(runId, signal) {
        this.runId = runId;
        this.signal = signal;
        this.signal?.addEventListener('abort', () => {
            void this.cleanup();
        });
    }
    register(input) {
        if (this.resources.has(input.id)) {
            throw new Error(`Resource already registered: ${input.id}`);
        }
        const resource = {
            id: input.id,
            runId: this.runId,
            kind: input.kind,
            label: input.label,
            metadata: input.metadata ?? {},
            cleanup: input.cleanup,
            createdAt: new Date().toISOString(),
        };
        this.resources.set(resource.id, resource);
        this.record('info', `registered ${resource.kind}: ${resource.label}`, resource.id);
        return resource;
    }
    list() {
        return [...this.resources.values()];
    }
    eventLog() {
        return [...this.events];
    }
    async cleanup() {
        const resources = [...this.resources.values()].reverse();
        for (const resource of resources) {
            if (resource.cleanedAt)
                continue;
            try {
                await resource.cleanup();
                resource.cleanedAt = new Date().toISOString();
                this.record('info', `cleaned ${resource.kind}: ${resource.label}`, resource.id);
            }
            catch (error) {
                this.record('error', `cleanup failed for ${resource.label}: ${error instanceof Error ? error.message : String(error)}`, resource.id);
            }
            finally {
                this.resources.delete(resource.id);
            }
        }
    }
    record(level, message, resourceId) {
        this.events.push({
            runId: this.runId,
            resourceId,
            level,
            message,
            timestamp: new Date().toISOString(),
        });
    }
}
//# sourceMappingURL=RuntimeSupervisor.js.map