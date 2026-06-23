/**
 * SchemaMigrationAnalyzer — detect schema/model changes without migration evidence
 */

import type { DiffScopedAnalyzer, DiffScopedAnalyzerContext, DiffScopedFinding } from '../types.js';

const SCHEMA_PATTERNS = [
  /schema/,
  /model/,
  /migration/,
  /seeds?/,
  /prisma/,
  /drizzle/,
  /knex/,
  /typeorm/,
  /sequelize/,
];

const MIGRATION_DIRS = [
  'migrations',
  'prisma/migrations',
  'db/migrations',
  'database/migrations',
  'drizzle/migrations',
  'knex/migrations',
];

const SCHEMA_CHANGE_PATTERNS = [
  /CREATE\s+TABLE/i,
  /ALTER\s+TABLE/i,
  /ADD\s+COLUMN/i,
  /DROP\s+COLUMN/i,
  /schema\.prisma/i,
  /migration\.ts$/,
];

function isSchemaFile(path: string): boolean {
  const lower = path.toLowerCase();
  return SCHEMA_PATTERNS.some((p) => p.test(lower));
}

function isMigrationFile(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    MIGRATION_DIRS.some((dir) => lower.includes(dir)) ||
    /_migration\.ts$/.test(lower) ||
    /_schema\.ts$/.test(lower)
  );
}

function hasSchemaChanges(lines: string[]): boolean {
  return lines.some((line) => SCHEMA_CHANGE_PATTERNS.some((p) => p.test(line)));
}

function extractSchemaTableNames(hunkLines: string[]): string[] {
  const tables: string[] = [];

  for (const line of hunkLines) {
    // Match CREATE TABLE statements
    const createMatch = line.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?/i);
    if (createMatch) {
      tables.push(createMatch[1]!);
    }

    // Match Prisma model names
    const modelMatch = line.match(/model\s+[`"']?(\w+)[`"']?\s*{/i);
    if (modelMatch) {
      tables.push(modelMatch[1]!);
    }
  }

  return tables;
}

function generateId(analyzerId: string, filePath: string, idx: number): string {
  const base = filePath.split('/').pop() ?? filePath;
  return `${analyzerId}-${base}-${idx}`;
}

export const SchemaMigrationAnalyzer: DiffScopedAnalyzer = {
  id: 'schema-migration',
  name: 'Schema Migration Analyzer',

  async run(ctx: DiffScopedAnalyzerContext): Promise<{ findings: DiffScopedFinding[] }> {
    const findings: DiffScopedFinding[] = [];

    // Find changed schema files
    const schemaFiles = ctx.diffResult.files.filter(
      (f) => !f.binary && isSchemaFile(f.path)
    );

    if (schemaFiles.length === 0) {
      return { findings };
    }

    // Check if any migration files were also changed
    const migrationFilesChanged = ctx.diffResult.files.some(
      (f) => !f.binary && isMigrationFile(f.path)
    );

    for (const schemaFile of schemaFiles) {
      if (isMigrationFile(schemaFile.path)) continue; // Skip migration files themselves

      const changeType = schemaFile.changeType as DiffScopedFinding['introducedBy'];

      // Get hunks for this file
      const fileHunks = ctx.diffResult.hunks.filter((h) => h.filePath === schemaFile.path);
      const addedLines = fileHunks.flatMap((h) =>
        h.lines.filter((l) => l.type === 'added').map((l) => l.content)
      );

      if (!hasSchemaChanges(addedLines)) continue;

      // Extract table names being changed
      const tableNames = extractSchemaTableNames(addedLines);

      // If no migration file was changed along with this schema
      if (!migrationFilesChanged) {
        findings.push({
          id: generateId('schema-migration', schemaFile.path, tableNames.length),
          severity: 'medium',
          category: 'correctness',
          title: `Schema change detected without migration file update`,
          explanation: tableNames.length > 0
            ? `Schema changes to table(s) "${tableNames.join(', ')}" were detected but no corresponding migration file was updated. Please ensure a migration is created to apply these changes.`
            : `Schema/model changes were detected but no corresponding migration file was updated. Please ensure a migration is created to apply these changes.`,
          file: schemaFile.path,
          introducedBy: changeType,
          pattern: 'schema-change',
          confidence: 80,
        });
      }
    }

    return { findings };
  },
};