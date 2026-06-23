import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
class TurpanLogger {
    logPath;
    level;
    minLevel;
    constructor(logPath, level = 'info') {
        this.logPath = logPath;
        this.level = level;
        this.minLevel = LOG_LEVELS[level];
        this.ensureLogDir();
    }
    ensureLogDir() {
        const dir = join(this.logPath, '..');
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
    }
    format(level, message, args) {
        const timestamp = new Date().toISOString();
        const formattedArgs = args.length > 0 ? ' ' + args.map(a => String(a)).join(' ') : '';
        return `[${timestamp}] [${level.toUpperCase()}] ${message}${formattedArgs}\n`;
    }
    shouldLog(level) {
        return LOG_LEVELS[level] >= this.minLevel;
    }
    write(entry) {
        try {
            appendFileSync(this.logPath, entry, 'utf-8');
        }
        catch {
            // Silently fail if we can't write to log
        }
    }
    debug(message, ...args) {
        if (this.shouldLog('debug')) {
            const entry = this.format('debug', message, args);
            this.write(entry);
        }
    }
    info(message, ...args) {
        if (this.shouldLog('info')) {
            const entry = this.format('info', message, args);
            this.write(entry);
        }
    }
    warn(message, ...args) {
        if (this.shouldLog('warn')) {
            const entry = this.format('warn', message, args);
            this.write(entry);
        }
    }
    error(message, ...args) {
        if (this.shouldLog('error')) {
            const entry = this.format('error', message, args);
            this.write(entry);
        }
    }
}
export function createLogger(runPath, level = 'info') {
    const logPath = join(runPath, 'logs', 'turpan.log');
    return new TurpanLogger(logPath, level);
}
export function createNoopLogger() {
    return {
        debug: () => { },
        info: () => { },
        warn: () => { },
        error: () => { },
    };
}
//# sourceMappingURL=index.js.map