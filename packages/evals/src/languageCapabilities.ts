export interface LanguageCapability {
  language: string;
  detectFiles: string[];
  symbols?: string;
  references?: string;
  diagnostics?: string;
  testCommand?: string;
  buildCommand?: string;
  formatting?: string;
  nativeAnalyzers: string[];
  evalBacked: boolean;
}

export const LANGUAGE_CAPABILITIES: LanguageCapability[] = [
  {
    language: 'TypeScript/JavaScript',
    detectFiles: ['package.json', 'tsconfig.json', 'jsconfig.json'],
    symbols: 'TypeScript compiler API or LSP where available',
    references: 'TypeScript compiler API or LSP where available',
    diagnostics: 'tsc, eslint ecosystem',
    testCommand: 'package manager test script',
    buildCommand: 'package manager build script',
    formatting: 'project formatter when configured',
    nativeAnalyzers: ['tsc', 'eslint', 'vitest/jest/playwright when configured'],
    evalBacked: true,
  },
  {
    language: 'Python',
    detectFiles: ['pyproject.toml', 'requirements.txt', '*.py'],
    diagnostics: 'pyright/ruff when available',
    testCommand: 'pytest when configured',
    buildCommand: 'project-specific',
    formatting: 'ruff format/black when configured',
    nativeAnalyzers: ['ruff', 'pyright', 'pytest when available'],
    evalBacked: true,
  },
  {
    language: 'Go',
    detectFiles: ['go.mod'],
    diagnostics: 'go vet',
    testCommand: 'go test ./...',
    buildCommand: 'go test ./... or go build ./...',
    formatting: 'gofmt',
    nativeAnalyzers: ['go test', 'go vet'],
    evalBacked: false,
  },
  {
    language: 'Rust',
    detectFiles: ['Cargo.toml'],
    diagnostics: 'cargo check/clippy',
    testCommand: 'cargo test',
    buildCommand: 'cargo check',
    formatting: 'rustfmt',
    nativeAnalyzers: ['cargo check', 'cargo clippy', 'cargo test'],
    evalBacked: false,
  },
  {
    language: 'Java',
    detectFiles: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
    diagnostics: 'language-native compiler/build diagnostics',
    testCommand: 'mvn test or gradle test',
    buildCommand: 'mvn test or gradle build',
    nativeAnalyzers: ['maven/gradle compiler and test ecosystem'],
    evalBacked: false,
  },
  {
    language: 'C#',
    detectFiles: ['*.csproj', '*.sln'],
    diagnostics: 'dotnet build/analyzers',
    testCommand: 'dotnet test',
    buildCommand: 'dotnet build',
    nativeAnalyzers: ['dotnet build', 'dotnet test', 'Roslyn analyzers'],
    evalBacked: false,
  },
];
