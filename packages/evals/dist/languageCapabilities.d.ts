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
export declare const LANGUAGE_CAPABILITIES: LanguageCapability[];
//# sourceMappingURL=languageCapabilities.d.ts.map