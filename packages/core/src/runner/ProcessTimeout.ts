/**
 * ProcessTimeout — timeout wrapper for child processes.
 */

import { spawn, type ChildProcess } from 'child_process';
import { promisify } from 'util';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface TimeoutOptions {
  /** Timeout in milliseconds */
  timeoutMs: number;
  /** Called when timeout is approaching (optional graceful period) */
  onApproaching?: (remainingMs: number) => void;
  /** Grace period before hard kill (default 5000ms) */
  gracePeriodMs?: number;
}

/**
 * Wait for a process to exit, with optional timeout.
 * Resolves with the exit code when the process exits.
 * Rejects if timeout is exceeded.
 */
export async function waitForExit(
  proc: ChildProcess,
  options: TimeoutOptions
): Promise<{ code: number | null; signal: string | null }> {
  const { timeoutMs, onApproaching, gracePeriodMs = 5000 } = options;

  if (!proc.pid) return { code: -1, signal: null };

  return new Promise((resolve, reject) => {
    let timedOut = false;

    // Set up timeout
    const timer = setTimeout(() => {
      timedOut = true;
      onApproaching?.(0);

      // Give a grace period before hard killing
      setTimeout(() => {
        if (proc.exitCode === null) {
          try {
            // On Unix, send SIGKILL; on Windows, terminate
            process.kill(proc.pid!, 'SIGKILL');
          } catch {
            // Process may have already exited
          }
        }
      }, gracePeriodMs);

      reject(new ProcessTimeoutError(`Process timed out after ${timeoutMs}ms`, timeoutMs));
    }, timeoutMs);

    proc.once('exit', (code, signal) => {
      if (!timedOut) {
        clearTimeout(timer);
        resolve({ code, signal });
      }
    });

    proc.once('error', err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export class ProcessTimeoutError extends Error {
  constructor(message: string, public readonly timeoutMs: number) {
    super(message);
    this.name = 'ProcessTimeoutError';
  }
}

/**
 * Run a command with a timeout. Wrapper around child_process.spawn.
 */
export async function runWithTimeout(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    signal?: AbortSignal;
  } & TimeoutOptions
): Promise<{ stdout: string; stderr: string; exitCode: number | null; signal: string | null }> {
  const { timeoutMs, cwd, env, signal, onApproaching, gracePeriodMs = 5000 } = options;

  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      shell: false, // Never shell out — security risk
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', data => { stdout += data.toString(); });
    proc.stderr?.on('data', data => { stderr += data.toString(); });

    // Wire up abort signal
    const onAbort = () => {
      try { process.kill(proc.pid!, 'SIGKILL'); } catch { /* ignore */ }
    };
    signal?.addEventListener('abort', onAbort);

    const timeoutTimer = setTimeout(() => {
      onApproaching?.(0);
      setTimeout(() => {
        if (proc.exitCode === null) {
          try { process.kill(proc.pid!, 'SIGKILL'); } catch { /* ignore */ }
        }
      }, gracePeriodMs);
      reject(new ProcessTimeoutError(`Command timed out after ${timeoutMs}ms: ${command}`, timeoutMs));
    }, timeoutMs);

    proc.once('exit', (code, sig) => {
      clearTimeout(timeoutTimer);
      signal?.removeEventListener('abort', onAbort);
      resolve({ stdout, stderr, exitCode: code, signal: sig });
    });

    proc.once('error', err => {
      clearTimeout(timeoutTimer);
      signal?.removeEventListener('abort', onAbort);
      reject(err);
    });
  });
}
