export function parseStructuredOutput(raw, validator, repair) {
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
function tryParseJson(raw) {
    try {
        return JSON.parse(raw);
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=StructuredOutput.js.map