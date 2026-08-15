import { request } from 'http';
import { connect } from 'net';
const READY_RE = /ready|compiled|listening|started|running|local:\s*http|server/i;
export class HealthDetector {
    async detect(input) {
        const signals = [];
        if (input.stdout !== undefined) {
            signals.push({ kind: 'stdout', ok: READY_RE.test(input.stdout), detail: input.stdout.slice(-500) });
        }
        if (input.processAlive !== undefined) {
            signals.push({ kind: 'process', ok: input.processAlive, detail: input.processAlive ? 'process alive' : 'process exited' });
        }
        if (input.port !== undefined) {
            signals.push({ kind: 'port', ok: await this.isPortOpen(input.port, input.timeoutMs ?? 500), detail: `localhost:${input.port}` });
        }
        if (input.url) {
            signals.push({ kind: 'http', ok: await this.isHttpReady(input.url, input.timeoutMs ?? 1000), detail: input.url });
        }
        return {
            ready: signals.some((signal) => signal.ok),
            signals,
        };
    }
    isPortOpen(port, timeoutMs) {
        return new Promise((resolve) => {
            const socket = connect({ port, host: '127.0.0.1' });
            const done = (value) => {
                socket.destroy();
                resolve(value);
            };
            socket.setTimeout(timeoutMs);
            socket.once('connect', () => done(true));
            socket.once('timeout', () => done(false));
            socket.once('error', () => done(false));
        });
    }
    isHttpReady(url, timeoutMs) {
        return new Promise((resolve) => {
            const req = request(url, { method: 'GET', timeout: timeoutMs }, (res) => {
                res.resume();
                resolve(Boolean(res.statusCode && res.statusCode < 500));
            });
            req.once('timeout', () => {
                req.destroy();
                resolve(false);
            });
            req.once('error', () => resolve(false));
            req.end();
        });
    }
}
//# sourceMappingURL=HealthDetector.js.map