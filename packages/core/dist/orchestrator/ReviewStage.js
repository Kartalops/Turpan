/**
 * ReviewStage — a single unit of review work
 */
/** Placeholder stage — returns empty result. Real stages implemented in next phase. */
export async function placeholderStage(ctx, id, label) {
    const start = Date.now();
    await new Promise(r => setTimeout(r, 10)); // tick
    return {
        stageId: id,
        status: 'completed',
        findings: [],
        durationMs: Date.now() - start,
    };
}
//# sourceMappingURL=ReviewStage.js.map