export interface RegressionTestAssessment {
  meaningful: boolean;
  reasons: string[];
}

export function assessRegressionTest(diff: string | undefined): RegressionTestAssessment {
  const reasons: string[] = [];
  if (!diff?.trim()) {
    return { meaningful: false, reasons: ['no regression test diff provided'] };
  }

  const addedLines = diff
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1).trim());

  const addedText = addedLines.join('\n');
  const hasTest = /\b(it|test|describe)\s*\(/.test(addedText);
  const hasAssertion = /\b(expect|assert|strictEqual|deepStrictEqual)\s*\(/.test(addedText);
  const skipped = /\b(it|test|describe)\.skip\s*\(/.test(addedText);
  const alwaysTrue = /expect\s*\(\s*(true|1)\s*\)\.toBe\s*\(\s*(true|1)\s*\)/.test(addedText);
  const swallowed = /catch\s*\([^)]*\)\s*\{\s*\}/.test(addedText) || /catch\s*\([^)]*\)\s*\{\s*return\s*;?\s*\}/.test(addedText);
  const mocksImplementation = /vi\.mock|jest\.mock/.test(addedText) && /implementation|module under test|sut/i.test(addedText);

  if (!hasTest) reasons.push('no test case added');
  if (!hasAssertion) reasons.push('no assertion added');
  if (skipped) reasons.push('test is skipped');
  if (alwaysTrue) reasons.push('contains always-true assertion');
  if (swallowed) reasons.push('swallows exceptions');
  if (mocksImplementation) reasons.push('appears to mock implementation under test');

  return { meaningful: reasons.length === 0, reasons };
}
