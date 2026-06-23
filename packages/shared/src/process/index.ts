import { execSync, spawn, type SpawnOptions } from 'child_process';
import { platform } from 'os';

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function runCommand(
  command: string,
  cwd?: string,
  timeout = 30000
): ProcessResult {
  try {
    const stdout = execSync(command, {
      cwd,
      encoding: 'utf-8',
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (error) {
    const err = error as { stdout?: Buffer; stderr?: Buffer; status?: number };
    return {
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? '',
      exitCode: err.status ?? 1,
    };
  }
}

export function spawnCommand(
  command: string,
  args: string[],
  cwd?: string,
  onData?: (data: string) => void,
  onError?: (data: string) => void
): Promise<number> {
  return new Promise((resolve, reject) => {
    const isWindows = platform() === 'win32';
    const shell = isWindows ? 'cmd.exe' : '/bin/sh';
    const shellArgs = isWindows ? ['/c', `${command} ${args.join(' ')}`] : ['-c', `${command} ${args.join(' ')}`];

    const child = spawn(shell, shellArgs, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (data) => {
      const str = data.toString();
      onData?.(str);
    });

    child.stderr?.on('data', (data) => {
      const str = data.toString();
      onError?.(str);
    });

    child.on('close', (code) => {
      resolve(code ?? 1);
    });

    child.on('error', reject);
  });
}

export function getNodeVersion(): string {
  return process.version;
}

export function getPlatform(): string {
  return platform();
}

export function getMemoryUsage(): { rss: number; heapUsed: number; heapTotal: number } {
  const mem = process.memoryUsage();
  return {
    rss: mem.rss,
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
  };
}