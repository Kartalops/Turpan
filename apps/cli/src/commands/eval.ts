import { Command } from 'commander';
import { resolve, join } from 'path';
import { existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function resolveProjectPath(input?: string): string {
  if (!input) return process.cwd();
  return resolve(process.cwd(), input);
}

export function createEvalCommand(): Command {
  const cmd = new Command('eval');
  cmd
    .description('🐪 Run Turpan eval suite against fixture projects')
    .argument('[path]', 'Project path (default: repo root)', '.')
    .option('--fixture <name>', 'Run only this fixture')
    .option('--update', 'Update eval.json expectations to match actual results')
    .option('--verbose', 'Show full output and all assertion details')
    .option('--quiet', 'Show minimal output')
    .option('--hard-fail', 'Treat all warnings as errors (CI mode)')
    .option('--report <path>', 'Save JSON report to custom path')
    .action(async (path: string, options: {
      fixture?: string;
      update?: boolean;
      verbose?: boolean;
      quiet?: boolean;
      hardFail?: boolean;
      report?: string;
    }) => {
      const projectRoot = resolveProjectPath(path);

      // Find the eval script relative to repo root
      // scripts/eval.ts → apps/cli needs to go up two dirs from its location
      const repoRoot = join(__dirname, '..', '..', '..');
      const evalScript = join(repoRoot, 'scripts', 'eval.ts');

      if (!existsSync(evalScript)) {
        console.error(`✗  Eval script not found at ${evalScript}`);
        console.error('   Make sure you are running from within the Turpan repository.');
        process.exit(1);
      }

      const nodeBin = process.execPath;
      const args = [
        evalScript,
        '--fixture', options.fixture,
        options.update && '--update',
        options.verbose && '--verbose',
        options.quiet && '--quiet',
        options.hardFail && '--hard-fail',
        options.report && '--report', options.report,
      ].filter(Boolean) as string[];

      if (options.verbose) {
        console.log(`>>> node ${args.join(' ')}`);
      }

      const result = spawnSync(nodeBin, args, {
        cwd: projectRoot,
        encoding: 'utf-8',
        stdio: 'inherit',
      });

      process.exit(result.status ?? 1);
    });

  return cmd;
}
