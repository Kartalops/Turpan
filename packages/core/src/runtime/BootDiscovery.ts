import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { checkDangerousPatterns } from '../runner/CommandPolicy.js';
import type { BootCandidate } from './types.js';

type PackageJson = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

export class BootDiscovery {
  discover(projectRoot: string): BootCandidate[] {
    const candidates: BootCandidate[] = [];
    const pkg = this.readJson<PackageJson>(join(projectRoot, 'package.json'));
    const packageManager = this.detectPackageManager(projectRoot);

    if (pkg?.scripts) {
      const rankedScripts = [
        ['dev', 100, 'package.json dev script'],
        ['start', 80, 'package.json start script'],
        ['serve', 70, 'package.json serve script'],
        ['preview', 60, 'package.json preview script'],
      ] as const;
      for (const [script, rank, reason] of rankedScripts) {
        if (pkg.scripts[script]) {
          this.pushIfSafe(candidates, {
            id: `package:${script}`,
            command: `${packageManager} run ${script}`,
            cwd: projectRoot,
            source: 'package.json',
            rank,
            reason,
          });
        }
      }
    }

    if (existsSync(join(projectRoot, 'docker-compose.yml')) || existsSync(join(projectRoot, 'compose.yml'))) {
      this.pushIfSafe(candidates, {
        id: 'docker-compose',
        command: 'docker compose up',
        cwd: projectRoot,
        source: 'Docker Compose',
        rank: 45,
        reason: 'compose file present; requires explicit execution policy',
      });
    }

    if (existsSync(join(projectRoot, 'Makefile'))) {
      this.pushIfSafe(candidates, {
        id: 'make-dev',
        command: 'make dev',
        cwd: projectRoot,
        source: 'Makefile',
        rank: 40,
        reason: 'Makefile convention',
      });
    }

    if (existsSync(join(projectRoot, 'pyproject.toml')) || existsSync(join(projectRoot, 'requirements.txt'))) {
      this.pushIfSafe(candidates, {
        id: 'python-module',
        command: 'python -m app',
        cwd: projectRoot,
        source: 'Python convention',
        rank: 30,
        reason: 'Python project detected; command requires confirmation by policy',
      });
    }

    const readme = this.readText(join(projectRoot, 'README.md'));
    if (readme) {
      const match = readme.match(/\b(pnpm|npm|yarn|bun)\s+run\s+(dev|start|serve|preview)\b/);
      if (match) {
        this.pushIfSafe(candidates, {
          id: `readme:${match[2]}`,
          command: match[0],
          cwd: projectRoot,
          source: 'README',
          rank: 35,
          reason: 'README run instruction',
        });
      }
    }

    return candidates.sort((a, b) => b.rank - a.rank);
  }

  private pushIfSafe(candidates: BootCandidate[], candidate: BootCandidate): void {
    const dangerous = checkDangerousPatterns(candidate.command);
    if (!dangerous.blocked) candidates.push(candidate);
  }

  private detectPackageManager(projectRoot: string): string {
    if (existsSync(join(projectRoot, 'pnpm-lock.yaml'))) return 'pnpm';
    if (existsSync(join(projectRoot, 'yarn.lock'))) return 'yarn';
    if (existsSync(join(projectRoot, 'bun.lockb'))) return 'bun';
    return 'npm';
  }

  private readJson<T>(path: string): T | null {
    try {
      return JSON.parse(readFileSync(path, 'utf-8')) as T;
    } catch {
      return null;
    }
  }

  private readText(path: string): string | null {
    try {
      return readFileSync(path, 'utf-8');
    } catch {
      return null;
    }
  }
}
