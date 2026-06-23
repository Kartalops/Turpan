import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { TurpanConfig } from '@turpan/shared';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

class TurpanLogger implements Logger {
  private logPath: string;
  private level: LogLevel;
  private minLevel: number;

  constructor(logPath: string, level: LogLevel = 'info') {
    this.logPath = logPath;
    this.level = level;
    this.minLevel = LOG_LEVELS[level];
    this.ensureLogDir();
  }

  private ensureLogDir(): void {
    const dir = join(this.logPath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private format(level: LogLevel, message: string, args: unknown[]): string {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.length > 0 ? ' ' + args.map(a => String(a)).join(' ') : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${formattedArgs}\n`;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= this.minLevel;
  }

  private write(entry: string): void {
    try {
      appendFileSync(this.logPath, entry, 'utf-8');
    } catch {
      // Silently fail if we can't write to log
    }
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      const entry = this.format('debug', message, args);
      this.write(entry);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      const entry = this.format('info', message, args);
      this.write(entry);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      const entry = this.format('warn', message, args);
      this.write(entry);
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      const entry = this.format('error', message, args);
      this.write(entry);
    }
  }
}

export function createLogger(runPath: string, level: LogLevel = 'info'): Logger {
  const logPath = join(runPath, 'logs', 'turpan.log');
  return new TurpanLogger(logPath, level);
}

export function createNoopLogger(): Logger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}