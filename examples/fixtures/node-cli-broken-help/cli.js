#!/usr/bin/env node
/**
 * mycli — a CLI tool with a broken --help flag.
 *
 * BUG: when --help is passed, it prints help but exits with code 1 instead of 0.
 * This breaks scripts and tools that check exit codes.
 */

const args = process.argv.slice(2);

function printHelp() {
  console.log(`
Usage: mycli [options] <command>

Commands:
  deploy    Deploy the application to production
  rollback  Rollback to the previous deployment
  status    Show deployment status

Options:
  --help    Show this help message
  --version Show version number
  --env     Set environment ( staging | production)

Examples:
  mycli deploy --env production
  mycli status
`);
}

function printVersion() {
  console.log('mycli v1.2.0');
}

// Parse args manually (no commander/yargs — intentionally simple)
for (const arg of args) {
  if (arg === '--help' || arg === '-h') {
    printHelp();
    // BUG: exits with 1 — should be 0. This causes CI/CD scripts to fail.
    process.exit(1);
  }
  if (arg === '--version' || arg === '-v') {
    printVersion();
    process.exit(0);
  }
}

if (args.length === 0) {
  console.error('Error: no command specified. Run with --help for usage.');
  process.exit(1);
}

const command = args[0];

if (command === 'deploy') {
  console.log('Deploying to production...');
  // In a real CLI, this would do actual deployment
  process.exit(0);
} else if (command === 'rollback') {
  console.log('Rolling back...');
  process.exit(0);
} else if (command === 'status') {
  console.log('Status: running (v1.2.0)');
  process.exit(0);
} else {
  console.error(`Error: unknown command "${command}". Run with --help for usage.`);
  process.exit(1);
}
