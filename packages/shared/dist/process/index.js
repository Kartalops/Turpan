import { execSync, spawn } from 'child_process';
import { platform } from 'os';
export function runCommand(command, cwd, timeout = 30000) {
    try {
        const stdout = execSync(command, {
            cwd,
            encoding: 'utf-8',
            timeout,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        return { stdout, stderr: '', exitCode: 0 };
    }
    catch (error) {
        const err = error;
        return {
            stdout: err.stdout?.toString() ?? '',
            stderr: err.stderr?.toString() ?? '',
            exitCode: err.status ?? 1,
        };
    }
}
export function spawnCommand(command, args, cwd, onData, onError) {
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
export function getNodeVersion() {
    return process.version;
}
export function getPlatform() {
    return platform();
}
export function getMemoryUsage() {
    const mem = process.memoryUsage();
    return {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
    };
}
//# sourceMappingURL=index.js.map