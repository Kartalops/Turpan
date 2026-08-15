import type { RuntimeEvent, RuntimeResource, RuntimeResourceKind } from './types.js';
export declare class RuntimeSupervisor {
    readonly runId: string;
    private readonly signal?;
    private resources;
    private events;
    constructor(runId: string, signal?: AbortSignal | undefined);
    register(input: {
        id: string;
        kind: RuntimeResourceKind;
        label: string;
        metadata?: RuntimeResource['metadata'];
        cleanup: RuntimeResource['cleanup'];
    }): RuntimeResource;
    list(): RuntimeResource[];
    eventLog(): RuntimeEvent[];
    cleanup(): Promise<void>;
    private record;
}
//# sourceMappingURL=RuntimeSupervisor.d.ts.map