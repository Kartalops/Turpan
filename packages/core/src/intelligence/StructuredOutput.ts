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

export function parseStructuredOutput<T>(
  raw: unknown,
  validator: OutputValidator<T>,
  repair?: (rawText: string) => string,
): StructuredParseResult<T> {
  if (validator.validate(raw)) {
    return { ok: true, value: raw, repairAttempted: false };
  }

  if (typeof raw !== 'string') {
    return { ok: false, error: `Invalid ${validator.name}: expected structured object`, repairAttempted: false };
  }

  const parsed = tryParseJson(raw);
  if (validator.validate(parsed)) {
    return { ok: true, value: parsed, repairAttempted: false };
  }

  if (!repair) {
    return { ok: false, error: `Invalid ${validator.name}: schema validation failed`, repairAttempted: false };
  }

  const repaired = tryParseJson(repair(raw));
  if (validator.validate(repaired)) {
    return { ok: true, value: repaired, repairAttempted: true };
  }

  return { ok: false, error: `Invalid ${validator.name}: repair failed`, repairAttempted: true };
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
