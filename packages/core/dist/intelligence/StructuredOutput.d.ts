export interface OutputValidator<T> {
    name: string;
    validate(value: unknown): value is T;
}
export interface StructuredParseResult<T> {
    ok: boolean;
    value?: T;
    error?: string;
    repairAttempted: boolean;
}
export declare function parseStructuredOutput<T>(raw: unknown, validator: OutputValidator<T>, repair?: (rawText: string) => string): StructuredParseResult<T>;
//# sourceMappingURL=StructuredOutput.d.ts.map