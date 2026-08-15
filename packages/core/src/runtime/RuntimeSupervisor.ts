import type { RuntimeEvent, RuntimeResource, RuntimeResourceKind } from './types.js';

export class RuntimeSupervisor {
  private resources = new Map<string, RuntimeResource>();
  private events: RuntimeEvent[] = [];

  constructor(readonly runId: string, private readonly signal?: AbortSignal) {
    this.signal?.addEventListener('abort', () => {
      void this.cleanup();
    });
  }

  register(input: {
    id: string;
    kind: RuntimeResourceKind;
    label: string;
    metadata?: RuntimeResource['metadata'];
    cleanup: RuntimeResource['cleanup'];
  }): RuntimeResource {
    if (this.resources.has(input.id)) {
      throw new Error(`Resource already registered: ${input.id}`);
    }
    const resource: RuntimeResource = {
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

  list(): RuntimeResource[] {
    return [...this.resources.values()];
  }

  eventLog(): RuntimeEvent[] {
    return [...this.events];
  }

  async cleanup(): Promise<void> {
    const resources = [...this.resources.values()].reverse();
    for (const resource of resources) {
      if (resource.cleanedAt) continue;
      try {
        await resource.cleanup();
        resource.cleanedAt = new Date().toISOString();
        this.record('info', `cleaned ${resource.kind}: ${resource.label}`, resource.id);
      } catch (error) {
        this.record('error', `cleanup failed for ${resource.label}: ${error instanceof Error ? error.message : String(error)}`, resource.id);
      } finally {
        this.resources.delete(resource.id);
      }
    }
  }

  private record(level: RuntimeEvent['level'], message: string, resourceId?: string): void {
    this.events.push({
      runId: this.runId,
      resourceId,
      level,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
