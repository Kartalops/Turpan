/**
 * PluginContext — context passed to plugins during registration and execution.
 * Provides access to project metadata, configuration, and cancellation.
 */
/**
 * Build a standard PluginContext from project root and config.
 */
export function buildPluginContext(projectRoot, fingerprint, config, signal) {
    return {
        projectRoot,
        fingerprint,
        turpanDir: `${projectRoot}/.turpan`,
        config,
        signal,
    };
}
//# sourceMappingURL=PluginContext.js.map