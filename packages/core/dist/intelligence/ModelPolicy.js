const PROFILE_DEFAULTS = {
    fast: {
        mode: 'fast',
        maxModelCalls: 3,
        maxEstimatedCostUsd: 0.05,
        allowRemoteProviders: false,
        requireDisclosure: true,
    },
    balanced: {
        mode: 'balanced',
        maxModelCalls: 12,
        maxEstimatedCostUsd: 0.5,
        allowRemoteProviders: true,
        requireDisclosure: true,
    },
    deep: {
        mode: 'deep',
        maxModelCalls: 32,
        maxEstimatedCostUsd: 2,
        allowRemoteProviders: true,
        requireDisclosure: true,
    },
    paranoid: {
        mode: 'paranoid',
        maxModelCalls: 64,
        maxEstimatedCostUsd: 5,
        allowRemoteProviders: true,
        requireDisclosure: true,
    },
};
export function createModelPolicy(mode, overrides = {}) {
    return { ...PROFILE_DEFAULTS[mode], ...overrides, mode };
}
//# sourceMappingURL=ModelPolicy.js.map