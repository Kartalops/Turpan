/**
 * File walker with ignore support.
 * Skips node_modules, dist, build, .next, .turpan by default.
 * Supports custom globs from turpan.yml `ignore.paths` / `ignore.globs`.
 */
export declare const DEFAULT_IGNORED_DIRS: Set<string>;
export declare const DEFAULT_IGNORED_FILES: Set<string>;
export interface WalkOptions {
    cwd: string;
    /** File extensions to include (without leading dot) */
    extensions: string[];
    /** Directory names to skip (defaults to DEFAULT_IGNORED_DIRS) */
    ignoreDirs?: Set<string>;
    /** File basenames to skip */
    ignoreFiles?: Set<string>;
    /** Glob patterns to ignore (supports simple globs: *, **, ?) */
    ignoreGlobs?: string[];
    /** Explicit paths to ignore (relative to cwd) */
    ignorePaths?: string[];
    /** Maximum recursion depth (default: 20) */
    maxDepth?: number;
    /** Follow symlinks (default: false) */
    followSymlinks?: boolean;
}
/**
 * Recursively find all files with given extensions, skipping ignored paths.
 */
export declare function walkFiles(options: WalkOptions): string[];
/**
 * Compile a simple glob pattern into a predicate function.
 * Supported patterns:
 *   `*`         — match any chars except `/`
 *   `**`        — match any chars including `/`
 *   `?`         — match a single char
 *   literal     — exact match
 * Patterns are matched against the path relative to cwd, normalized to use `/`.
 */
export declare function compileGlob(pattern: string): (path: string) => boolean;
/**
 * Combine default ignore sets with config-supplied ignores.
 * Useful for the CLI entry point.
 */
export declare function buildIgnoreSet(config: {
    ignoreDirs?: string[];
    ignoreFiles?: string[];
}): {
    dirs: Set<string>;
    files: Set<string>;
};
//# sourceMappingURL=fileWalker.d.ts.map