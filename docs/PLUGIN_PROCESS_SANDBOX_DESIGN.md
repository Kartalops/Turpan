# Plugin Process Sandbox Design

> **Status**: Implemented in Phase 29

## Context

Phase 22 implemented worker-thread sandboxing for external plugins. Worker threads
share the Node.js event loop and V8 heap with the parent process — they are
isolated from each other but not from the parent process's full privilege level.
A compromised or buggy worker thread can:

- Exhaust the parent's event loop (unbounded CPU)
- Allocate memory beyond the soft cap (V8's `--max-old-space-size` applies to the whole process)
- Inherit handle/connection state from the parent
- Be killed only at the granularity of the entire worker, not per-operation

Phase 29 adds an **optional** stronger sandbox mode using `child_process` with IPC
for users who want OS-level process boundaries at the cost of ergonomics.

## Design Goals

1. **OS-level isolation**: Plugin runs in a separate Node.js process; a crash cannot
   corrupt the parent's memory or event loop.
2. **Minimal environment**: No inherited handles, no secrets in env, no parent cwd.
3. **Same permission model**: The 8 permissions work identically in both modes.
4. **Opt-in**: Worker thread mode remains the default. Process mode is explicitly
   enabled in config.
5. **Compatible**: Built-in plugins remain in-process. External plugins default to
   worker mode. Process mode is activated only via `sandboxMode: process`.

## Compared Approaches

### 1. Worker Thread Sandbox (Phase 22, current default)

```
Pros:
  + Zero serialization overhead — direct memory access in worker
  + Fast spawn — ~10ms vs ~100ms for a child process
  + Same-event-loop integration — async/await works naturally
  + Simple debugging — same Chrome DevTools protocol

Cons:
  - Same V8 heap — memory limits are soft (per-worker limits not natively enforced)
  - Same event loop — a runaway worker can starve the parent
  - Shared handles — inherited server sockets, file descriptors
  - Same OS user — no uid/gid separation
```

### 2. child_process Fork Sandbox (Phase 29, opt-in)

```
Pros:
  + Separate V8 heap — hard memory limit via --max-old-space-size on child
  + Separate event loop — runaway child cannot starve parent
  + Separate process — OS-level crash isolation (segfault ≠ parent death)
  + Minimal env — no inherited handles, no secrets
  + IPC is JSON over stdio — trivially auditable, no shared memory attacks
  + Hard timeout kill — SIGKILL terminates the process, not just a callback
  + Can run as different user (via execArgv: ['--user', uid]) on Linux

Cons:
  - ~100ms spawn overhead per plugin invocation
  - Serialization overhead for IPC messages (must be JSON)
  - More complex crash handling (exit code != JS error)
  - Debugging requires attaching to child process
  - stdout/stderr must be captured or discarded
```

### 3. Container Sandbox (Docker / gVisor)

```
Pros:
  + Strongest isolation — separate kernel namespace
  + Network namespace — plugin cannot make outbound connections unless whitelisted
  + Filesystem namespace — overlayfs, seccomp, AppArmor/SELinux

Cons:
  - Requires Docker daemon — not available in all environments (CI, Codespaces)
  - ~500ms+ cold start for a container
  - Requires privileged daemon or rootless configuration
  - Heavy weight — impractical for per-plugin spawning
  - Docker socket access required — a compromise of the Docker daemon itself
```

### 4. Node.js Permission Model (`--experimental-require-module`)

```
Pros:
  + Fine-grained — read this file, not that directory
  + Native — no subprocess overhead

Cons:
  - Experimental — flag may change or be removed
  - Not yet production-ready (Node.js 22.x still behind flag)
  - Requires Node.js built-in permission runner (not yet implemented)
  - No memory cap enforcement
```

### 5. OS-level seccomp / chroot

```
Pros:
  + Kernel-level syscall filtering
  + Minimal overhead

Cons:
  - Complex to configure correctly per-platform (Linux vs macOS vs BSD)
  - chroot alone is insufficient (overcomeable via fd leakage)
  - Requires root or CAP_SYS_CHROOT
  - Not portable
```

## Chosen Architecture: child_process + IPC

### Why not containers?
Containers require Docker, which is not universally available and adds
~500ms cold-start per plugin. For a developer tool called multiple times per
review session, this is prohibitively slow.

### Why not the Node.js permission model?
It is experimental and changes between Node.js versions. Relying on it for
security-critical sandboxing is premature.

### Why child_process + IPC?
The child_process approach gives us:
- Hard process isolation at ~100ms spawn cost
- A simple, auditable JSON-over-stdio protocol
- Compatibility with all Node.js 20+ environments
- A foundation that could later be swapped for a lightweight container runner

## IPC Protocol

### Messages (parent → child)

```typescript
interface ParentMessage {
  type: 'init';
  pluginPath: string;
  pluginId: string;
  projectRoot: string;
  fingerprint: unknown;
  grantedPermissions: string[];
  manifest: unknown;
  allowedPaths: string[];
  timeoutMs: number;
  startTime: number;
}

interface ParentMessage {
  type: 'run-analysis';
  callId: string;
  context: Record<string, unknown>;
}

interface ParentMessage {
  type: 'abort';
}
```

### Messages (child → parent)

```typescript
interface ChildMessage {
  type: 'ready';
}

interface ChildMessage {
  type: 'result';
  callId: string;
  success: boolean;
  findings?: unknown[];
  error?: string;
}

interface ChildMessage {
  type: 'log';
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
}

interface ChildMessage {
  type: 'crash';
  error: string;
}
```

### Protocol Rules
1. **JSON only** — parent rejects any non-JSON stdout output
2. **No eval/Function** — child must not use `eval()` or `new Function()`
3. **No require of untrusted modules** — only modules inside the plugin's package
4. **No stdin interaction** — child reads init message, then runs analysis
5. **No graceful degradation** — if any message is malformed, parent kills child

## Environment Variables in Child Process

The child is spawned with ONLY these env vars (everything else stripped):

```
NODE_ENV=production
NO_COLOR=1
TURPAN_PLUGIN_MODE=process
```

No `HOME`, no `USER`, no `PATH`, no API keys, no tokens, no secrets.

## Memory Limit

The child process is spawned with:
```
node --max-old-space-size=256 --experimental-require-module=false
```
This gives the child a hard 256MB heap limit enforced by V8.

## Timeout Kill

A `setTimeout` in the parent tracks the deadline. When exceeded:
1. Parent sends `type: 'abort'` message to child (best-effort)
2. Parent calls `child.kill('SIGKILL')` immediately after
3. Parent resolves with `timedOut: true`

This ensures the child cannot survive a timeout.

## Output Size Cap

Child stdout is captured and:
1. Parsed as JSON line-by-line
2. Truncated at 1MB total accumulated output
3. Excess lines discarded with a final `{ type: 'truncated' }` marker

## Crash Isolation

If the child exits with a non-zero code without having sent a `ready` message:
- Parent treats this as a load failure with `crashed: true`
- No partial state is propagated
- A crash report is logged but does not crash the parent

## Security Properties Summary

| Property | Worker Thread | Process (Phase 29) |
|---|---|---|
| V8 heap isolation | ❌ Same heap | ✅ Separate heap |
| Hard memory limit | ❌ Soft only | ✅ `--max-old-space-size` |
| Event loop isolation | ❌ Shared | ✅ Separate |
| OS process boundary | ❌ Same process | ✅ Separate |
| Env vars stripped | ⚠️ Minimal | ✅ Explicit allowlist |
| Timeout kill | ⚠️ terminate() callback | ✅ SIGKILL |
| Crash isolation | ❌ Parent can be corrupted | ✅ OS-level |
| Spawn overhead | ~10ms | ~100ms |

## When to Use Each Mode

| Scenario | Recommended Mode |
|---|---|
| Default development use | Worker (`sandboxMode: worker`) |
| Running untrusted 3rd-party plugins | Process (`sandboxMode: process`) |
| High-frequency plugin calls in CI | Worker |
| Plugin may be malicious | Process |
| Debugging a plugin | Worker |
| Memory-constrained environment | Process (with lower `memoryLimitMb`) |
| Plugin stability issues (crashes) | Process (crash ≠ parent crash) |

## File Structure

```
packages/core/src/plugins/sandbox/
├── PluginSandbox.ts          # Phase 22: worker thread runner
├── sandboxWorker.ts          # Phase 22: worker entry
├── sandboxRunner.ts         # Phase 22: sandboxed context + command safety
├── permissions.ts            # Phase 22: permission registry
├── types.ts                 # Phase 22: shared types
├── manifestValidator.ts     # Phase 22: manifest validation
├── trustDb.ts               # Phase 22: persistent trust DB
├── defaults.ts              # Phase 22: built-in plugin trust entries
├── index.ts                 # Phase 22: public exports
├── sandbox.test.ts          # Phase 22: tests
├── PluginProcessSandbox.ts  # Phase 29: NEW — child process runner
├── processWorker.ts         # Phase 29: NEW — child process entry (spawned)
└── processSandbox.test.ts   # Phase 29: NEW — process mode tests
```

## Compatibility

- **Built-in plugins**: Always in-process, unchanged
- **External plugins + `sandboxMode: worker`** (default): Worker thread, unchanged
- **External plugins + `sandboxMode: process`** (opt-in): Child process with IPC
- **All existing plugin tests**: Pass unchanged (worker mode remains default)
- **Config**: New fields are backward-compatible; omitted fields use defaults
