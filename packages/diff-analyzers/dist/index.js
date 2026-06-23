// src/security/HardcodedSecretAnalyzer.ts
var PATTERNS = {
  // Generic hardcoded secret pattern
  genericSecret: /(?:password|passwd|pass|pwd|secret|token|api_?key|credential|auth|private)[_-]?(?:key|id|token|secret)?["\s]*[=:]["'\s]*["'][A-Za-z0-9+/=_\-]{8,}["']/gi,
  // AWS access key ID
  awsKey: /AKIA[0-9A-Z]{16}/g,
  // Generic long secret-like string (32+ chars)
  longSecret: /["'][A-Za-z0-9+/=_\-]{32,}["']/g,
  // API key name patterns (high confidence when followed by = or :)
  apiKeyNames: /\b(api_key|apiKey|API_KEY|apikey|api-key|api_secret|apiSecret|API_SECRET|secret_key|SECRET_KEY|secretKey|private_key|PRIVATE_KEY|privatekey|priv_key)\b/gi,
  // Password name patterns
  passwordNames: /\b(password|PASSWORD|passwd|pass|pwd|credential|CREDENTIALS|credentials)\b/gi,
  // Token name patterns
  tokenNames: /\b(token|TOKEN|auth_token|AUTH_TOKEN|access_token|ACCESS_TOKEN|bearer_token|BEARER)\b/gi,
  // Connection string patterns
  connectionStrings: /\bConnection String|connection_string|CONNECTION_STRING\b/gi
};
var SKIP_PATHS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".output",
  ".cache",
  "__pycache__",
  "vendor",
  "vendored"
];
function shouldSkipPath(filePath) {
  const lower = filePath.toLowerCase();
  return SKIP_PATHS.some((skip) => lower.includes(skip));
}
function getAddedLines(hunk) {
  return hunk.lines.filter((l) => l.type === "added").map((l) => ({
    line: l,
    lineNum: l.newLineNumber ?? 0
  }));
}
function generateId(analyzerId, filePath, line) {
  const base = filePath.split("/").pop() ?? filePath;
  return `${analyzerId}-${base}-${line}`;
}
function checkLineForSecrets(content, filePath, hunk, changeType, projectRoot) {
  const findings = [];
  let match;
  const awsRe = new RegExp(PATTERNS.awsKey.source, "g");
  while ((match = awsRe.exec(content)) !== null) {
    findings.push({
      id: generateId("hardcoded-secret", filePath, match.index),
      severity: "critical",
      category: "security",
      title: "Hardcoded AWS Access Key ID detected",
      explanation: `A potential AWS access key ID (AKIA...) was detected in ${changeType} code. AWS keys must never be committed. Rotate the key immediately and use environment variables or a secrets manager.`,
      file: filePath,
      line: match.index,
      diffLines: hunk.lines.filter((l) => l.type === "added").map((l) => ({
        lineNum: l.newLineNumber ?? 0,
        content: l.content,
        type: l.type
      })),
      introducedBy: changeType,
      pattern: match[0],
      confidence: 90
    });
  }
  const genericRe = new RegExp(PATTERNS.genericSecret.source, "g");
  while ((match = genericRe.exec(content)) !== null) {
    findings.push({
      id: generateId("hardcoded-secret", filePath, match.index),
      severity: "critical",
      category: "security",
      title: "Hardcoded secret detected",
      explanation: `A hardcoded secret pattern (${match[0].slice(0, 20)}...) was detected. Secrets should never be committed to source control. Use environment variables or a secrets manager instead.`,
      file: filePath,
      line: match.index,
      diffLines: hunk.lines.filter((l) => l.type === "added").map((l) => ({
        lineNum: l.newLineNumber ?? 0,
        content: l.content,
        type: l.type
      })),
      introducedBy: changeType,
      pattern: match[0],
      confidence: 90
    });
  }
  const longSecretRe = new RegExp(PATTERNS.longSecret.source, "g");
  while ((match = longSecretRe.exec(content)) !== null) {
    const val = match[0].slice(1, -1);
    if (/^[A-Fa-f0-9]{32,}$/.test(val)) continue;
    if (/^(?:true|false|null|undefined)$/.test(val)) continue;
    findings.push({
      id: generateId("hardcoded-secret", filePath, match.index),
      severity: "critical",
      category: "security",
      title: "Potential hardcoded secret detected",
      explanation: `A long base64-like or encoded string was detected which may be a secret. Review and replace with a reference to a secrets manager if confirmed.`,
      file: filePath,
      line: match.index,
      diffLines: hunk.lines.filter((l) => l.type === "added").map((l) => ({
        lineNum: l.newLineNumber ?? 0,
        content: l.content,
        type: l.type
      })),
      introducedBy: changeType,
      pattern: match[0],
      confidence: 70
    });
  }
  return findings;
}
var HardcodedSecretAnalyzer = {
  id: "hardcoded-secret",
  name: "Hardcoded Secret Analyzer",
  async run(ctx) {
    const findings = [];
    for (const file of ctx.diffResult.files) {
      if (shouldSkipPath(file.path)) continue;
      if (file.binary) continue;
      const changeType = file.changeType;
      const fileHunks = ctx.diffResult.hunks.filter((h) => h.filePath === file.path);
      for (const hunk of fileHunks) {
        const addedLines = getAddedLines(hunk);
        for (const { line, lineNum } of addedLines) {
          const lineFindings = checkLineForSecrets(
            line.content,
            file.path,
            hunk,
            changeType,
            ctx.projectRoot
          );
          findings.push(...lineFindings);
        }
      }
    }
    return { findings };
  }
};

// src/security/AuthGuardAnalyzer.ts
var SKIP_PATHS2 = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".output",
  ".cache",
  "__pycache__",
  "vendor",
  "vendored"
];
var GUARD_REMOVAL_PATTERNS = [
  /\/\/\s*auth\b/i,
  /\/\/\s*skip\s*auth\b/i,
  /\/\/\s*bypass\b/i,
  /skipAuth\b/i,
  /bypassAuth\b/i,
  /noAuth\b/i,
  /auth:\s*false\b/i,
  /auth:\s*0\b/i,
  /\bnoauth\b/i,
  /\bPUBLIC\b/i,
  /\bisPublic\b/i,
  /public:\s*true\b/i,
  /\ballowUnauthenticated\b/i,
  /\ballow-unauthenticated\b/i
];
var PUBLIC_ROUTE_PATTERNS = [
  /\bpublic\b.*?(?:route|endpoint|api|handler)/i,
  /\bskipAuth\b/i,
  /\bnoAuth\b/i,
  /\bbypass\b/i,
  /\bisPublic\b/i,
  /\ballowUnauthenticated\b/i,
  /\ballow-unauthenticated\b/i
];
var AUTH_ROUTE_SKIP_PATTERNS = [
  /\/login$/i,
  /\/signin$/i,
  /\/auth\/login$/i,
  /\/auth\/signin$/i,
  /\/auth\/callback$/i,
  /\/auth\/verify$/i
];
function shouldSkipPath2(filePath) {
  const lower = filePath.toLowerCase();
  return SKIP_PATHS2.some((skip) => lower.includes(skip));
}
function isAuthRoute(filePath) {
  return AUTH_ROUTE_SKIP_PATTERNS.some((p) => p.test(filePath));
}
function checkHunkForAuthBypass(hunk, filePath, changeType) {
  const findings = [];
  const addedLines = hunk.lines.filter((l) => l.type === "added");
  const deletedLines = hunk.lines.filter((l) => l.type === "deleted");
  for (const line of addedLines) {
    for (const pattern of GUARD_REMOVAL_PATTERNS) {
      if (pattern.test(line.content)) {
        findings.push({
          id: `auth-guard-${filePath.split("/").pop()}-${line.newLineNumber ?? 0}`,
          severity: "critical",
          category: "security",
          title: "Auth guard bypass or removal detected",
          explanation: `A pattern suggesting auth guard bypass or removal was found: "${line.content.trim()}". This may allow unauthenticated access to protected resources.`,
          file: filePath,
          line: line.newLineNumber,
          diffLines: hunk.lines.filter((l) => l.type === "added").map((l) => ({
            lineNum: l.newLineNumber ?? 0,
            content: l.content,
            type: l.type
          })),
          introducedBy: changeType,
          pattern: pattern.source,
          confidence: 90
        });
        break;
      }
    }
    for (const pattern of PUBLIC_ROUTE_PATTERNS) {
      if (pattern.test(line.content) && !isAuthRoute(filePath)) {
        findings.push({
          id: `auth-guard-public-${filePath.split("/").pop()}-${line.newLineNumber ?? 0}`,
          severity: "high",
          category: "security",
          title: "Public access flag added to route",
          explanation: `A public access flag was detected on what may be a protected route: "${line.content.trim()}". Verify this route should truly be public.`,
          file: filePath,
          line: line.newLineNumber,
          diffLines: hunk.lines.filter((l) => l.type === "added").map((l) => ({
            lineNum: l.newLineNumber ?? 0,
            content: l.content,
            type: l.type
          })),
          introducedBy: changeType,
          pattern: pattern.source,
          confidence: 80
        });
        break;
      }
    }
  }
  for (const line of deletedLines) {
    const middlewarePattern = /\b(auth|verify|authenticate|authorize|permits?)\s*(?: middleware)?\b/i;
    if (middlewarePattern.test(line.content)) {
      findings.push({
        id: `auth-guard-middleware-removed-${filePath.split("/").pop()}-${line.oldLineNumber ?? 0}`,
        severity: "high",
        category: "security",
        title: "Auth middleware appears to be removed",
        explanation: `A deleted line appears to reference auth middleware being removed: "${line.content.trim()}". This could disable authentication on a route.`,
        file: filePath,
        line: line.oldLineNumber,
        diffLines: hunk.lines.filter((l) => l.type === "deleted").map((l) => ({
          lineNum: l.oldLineNumber ?? 0,
          content: l.content,
          type: l.type
        })),
        introducedBy: changeType,
        pattern: middlewarePattern.source,
        confidence: 70
      });
    }
  }
  return findings;
}
var AuthGuardAnalyzer = {
  id: "auth-guard",
  name: "Auth Guard Analyzer",
  async run(ctx) {
    const findings = [];
    for (const file of ctx.diffResult.files) {
      if (shouldSkipPath2(file.path)) continue;
      if (file.binary) continue;
      const changeType = file.changeType;
      const fileHunks = ctx.diffResult.hunks.filter((h) => h.filePath === file.path);
      for (const hunk of fileHunks) {
        const hunkFindings = checkHunkForAuthBypass(hunk, file.path, changeType);
        findings.push(...hunkFindings);
      }
    }
    return { findings };
  }
};

// src/security/AdminRouteAnalyzer.ts
var SKIP_PATHS3 = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".output",
  ".cache",
  "__pycache__",
  "vendor",
  "vendored"
];
var ADMIN_ROUTE_PATTERNS = [
  /^\/?admin/i,
  /^\/?dashboard/i,
  /^\/?manage/i,
  /^\/?api\/admin/i,
  /^\/?api\/manage/i,
  /^\/?api\/dashboard/i,
  /^\/?api\/users/i,
  /^\/?api\/roles/i,
  /^\/?api\/permissions/i,
  /^\/?api\/access/i,
  /^\/?root/i,
  /^\/?api\/settings/i
];
var USER_SETTINGS_PATTERN = /\/settings\//i;
var AUTH_PROTECTION_WORDS = [
  /\bauth\b/i,
  /\bguard\b/i,
  /\bmiddleware\b/i,
  /\bpermission\b/i,
  /\brole\b/i,
  /\brequire\b/i,
  /\bauthorized\b/i,
  /\bauthenticated\b/i
];
function shouldSkipPath3(filePath) {
  const lower = filePath.toLowerCase();
  return SKIP_PATHS3.some((skip) => lower.includes(skip));
}
function isAdminRoutePath(filePath) {
  if (USER_SETTINGS_PATTERN.test(filePath)) return false;
  const normalized = filePath.replace(/^\/?(src|app)\//, "");
  return ADMIN_ROUTE_PATTERNS.some((p) => p.test("/" + normalized));
}
function hasAuthProtection(content) {
  return AUTH_PROTECTION_WORDS.some((p) => p.test(content));
}
function checkHunkForAdminRoutes(hunk, filePath, changeType) {
  const findings = [];
  if (!isAdminRoutePath(filePath)) return findings;
  const addedLines = hunk.lines.filter((l) => l.type === "added");
  const contextLines = hunk.lines.filter((l) => l.type === "context");
  const allContent = [...addedLines, ...contextLines].map((l) => l.content).join("\n");
  if (!hasAuthProtection(allContent)) {
    const addedContent = addedLines.map((l) => l.content).join("\n");
    findings.push({
      id: `admin-route-${filePath.split("/").pop()}-${hunk.newStart}`,
      severity: "high",
      category: "security",
      title: "Admin route added without auth checks",
      explanation: `An admin, dashboard, or management route was added/modified (${filePath}) but no auth, guard, middleware, permission, or role checks were detected in the surrounding code. This could allow unauthorized access.`,
      file: filePath,
      line: hunk.newStart,
      diffLines: addedLines.map((l) => ({
        lineNum: l.newLineNumber ?? 0,
        content: l.content,
        type: l.type
      })),
      introducedBy: changeType,
      pattern: "admin-route-without-auth",
      confidence: 85
    });
  }
  return findings;
}
var AdminRouteAnalyzer = {
  id: "admin-route",
  name: "Admin Route Analyzer",
  async run(ctx) {
    const findings = [];
    for (const file of ctx.diffResult.files) {
      if (shouldSkipPath3(file.path)) continue;
      if (file.binary) continue;
      const changeType = file.changeType;
      const fileHunks = ctx.diffResult.hunks.filter((h) => h.filePath === file.path);
      for (const hunk of fileHunks) {
        const hunkFindings = checkHunkForAdminRoutes(hunk, file.path, changeType);
        findings.push(...hunkFindings);
      }
    }
    return { findings };
  }
};

// src/security/CorsAnalyzer.ts
var SKIP_PATHS4 = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".output",
  ".cache",
  "__pycache__",
  "vendor",
  "vendored"
];
var CORS_WILDCARD_PATTERNS = [
  /Access-Control-Allow-Origin:\s*\*/i,
  /origin:\s*['"]\*['"]/i,
  /cors:\s*\{\s*origin:\s*['"]\*['"]\s*\}/i,
  /cors\(\s*\{\s*origin:\s*['"]\*['"]\s*\}\s*\)/i,
  /cors\(\s*\{[^}]*origin\s*:\s*['"]\*['"]/i,
  /\bALLOW_ALL\b/i,
  /credentials:\s*false\b/i,
  /app\.use\s*\(\s*cors\s*\)\s*;?$/i
  // cors() with defaults (may allow *)
];
var API_ROUTE_PATTERNS = [
  /\/api\//i,
  /\/v\d+\//i,
  /endpoint/i,
  /route\s*\(/i
];
function shouldSkipPath4(filePath) {
  const lower = filePath.toLowerCase();
  return SKIP_PATHS4.some((skip) => lower.includes(skip));
}
function isApiRoute(filePath, content) {
  if (API_ROUTE_PATTERNS.some((p) => p.test(filePath))) return true;
  return API_ROUTE_PATTERNS.some((p) => p.test(content));
}
function detectCorsWildcard(hunk, filePath, changeType) {
  const findings = [];
  for (const line of hunk.lines) {
    if (line.type !== "added") continue;
    for (const pattern of CORS_WILDCARD_PATTERNS) {
      if (pattern.test(line.content)) {
        const isApi = isApiRoute(filePath, line.content);
        findings.push({
          id: `cors-wildcard-${filePath.split("/").pop()}-${line.newLineNumber ?? 0}`,
          severity: isApi ? "high" : "medium",
          category: "security",
          title: isApi ? "CORS wildcard (*) introduced on API route" : "CORS wildcard (*) introduced",
          explanation: isApi ? `A CORS wildcard origin (*) was detected on an API route. This allows any website to make cross-origin requests to your API, which may expose sensitive data. Use a specific origin list instead.` : `A CORS wildcard origin (*) was detected. This allows any website to make cross-origin requests. Use a specific origin list or limit to known domains.`,
          file: filePath,
          line: line.newLineNumber,
          diffLines: hunk.lines.filter((l) => l.type === "added").map((l) => ({
            lineNum: l.newLineNumber ?? 0,
            content: l.content,
            type: l.type
          })),
          introducedBy: changeType,
          pattern: pattern.source,
          confidence: 90
        });
        break;
      }
    }
  }
  return findings;
}
var CorsAnalyzer = {
  id: "cors-wildcard",
  name: "CORS Wildcard Analyzer",
  async run(ctx) {
    const findings = [];
    for (const file of ctx.diffResult.files) {
      if (shouldSkipPath4(file.path)) continue;
      if (file.binary) continue;
      const changeType = file.changeType;
      const fileHunks = ctx.diffResult.hunks.filter((h) => h.filePath === file.path);
      for (const hunk of fileHunks) {
        const hunkFindings = detectCorsWildcard(hunk, file.path, changeType);
        findings.push(...hunkFindings);
      }
    }
    return { findings };
  }
};

// src/security/SqlInjectionAnalyzer.ts
var SKIP_PATHS5 = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".output",
  ".cache",
  "__pycache__",
  "vendor",
  "vendored"
];
var TEMPLATE_SQL_INTERPOLATION = /`\s*(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|UNION).*\$\{/gi;
var CONCAT_SQL_PATTERNS = [
  /['"`]\s*(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|UNION).*['"`]\s*\+\s*/gi,
  /\+\s*['"`]\s*(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|UNION).*['"`]/gi,
  /['"`]\s*SELECT.*['"`]\s*\+\s*\w+/gi
];
var ORM_QUERY_METHODS = /\.query\s*\(/;
var ORM_FIND_METHODS = /\.(findMany|findFirst|findUnique|create|update|delete|findOne)\s*\(/;
var USER_INPUT_SOURCES = [
  /\breq\.(params|query|body|headers)/i,
  /\brequest\.(params|query|body|headers)/i,
  /\bctx\.request\./i,
  /\bevent\.path\b/i,
  /\bevent\.query\b/i,
  /\bevent\.body\b/i,
  /\bparams\./i,
  /\bquery\./i,
  /\bbody\./i
];
function shouldSkipPath5(filePath) {
  const lower = filePath.toLowerCase();
  return SKIP_PATHS5.some((skip) => lower.includes(skip));
}
function containsUserInput(content) {
  return USER_INPUT_SOURCES.some((p) => p.test(content));
}
function isParameterized(content) {
  return /\?|\$\d+|\$[a-zA-Z_]/.test(content);
}
function detectSqlInjection(hunk, filePath, changeType) {
  const findings = [];
  for (const line of hunk.lines) {
    if (line.type !== "added") continue;
    const content = line.content;
    if (isParameterized(content)) continue;
    const templateMatch = TEMPLATE_SQL_INTERPOLATION.exec(content);
    if (templateMatch) {
      findings.push({
        id: `sql-injection-${filePath.split("/").pop()}-${line.newLineNumber ?? 0}`,
        severity: "high",
        category: "security",
        title: "Potential SQL injection via template literal interpolation",
        explanation: `SQL query appears to use template literal string interpolation (${templateMatch[0].slice(0, 30)}...). User input may be directly embedded into SQL queries, enabling SQL injection attacks. Use parameterized queries instead.`,
        file: filePath,
        line: line.newLineNumber,
        diffLines: hunk.lines.filter((l) => l.type === "added").map((l) => ({
          lineNum: l.newLineNumber ?? 0,
          content: l.content,
          type: l.type
        })),
        introducedBy: changeType,
        pattern: "template-literal-sql",
        confidence: 85
      });
      TEMPLATE_SQL_INTERPOLATION.lastIndex = 0;
      continue;
    }
    for (const pattern of CONCAT_SQL_PATTERNS) {
      if (pattern.test(content)) {
        const hasUserInput = containsUserInput(content);
        findings.push({
          id: `sql-injection-${filePath.split("/").pop()}-${line.newLineNumber ?? 0}`,
          severity: hasUserInput ? "high" : "medium",
          category: "security",
          title: hasUserInput ? "Potential SQL injection via string concatenation" : "SQL query built with string concatenation",
          explanation: hasUserInput ? `SQL query appears to use string concatenation with user input (${content.slice(0, 40)}...). This is a SQL injection risk. Use parameterized queries instead.` : `SQL query appears to be built with string concatenation rather than parameterization. Consider using parameterized queries for safety.`,
          file: filePath,
          line: line.newLineNumber,
          diffLines: hunk.lines.filter((l) => l.type === "added").map((l) => ({
            lineNum: l.newLineNumber ?? 0,
            content: l.content,
            type: l.type
          })),
          introducedBy: changeType,
          pattern: "string-concat-sql",
          confidence: hasUserInput ? 90 : 70
        });
        break;
      }
    }
    if (ORM_QUERY_METHODS.test(content) || ORM_FIND_METHODS.test(content)) {
      if (containsUserInput(content) && content.includes("${")) {
        findings.push({
          id: `sql-injection-${filePath.split("/").pop()}-${line.newLineNumber ?? 0}`,
          severity: "high",
          category: "security",
          title: "Potential SQL injection in ORM query",
          explanation: `An ORM query method appears to use template interpolation with user input. This can enable SQL injection if the ORM doesn't properly parameterize.`,
          file: filePath,
          line: line.newLineNumber,
          diffLines: hunk.lines.filter((l) => l.type === "added").map((l) => ({
            lineNum: l.newLineNumber ?? 0,
            content: l.content,
            type: l.type
          })),
          introducedBy: changeType,
          pattern: "orm-template-injection",
          confidence: 80
        });
      }
    }
  }
  return findings;
}
var SqlInjectionAnalyzer = {
  id: "sql-injection",
  name: "SQL Injection Analyzer",
  async run(ctx) {
    const findings = [];
    for (const file of ctx.diffResult.files) {
      if (shouldSkipPath5(file.path)) continue;
      if (file.binary) continue;
      const changeType = file.changeType;
      const fileHunks = ctx.diffResult.hunks.filter((h) => h.filePath === file.path);
      for (const hunk of fileHunks) {
        const hunkFindings = detectSqlInjection(hunk, file.path, changeType);
        findings.push(...hunkFindings);
      }
    }
    return { findings };
  }
};

// src/security/XssAnalyzer.ts
var SKIP_PATHS6 = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".output",
  ".cache",
  "__pycache__",
  "vendor",
  "vendored"
];
var XSS_SINK_PATTERNS = [
  {
    pattern: /dangerouslySetInnerHTML/i,
    sink: "dangerouslySetInnerHTML",
    confidence: 90
  },
  {
    pattern: /\.innerHTML\s*=/i,
    sink: "innerHTML assignment",
    confidence: 90
  },
  {
    pattern: /\.outerHTML\s*=/i,
    sink: "outerHTML assignment",
    confidence: 90
  },
  {
    pattern: /\beval\s*\(/i,
    sink: "eval()",
    confidence: 90
  },
  {
    pattern: /\bnew\s+Function\s*\(/i,
    sink: "new Function()",
    confidence: 85
  },
  {
    pattern: /document\.write\s*\(/i,
    sink: "document.write()",
    confidence: 90
  },
  {
    pattern: /document\.writeln\s*\(/i,
    sink: "document.writeln()",
    confidence: 90
  },
  {
    pattern: /\{\{.*?\}\}/g,
    // React/Svelte template injection style
    sink: "double-brace template binding",
    confidence: 70
  }
];
var JQUERY_XSS_PATTERNS = [/\.html\s*\(/i, /\.append\s*\(/i, /\.wrap\s*\(/i, /\.prepend\s*\(/i];
var USER_INPUT_PATTERNS = [
  /\breq\.(params|query|body|headers)/i,
  /\brequest\.(params|query|body|headers)/i,
  /\bctx\.request\./i,
  /\bevent\.path\b/i,
  /\bparams\./i,
  /\bquery\./i,
  /\bbody\./i
];
function shouldSkipPath6(filePath) {
  const lower = filePath.toLowerCase();
  return SKIP_PATHS6.some((skip) => lower.includes(skip));
}
function containsUserInput2(content) {
  return USER_INPUT_PATTERNS.some((p) => p.test(content));
}
function detectXss(hunk, filePath, changeType) {
  const findings = [];
  for (const line of hunk.lines) {
    if (line.type !== "added") continue;
    const content = line.content;
    for (const { pattern, sink, confidence } of XSS_SINK_PATTERNS) {
      if (pattern.test(content)) {
        const hasUserInput = containsUserInput2(content);
        findings.push({
          id: `xss-${filePath.split("/").pop()}-${line.newLineNumber ?? 0}`,
          severity: hasUserInput ? "high" : "medium",
          category: "security",
          title: `XSS sink introduced: ${sink}`,
          explanation: hasUserInput ? `A potential XSS sink (${sink}) was detected with user input flowing into it. This can enable cross-site scripting attacks. Ensure proper sanitization/encoding.` : `An XSS sink (${sink}) was detected. Verify that any user input is properly sanitized before being passed here.`,
          file: filePath,
          line: line.newLineNumber,
          diffLines: hunk.lines.filter((l) => l.type === "added").map((l) => ({
            lineNum: l.newLineNumber ?? 0,
            content: l.content,
            type: l.type
          })),
          introducedBy: changeType,
          pattern: String(pattern),
          confidence: hasUserInput ? 90 : confidence
        });
        break;
      }
    }
    for (const pattern of JQUERY_XSS_PATTERNS) {
      if (pattern.test(content) && containsUserInput2(content)) {
        findings.push({
          id: `xss-jquery-${filePath.split("/").pop()}-${line.newLineNumber ?? 0}`,
          severity: "high",
          category: "security",
          title: "Potential jQuery XSS sink with user input",
          explanation: `jQuery method (.html(), .append(), etc.) detected with user input. This can enable XSS if user input is not sanitized.`,
          file: filePath,
          line: line.newLineNumber,
          diffLines: hunk.lines.filter((l) => l.type === "added").map((l) => ({
            lineNum: l.newLineNumber ?? 0,
            content: l.content,
            type: l.type
          })),
          introducedBy: changeType,
          pattern: String(pattern),
          confidence: 80
        });
        break;
      }
    }
    const doubleBraceRe = /\{\{([^}]+)\}\}/g;
    let match;
    while ((match = doubleBraceRe.exec(content)) !== null) {
      const inner = match[1];
      if (USER_INPUT_PATTERNS.some((p) => p.test(inner))) {
        findings.push({
          id: `xss-template-${filePath.split("/").pop()}-${line.newLineNumber ?? 0}`,
          severity: "high",
          category: "security",
          title: "Potential template injection with user input",
          explanation: `A template binding ({{...}}) appears to include user input directly without escaping. This can enable XSS.`,
          file: filePath,
          line: line.newLineNumber,
          diffLines: hunk.lines.filter((l) => l.type === "added").map((l) => ({
            lineNum: l.newLineNumber ?? 0,
            content: l.content,
            type: l.type
          })),
          introducedBy: changeType,
          pattern: match[0],
          confidence: 80
        });
      }
    }
  }
  return findings;
}
var XssAnalyzer = {
  id: "xss",
  name: "XSS Analyzer",
  async run(ctx) {
    const findings = [];
    for (const file of ctx.diffResult.files) {
      if (shouldSkipPath6(file.path)) continue;
      if (file.binary) continue;
      const changeType = file.changeType;
      const fileHunks = ctx.diffResult.hunks.filter((h) => h.filePath === file.path);
      for (const hunk of fileHunks) {
        const hunkFindings = detectXss(hunk, file.path, changeType);
        findings.push(...hunkFindings);
      }
    }
    return { findings };
  }
};

// src/security/UnsafeExecutionAnalyzer.ts
var SKIP_PATHS7 = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".output",
  ".cache",
  "__pycache__",
  "vendor",
  "vendored"
];
var UNSAFE_EXEC_PATTERNS = [
  /\beval\s*\(/i,
  /\bnew\s+Function\s*\(/i,
  /\bexec\s*\(/i,
  /\bexecSync\s*\(/i,
  /\bspawn\s*\(/i,
  /\bspawnSync\s*\(/i,
  /\bexecFile\s*\(/i,
  /\bexecFileSync\s*\(/i,
  /\bchild_process\b/i,
  /import\s*\(\s*['"]child_process['"]\s*\)/i,
  /require\s*\(\s*['"]child_process['"]\s*\)/i,
  /\bprocess\.binding\s*\(/i,
  /\bprocess\.dlopen\s*\(/i
];
var USER_INPUT_SOURCES2 = [
  /\breq\.(params|query|body|headers)/i,
  /\brequest\.(params|query|body|headers)/i,
  /\bctx\.request\./i,
  /\bevent\.path\b/i,
  /\bevent\.query\b/i,
  /\bevent\.body\b/i,
  /\bparams\./i,
  /\bquery\./i,
  /\bbody\./i
];
function shouldSkipPath7(filePath) {
  const lower = filePath.toLowerCase();
  return SKIP_PATHS7.some((skip) => lower.includes(skip));
}
function containsUserInput3(content) {
  return USER_INPUT_SOURCES2.some((p) => p.test(content));
}
function detectUnsafeExecution(hunk, filePath, changeType) {
  const findings = [];
  for (const line of hunk.lines) {
    if (line.type !== "added") continue;
    const content = line.content;
    for (const pattern of UNSAFE_EXEC_PATTERNS) {
      if (pattern.test(content)) {
        const hasUserInput = containsUserInput3(content);
        findings.push({
          id: `unsafe-exec-${filePath.split("/").pop()}-${line.newLineNumber ?? 0}`,
          severity: hasUserInput ? "critical" : "high",
          category: "security",
          title: "Unsafe code execution detected",
          explanation: hasUserInput ? `An unsafe execution pattern (${pattern.source}) was detected with user input flowing into it. This is a critical code execution vulnerability. User input must never reach these sinks.` : `An unsafe execution pattern (${pattern.source}) was detected. This can be dangerous if user input reaches it. Ensure proper input validation.`,
          file: filePath,
          line: line.newLineNumber,
          diffLines: hunk.lines.filter((l) => l.type === "added").map((l) => ({
            lineNum: l.newLineNumber ?? 0,
            content: l.content,
            type: l.type
          })),
          introducedBy: changeType,
          pattern: pattern.source,
          confidence: hasUserInput ? 95 : 85
        });
        break;
      }
    }
  }
  return findings;
}
var UnsafeExecutionAnalyzer = {
  id: "unsafe-execution",
  name: "Unsafe Execution Analyzer",
  async run(ctx) {
    const findings = [];
    for (const file of ctx.diffResult.files) {
      if (shouldSkipPath7(file.path)) continue;
      if (file.binary) continue;
      const changeType = file.changeType;
      const fileHunks = ctx.diffResult.hunks.filter((h) => h.filePath === file.path);
      for (const hunk of fileHunks) {
        const hunkFindings = detectUnsafeExecution(hunk, file.path, changeType);
        findings.push(...hunkFindings);
      }
    }
    return { findings };
  }
};

// src/security/UnsafeMcpToolAnalyzer.ts
var SKIP_PATHS8 = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".output",
  ".cache",
  "__pycache__",
  "vendor",
  "vendored"
];
var MCP_FILE_PATTERNS = [
  /mcp/i,
  /tool.*definition/i,
  /server.*config/i
];
var UNSAFE_MCP_PATTERNS = [
  {
    pattern: /dangerouslyAllow\s*\(\s*(?:Shell|Filesystem|Write|Read)/i,
    sink: "dangerouslyAllow(Shell/Filesystem/Write/Read)",
    severity: "critical",
    confidence: 95
  },
  {
    pattern: /dangerouslyAllowFs\b/i,
    sink: "dangerouslyAllowFs",
    severity: "critical",
    confidence: 95
  },
  {
    pattern: /dangerouslyAllowShell\b/i,
    sink: "dangerouslyAllowShell",
    severity: "critical",
    confidence: 95
  },
  {
    pattern: /dangerouslyAllowExec\b/i,
    sink: "dangerouslyAllowExec",
    severity: "critical",
    confidence: 95
  },
  {
    pattern: /file:\/\//i,
    sink: "file:// protocol handler",
    severity: "high",
    confidence: 80
  },
  {
    pattern: /fs:\s*\{\s*read:\s*\[\s*['"]\/['"]\s*\]/i,
    sink: 'fs: { read: ["/"] }',
    severity: "critical",
    confidence: 95
  },
  {
    pattern: /fs:\s*\{\s*write:\s*\[\s*['"]\/['"]\s*\]/i,
    sink: 'fs: { write: ["/"] }',
    severity: "critical",
    confidence: 95
  },
  {
    pattern: /fs:\s*['"]\*['"]/i,
    sink: "fs: '*' (wildcard)",
    severity: "critical",
    confidence: 95
  },
  {
    pattern: /\bshell:\s*true\b/i,
    sink: "shell: true",
    severity: "critical",
    confidence: 90
  },
  {
    pattern: /\bexec:\s*true\b/i,
    sink: "exec: true",
    severity: "critical",
    confidence: 90
  },
  {
    pattern: /\bsubprocess:\s*true\b/i,
    sink: "subprocess: true",
    severity: "critical",
    confidence: 90
  }
];
function shouldSkipPath8(filePath) {
  const lower = filePath.toLowerCase();
  return SKIP_PATHS8.some((skip) => lower.includes(skip));
}
function isMcpRelatedFile(filePath) {
  return MCP_FILE_PATTERNS.some((p) => p.test(filePath));
}
function detectUnsafeMcpTool(hunk, filePath, changeType) {
  const findings = [];
  if (!isMcpRelatedFile(filePath)) return findings;
  for (const line of hunk.lines) {
    if (line.type !== "added") continue;
    const content = line.content;
    for (const { pattern, sink, severity, confidence } of UNSAFE_MCP_PATTERNS) {
      if (pattern.test(content)) {
        findings.push({
          id: `unsafe-mcp-${filePath.split("/").pop()}-${line.newLineNumber ?? 0}`,
          severity,
          category: "security",
          title: `Unsafe MCP tool access: ${sink}`,
          explanation: `An unsafe MCP tool configuration was detected (${sink}). This may allow privileged access to filesystem or shell operations. Review and restrict to least-privilege principles.`,
          file: filePath,
          line: line.newLineNumber,
          diffLines: hunk.lines.filter((l) => l.type === "added").map((l) => ({
            lineNum: l.newLineNumber ?? 0,
            content: l.content,
            type: l.type
          })),
          introducedBy: changeType,
          pattern: String(pattern),
          confidence
        });
        break;
      }
    }
  }
  return findings;
}
var UnsafeMcpToolAnalyzer = {
  id: "unsafe-mcp-tool",
  name: "Unsafe MCP Tool Analyzer",
  async run(ctx) {
    const findings = [];
    for (const file of ctx.diffResult.files) {
      if (shouldSkipPath8(file.path)) continue;
      if (file.binary) continue;
      const changeType = file.changeType;
      const fileHunks = ctx.diffResult.hunks.filter((h) => h.filePath === file.path);
      for (const hunk of fileHunks) {
        const hunkFindings = detectUnsafeMcpTool(hunk, file.path, changeType);
        findings.push(...hunkFindings);
      }
    }
    return { findings };
  }
};

// src/security/HunkSecurityAnalyzer.ts
var ALL_ANALYZERS = [
  HardcodedSecretAnalyzer,
  AuthGuardAnalyzer,
  AdminRouteAnalyzer,
  CorsAnalyzer,
  SqlInjectionAnalyzer,
  XssAnalyzer,
  UnsafeExecutionAnalyzer,
  UnsafeMcpToolAnalyzer
];
var DiffScopedSecurityAnalyzers = class {
  analyzers;
  constructor(analyzers = ALL_ANALYZERS) {
    this.analyzers = analyzers;
  }
  /**
   * Run all analyzers in parallel and merge/deduplicate findings.
   */
  async run(ctx) {
    const results = await Promise.all(this.analyzers.map((a) => a.run(ctx)));
    const allFindings = results.flatMap((r) => r.findings);
    const seen = /* @__PURE__ */ new Set();
    const unique = [];
    for (const f of allFindings) {
      if (!seen.has(f.id)) {
        seen.add(f.id);
        unique.push(f);
      }
    }
    return { findings: unique };
  }
};

// src/correctness/ApiContractAnalyzer.ts
var API_ROUTE_PATTERNS2 = [
  /\/api\//,
  /handler\.ts$/,
  /route\.ts$/,
  /endpoint\.ts$/
];
var CLIENT_PATTERNS = [
  /\/client\//,
  /\/services\//,
  /\/hooks\//,
  /\/api[-_]?client\//,
  /\/fetch\//
];
function isApiRouteFile(path) {
  const lower = path.toLowerCase();
  return API_ROUTE_PATTERNS2.some((p) => p.test(lower));
}
function isClientFile(path) {
  const lower = path.toLowerCase();
  return CLIENT_PATTERNS.some((p) => p.test(lower));
}
function extractApiPath(filePath) {
  const match = filePath.match(/\/api\/([^/]+)/);
  if (match) {
    return `/api/${match[1]}`;
  }
  return null;
}
function hasBreakingChange(hunkLines) {
  const methodChangePattern = /\b(GET|POST|PUT|PATCH|DELETE)\s*(?:→|->|=>)\s*(GET|POST|PUT|PATCH|DELETE)/i;
  const requiredParamPattern = /param\??:\s*\w+/;
  for (const line of hunkLines) {
    if (methodChangePattern.test(line)) return true;
  }
  return false;
}
function generateId2(analyzerId, filePath, idx) {
  const base = filePath.split("/").pop() ?? filePath;
  return `${analyzerId}-${base}-${idx}`;
}
var ApiContractAnalyzer = {
  id: "api-contract",
  name: "API Contract Analyzer",
  async run(ctx) {
    const findings = [];
    const apiRouteFiles = ctx.diffResult.files.filter(
      (f) => !f.binary && isApiRouteFile(f.path)
    );
    if (apiRouteFiles.length === 0) {
      return { findings };
    }
    for (const apiFile of apiRouteFiles) {
      const apiPath = extractApiPath(apiFile.path);
      if (!apiPath) continue;
      const changeType = apiFile.changeType;
      const fileHunks = ctx.diffResult.hunks.filter((h) => h.filePath === apiFile.path);
      const addedLines = fileHunks.flatMap(
        (h) => h.lines.filter((l) => l.type === "added").map((l) => l.content)
      );
      const isBreaking = hasBreakingChange(addedLines);
      const clientFilesChanged = ctx.diffResult.files.some(
        (f) => !f.binary && isClientFile(f.path)
      );
      const apiReferencedInDiff = ctx.diffResult.files.some((f) => {
        if (f.path === apiFile.path) return false;
        if (f.binary) return false;
        const hunks = ctx.diffResult.hunks.filter((h) => h.filePath === f.path);
        return hunks.some(
          (h) => h.lines.some((l) => l.content.includes(apiPath))
        );
      });
      if (!apiReferencedInDiff && !clientFilesChanged) {
        findings.push({
          id: generateId2("api-contract", apiFile.path, 1),
          severity: isBreaking ? "high" : "medium",
          category: "correctness",
          title: isBreaking ? `Breaking API change detected without client updates` : `API route changed without corresponding client updates`,
          explanation: `The API route "${apiPath}" was ${changeType} but no client-side callers (in client/, services/, or hooks/) appear to have been updated. Ensure the API contract is still satisfied by existing callers, or update them accordingly.`,
          file: apiFile.path,
          introducedBy: changeType,
          pattern: `api-route:${apiPath}`,
          confidence: isBreaking ? 90 : 75
        });
      }
    }
    return { findings };
  }
};

// src/correctness/FunctionSignatureAnalyzer.ts
var SKIP_PATHS9 = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".output",
  ".cache",
  "__pycache__",
  "vendor",
  "vendored",
  "test",
  "tests",
  "__tests__",
  ".test.",
  ".spec.",
  "spec/",
  "__spec__"
];
function shouldSkipPath9(filePath) {
  const lower = filePath.toLowerCase();
  return SKIP_PATHS9.some((skip) => lower.includes(skip));
}
function isTestFile(path) {
  const lower = path.toLowerCase();
  return lower.includes(".test.") || lower.includes(".spec.") || lower.includes("/test/") || lower.includes("/tests/") || lower.includes("/__tests__/") || lower.includes("/__spec__/");
}
function extractFunctionSignatures(hunkLines) {
  const signatures = [];
  const exportFuncPattern = /^export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*(\w+))?/;
  const exportConstPattern = /^export\s+(?:async\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*(?::\s*\w+)?\s*=>\s*{/;
  const methodPattern = /^\s*(?:async\s+)?(\w+)\s*\([^)]*\)(?:\s*:\s*\w+)?\s*{/;
  for (let i = 0; i < hunkLines.length; i++) {
    const line = hunkLines[i];
    let match = line.match(exportFuncPattern);
    if (match) {
      const params = match[2] ? match[2].split(",").map((p) => p.trim().split(/[:=]/)[0].trim()).filter(Boolean) : [];
      signatures.push({
        name: match[1],
        params,
        returnType: match[3]
      });
      continue;
    }
    match = line.match(exportConstPattern);
    if (match) {
      signatures.push({
        name: match[1],
        params: []
      });
      continue;
    }
    if (line.includes("class ") || i > 0 && hunkLines[i - 1].includes("class ")) {
      const methodMatch = line.match(methodPattern);
      if (methodMatch && methodMatch[1][0] !== methodMatch[1][0].toUpperCase()) {
        signatures.push({
          name: methodMatch[1],
          params: []
        });
      }
    }
  }
  return signatures;
}
function checkSignatureChange(oldSignatures, newSignatures) {
  const changes = /* @__PURE__ */ new Map();
  const oldMap = new Map(oldSignatures.map((s) => [s.name, s]));
  const newMap = new Map(newSignatures.map((s) => [s.name, s]));
  for (const [name, oldSig] of oldMap) {
    const newSig = newMap.get(name);
    if (!newSig) {
      changes.set(name, { type: "removed", oldSig });
    } else if (oldSig.params.length !== newSig.params.length || oldSig.returnType !== newSig.returnType) {
      changes.set(name, { type: "changed", oldSig, newSig });
    }
  }
  for (const [name, newSig] of newMap) {
    if (!oldMap.has(name)) {
      changes.set(name, { type: "added", newSig });
    }
  }
  return changes;
}
function isExportedFunctionCalled(functionName, content) {
  const callPattern = new RegExp(`\\b${functionName}\\s*\\(`, "g");
  return callPattern.test(content);
}
function generateId3(analyzerId, filePath, idx) {
  const base = filePath.split("/").pop() ?? filePath;
  return `${analyzerId}-${base}-${idx}`;
}
var FunctionSignatureAnalyzer = {
  id: "function-signature",
  name: "Function Signature Analyzer",
  async run(ctx) {
    const findings = [];
    for (const file of ctx.diffResult.files) {
      if (shouldSkipPath9(file.path)) continue;
      if (file.binary) continue;
      if (isTestFile(file.path)) continue;
      const changeType = file.changeType;
      const fileHunks = ctx.diffResult.hunks.filter((h) => h.filePath === file.path);
      const oldLines = [];
      const newLines = [];
      for (const hunk of fileHunks) {
        for (const line of hunk.lines) {
          if (line.type === "deleted") {
            oldLines.push(line.content);
          } else if (line.type === "added") {
            newLines.push(line.content);
          }
        }
      }
      const oldSignatures = extractFunctionSignatures(oldLines);
      const newSignatures = extractFunctionSignatures(newLines);
      if (oldSignatures.length === 0 && newSignatures.length === 0) continue;
      const changes = checkSignatureChange(oldSignatures, newSignatures);
      if (changes.size === 0) continue;
      const allChangedContent = ctx.diffResult.files.filter((f) => f.path !== file.path && !f.binary).flatMap((f) => {
        const hunks = ctx.diffResult.hunks.filter((h) => h.filePath === f.path);
        return hunks.flatMap((h) => h.lines.filter((l) => l.type === "added" || l.type === "context").map((l) => l.content));
      }).join(" ");
      for (const [funcName, change] of changes) {
        if (change.type === "added") continue;
        const callersUpdated = isExportedFunctionCalled(funcName, allChangedContent);
        if (!callersUpdated && change.type === "changed") {
          findings.push({
            id: generateId3("function-signature", file.path, funcName.length + changes.size),
            severity: "high",
            category: "correctness",
            title: `Function signature changed without caller updates`,
            explanation: `The exported function "${funcName}" signature changed but no callers appear to have been updated in the diff. Parameters may have changed - verify all call sites are compatible.`,
            file: file.path,
            introducedBy: changeType,
            pattern: `function:${funcName}`,
            confidence: 85
          });
        }
      }
    }
    return { findings };
  }
};

// src/correctness/SchemaMigrationAnalyzer.ts
var SCHEMA_PATTERNS = [
  /schema/,
  /model/,
  /migration/,
  /seeds?/,
  /prisma/,
  /drizzle/,
  /knex/,
  /typeorm/,
  /sequelize/
];
var MIGRATION_DIRS = [
  "migrations",
  "prisma/migrations",
  "db/migrations",
  "database/migrations",
  "drizzle/migrations",
  "knex/migrations"
];
var SCHEMA_CHANGE_PATTERNS = [
  /CREATE\s+TABLE/i,
  /ALTER\s+TABLE/i,
  /ADD\s+COLUMN/i,
  /DROP\s+COLUMN/i,
  /schema\.prisma/i,
  /migration\.ts$/
];
function isSchemaFile(path) {
  const lower = path.toLowerCase();
  return SCHEMA_PATTERNS.some((p) => p.test(lower));
}
function isMigrationFile(path) {
  const lower = path.toLowerCase();
  return MIGRATION_DIRS.some((dir) => lower.includes(dir)) || /_migration\.ts$/.test(lower) || /_schema\.ts$/.test(lower);
}
function hasSchemaChanges(lines) {
  return lines.some((line) => SCHEMA_CHANGE_PATTERNS.some((p) => p.test(line)));
}
function extractSchemaTableNames(hunkLines) {
  const tables = [];
  for (const line of hunkLines) {
    const createMatch = line.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?/i);
    if (createMatch) {
      tables.push(createMatch[1]);
    }
    const modelMatch = line.match(/model\s+[`"']?(\w+)[`"']?\s*{/i);
    if (modelMatch) {
      tables.push(modelMatch[1]);
    }
  }
  return tables;
}
function generateId4(analyzerId, filePath, idx) {
  const base = filePath.split("/").pop() ?? filePath;
  return `${analyzerId}-${base}-${idx}`;
}
var SchemaMigrationAnalyzer = {
  id: "schema-migration",
  name: "Schema Migration Analyzer",
  async run(ctx) {
    const findings = [];
    const schemaFiles = ctx.diffResult.files.filter(
      (f) => !f.binary && isSchemaFile(f.path)
    );
    if (schemaFiles.length === 0) {
      return { findings };
    }
    const migrationFilesChanged = ctx.diffResult.files.some(
      (f) => !f.binary && isMigrationFile(f.path)
    );
    for (const schemaFile of schemaFiles) {
      if (isMigrationFile(schemaFile.path)) continue;
      const changeType = schemaFile.changeType;
      const fileHunks = ctx.diffResult.hunks.filter((h) => h.filePath === schemaFile.path);
      const addedLines = fileHunks.flatMap(
        (h) => h.lines.filter((l) => l.type === "added").map((l) => l.content)
      );
      if (!hasSchemaChanges(addedLines)) continue;
      const tableNames = extractSchemaTableNames(addedLines);
      if (!migrationFilesChanged) {
        findings.push({
          id: generateId4("schema-migration", schemaFile.path, tableNames.length),
          severity: "medium",
          category: "correctness",
          title: `Schema change detected without migration file update`,
          explanation: tableNames.length > 0 ? `Schema changes to table(s) "${tableNames.join(", ")}" were detected but no corresponding migration file was updated. Please ensure a migration is created to apply these changes.` : `Schema/model changes were detected but no corresponding migration file was updated. Please ensure a migration is created to apply these changes.`,
          file: schemaFile.path,
          introducedBy: changeType,
          pattern: "schema-change",
          confidence: 80
        });
      }
    }
    return { findings };
  }
};

// src/correctness/EnvConfigAnalyzer.ts
var ENV_FILE_PATTERNS = [
  /\.env/,
  /environment\.ts$/,
  /config\.ts$/,
  /constants\.ts$/,
  /config$/
];
var ENV_VAR_PATTERN = /process\.env\.(\w+)/g;
function isEnvFile(path) {
  const lower = path.toLowerCase();
  return ENV_FILE_PATTERNS.some((p) => p.test(lower));
}
function isEnvExampleFile(path) {
  const lower = path.toLowerCase();
  return lower.includes(".env.example") || lower.includes(".env.local") || lower.includes(".env.development");
}
function extractEnvVars(lines) {
  const vars = [];
  const seen = /* @__PURE__ */ new Set();
  for (const line of lines) {
    if (/^\s*#/.test(line) || /^\s*$/.test(line)) continue;
    let match;
    const re = new RegExp(ENV_VAR_PATTERN.source, "g");
    while ((match = re.exec(line)) !== null) {
      const varName = match[1];
      if (seen.has(varName)) continue;
      seen.add(varName);
      const isRequired = !/\|\||\?\?/.test(line.slice(match.index, match.index + 50));
      vars.push({ name: varName, isRequired });
    }
  }
  return vars;
}
function generateId5(analyzerId, filePath, idx) {
  const base = filePath.split("/").pop() ?? filePath;
  return `${analyzerId}-${base}-${idx}`;
}
var EnvConfigAnalyzer = {
  id: "env-config",
  name: "Environment Config Analyzer",
  async run(ctx) {
    const findings = [];
    const envFiles = ctx.diffResult.files.filter(
      (f) => !f.binary && isEnvFile(f.path)
    );
    if (envFiles.length === 0) {
      return { findings };
    }
    const envExampleChanged = ctx.diffResult.files.some(
      (f) => !f.binary && isEnvExampleFile(f.path)
    );
    for (const envFile of envFiles) {
      if (isEnvExampleFile(envFile.path)) continue;
      const changeType = envFile.changeType;
      const fileHunks = ctx.diffResult.hunks.filter((h) => h.filePath === envFile.path);
      const addedLines = fileHunks.flatMap(
        (h) => h.lines.filter((l) => l.type === "added").map((l) => l.content)
      );
      if (addedLines.length === 0) continue;
      const envVars = extractEnvVars(addedLines);
      const requiredVars = envVars.filter((v) => v.isRequired);
      if (requiredVars.length > 0 && !envExampleChanged) {
        findings.push({
          id: generateId5("env-config", envFile.path, requiredVars.length),
          severity: "medium",
          category: "correctness",
          title: `New required env var(s) added without .env.example update`,
          explanation: `The following required environment variables were added: ${requiredVars.map((v) => v.name).join(", ")}. Please update .env.example to document these.`,
          file: envFile.path,
          introducedBy: changeType,
          pattern: `env-var:${requiredVars.map((v) => v.name).join(",")}`,
          confidence: 80
        });
      }
    }
    return { findings };
  }
};

// src/correctness/DependencyAnalyzer.ts
var LOCKFILES = [
  "pnpm-lock.yaml",
  "yarn.lock",
  "package-lock.json",
  "bun.lockb",
  "bun.lock"
];
function isRootPackageJson(path) {
  const parts = path.split("/");
  if (parts.includes("packages")) return false;
  return path.endsWith("package.json");
}
function isLockfile(path) {
  const fileName = path.split("/").pop() ?? "";
  return LOCKFILES.includes(fileName);
}
function generateId6(analyzerId, filePath, idx) {
  const base = filePath.split("/").pop() ?? filePath;
  return `${analyzerId}-${base}-${idx}`;
}
var DependencyAnalyzer = {
  id: "dependency",
  name: "Dependency Analyzer",
  async run(ctx) {
    const findings = [];
    const packageJsonChanged = ctx.diffResult.files.find(
      (f) => !f.binary && isRootPackageJson(f.path)
    );
    if (!packageJsonChanged) {
      return { findings };
    }
    const changeType = packageJsonChanged.changeType;
    const lockfileChanged = ctx.diffResult.files.some(
      (f) => !f.binary && isLockfile(f.path)
    );
    if (!lockfileChanged) {
      findings.push({
        id: generateId6("dependency", "package.json", 1),
        severity: "medium",
        category: "correctness",
        title: `package.json changed without lockfile update`,
        explanation: `The root package.json was ${changeType} but no lockfile (pnpm-lock.yaml, yarn.lock, or package-lock.json) was updated. Run the appropriate package manager install command to update the lockfile.`,
        file: packageJsonChanged.path,
        introducedBy: changeType,
        pattern: "dependency-change",
        confidence: 90
      });
    }
    return { findings };
  }
};

// src/correctness/RouteUiEvidenceAnalyzer.ts
var ROUTE_DIRS = [
  "app/",
  // Next.js App Router
  "pages/"
  // Next.js Pages Router, Nuxt
];
var TEST_PATTERNS = [
  /\.test\./,
  /\.spec\./,
  /\.e2e\./,
  /__screenshots__/
];
function isRouteFile(path) {
  const lower = path.toLowerCase();
  if (!ROUTE_DIRS.some((dir) => lower.includes(dir))) return false;
  if (TEST_PATTERNS.some((p) => p.test(lower))) return false;
  const skipDirs = ["node_modules", ".git", "dist", "build", "coverage", ".next", ".nuxt"];
  if (skipDirs.some((dir) => lower.includes(dir))) return false;
  return true;
}
function isTestEvidenceFile(path) {
  const lower = path.toLowerCase();
  return TEST_PATTERNS.some((p) => p.test(lower));
}
function getRouteName(filePath) {
  const appMatch = filePath.match(/app\/(.+?)[\/.]/);
  if (appMatch) return appMatch[1];
  const pagesMatch = filePath.match(/pages\/(.+?)[\/.]/);
  if (pagesMatch) return pagesMatch[1];
  return null;
}
function generateId7(analyzerId, filePath, idx) {
  const base = filePath.split("/").pop() ?? filePath;
  return `${analyzerId}-${base}-${idx}`;
}
var RouteUiEvidenceAnalyzer = {
  id: "route-ui-evidence",
  name: "Route UI Evidence Analyzer",
  async run(ctx) {
    const findings = [];
    const routeFiles = ctx.diffResult.files.filter(
      (f) => !f.binary && isRouteFile(f.path)
    );
    if (routeFiles.length === 0) {
      return { findings };
    }
    const testEvidenceChanged = ctx.diffResult.files.some(
      (f) => !f.binary && isTestEvidenceFile(f.path)
    );
    for (const routeFile of routeFiles) {
      const changeType = routeFile.changeType;
      const routeName = getRouteName(routeFile.path);
      if (!testEvidenceChanged) {
        findings.push({
          id: generateId7("route-ui-evidence", routeFile.path, 1),
          severity: "low",
          category: "correctness",
          title: `Route changed without UI test evidence`,
          explanation: routeName ? `The route "${routeName}" was ${changeType} but no test file or screenshot evidence exists. Consider adding a test to verify UI behavior.` : `Route file was ${changeType} but no test file or screenshot evidence exists. Consider adding a test to verify UI behavior.`,
          file: routeFile.path,
          introducedBy: changeType,
          pattern: "route-change",
          confidence: 60
        });
      }
    }
    return { findings };
  }
};

// src/correctness/ChangedSurfaceAnalyzer.ts
var CORRECTNESS_ANALYZERS = [
  ApiContractAnalyzer,
  FunctionSignatureAnalyzer,
  SchemaMigrationAnalyzer,
  EnvConfigAnalyzer,
  DependencyAnalyzer,
  RouteUiEvidenceAnalyzer
];
var ChangedSurfaceAnalyzer = class {
  id = "changed-surface";
  name = "Changed Surface Analyzer";
  /**
   * Run all correctness analyzers in parallel
   */
  async run(ctx) {
    const results = await Promise.all(
      CORRECTNESS_ANALYZERS.map(
        (analyzer) => analyzer.run(ctx).catch((err) => {
          console.error(`Error in ${analyzer.name}:`, err);
          return { findings: [] };
        })
      )
    );
    const allFindings = [];
    const seen = /* @__PURE__ */ new Set();
    for (const result of results) {
      for (const finding of result.findings) {
        if (!seen.has(finding.id)) {
          seen.add(finding.id);
          allFindings.push(finding);
        }
      }
    }
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    allFindings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
    return { findings: allFindings };
  }
};
var ChangedSurfaceAnalyzerInstance = new ChangedSurfaceAnalyzer();

// src/test-coverage/MissingTestDetector.ts
var SOURCE_DIRS = ["src/", "lib/", "app/"];
var TEST_DIRS = ["test/", "tests/", "__tests__/", "__spec__/"];
var SKIP_EXTENSIONS = [".d.ts", ".types.ts", ".type.ts"];
var SKIP_PATHS10 = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".output",
  ".cache",
  "__pycache__",
  "vendor",
  "vendored"
];
function shouldSkipFile(path) {
  const lower = path.toLowerCase();
  if (SKIP_EXTENSIONS.some((ext) => lower.endsWith(ext))) return true;
  if (SKIP_PATHS10.some((skip) => lower.includes(skip))) return true;
  return false;
}
function isTestFile2(path) {
  const lower = path.toLowerCase();
  return TEST_DIRS.some((dir) => lower.includes(dir)) || /\.test\./.test(lower) || /\.spec\./.test(lower);
}
function getBasename(path) {
  return path.split("/").pop() ?? path;
}
function generateId8(analyzerId, filePath, idx) {
  const base = getBasename(filePath);
  return `${analyzerId}-${base}-${idx}`;
}
var MissingTestDetector = {
  id: "missing-test",
  name: "Missing Test Detector",
  async run(ctx) {
    const findings = [];
    const sourceFiles = ctx.diffResult.files.filter(
      (f) => !f.binary && !shouldSkipFile(f.path) && !isTestFile2(f.path) && SOURCE_DIRS.some((dir) => f.path.includes(dir))
    );
    if (sourceFiles.length > 0 && sourceFiles.length < 3) {
      const allInfra = sourceFiles.every((f) => {
        const path = f.path.toLowerCase();
        return path.includes("config") || path.includes("constants") || path.includes(".env") || path.includes("types") || path.includes("index");
      });
      if (allInfra) {
        return { findings };
      }
    }
    const changedTestFiles = new Set(
      ctx.diffResult.files.filter((f) => !f.binary && isTestFile2(f.path)).map((f) => {
        const basename = getBasename(f.path);
        return basename.replace(/\.(test|spec)\.[^.]+$/, "").replace(/\.(test|spec)$/, "");
      })
    );
    for (const sourceFile of sourceFiles) {
      const sourceBasename = getBasename(sourceFile.path).replace(/\.[^.]+$/, "");
      const hasTest = changedTestFiles.has(sourceBasename);
      if (!hasTest) {
        const path = sourceFile.path.toLowerCase();
        const isInfrastructure = path.includes("/types") || path.includes("/constants") || path.includes("/config") || path.includes("/index.ts") || path.includes(".d.ts");
        findings.push({
          id: generateId8("missing-test", sourceFile.path, 1),
          severity: isInfrastructure ? "low" : "medium",
          category: "test-coverage",
          title: isInfrastructure ? `Infrastructure file changed without corresponding test` : `Source file changed without corresponding test`,
          explanation: `The source file "${sourceFile.path}" was ${sourceFile.changeType} but no related test file was found or modified. Consider adding a test to verify this code's behavior.`,
          file: sourceFile.path,
          introducedBy: sourceFile.changeType,
          pattern: "missing-test",
          confidence: 75,
          coverageType: "missing-test"
        });
      }
    }
    return { findings };
  }
};

// src/test-coverage/TestDeletionAnalyzer.ts
var TEST_DIRS2 = ["test/", "tests/", "__tests__/", "__spec__/"];
function isTestFile3(path) {
  const lower = path.toLowerCase();
  return TEST_DIRS2.some((dir) => lower.includes(dir)) || /\.test\./.test(lower) || /\.spec\./.test(lower);
}
function generateId9(analyzerId, filePath, idx) {
  const base = filePath.split("/").pop() ?? filePath;
  return `${analyzerId}-${base}-${idx}`;
}
var TestDeletionAnalyzer = {
  id: "test-deletion",
  name: "Test Deletion Analyzer",
  async run(ctx) {
    const findings = [];
    const deletedTestFiles = ctx.diffResult.files.filter(
      (f) => !f.binary && f.changeType === "deleted" && isTestFile3(f.path)
    );
    for (const testFile of deletedTestFiles) {
      findings.push({
        id: generateId9("test-deletion", testFile.path, 1),
        severity: "high",
        category: "test-coverage",
        title: `Test file deleted`,
        explanation: `The test file "${testFile.path}" was deleted. Test coverage may be reduced. Ensure the deleted tests are no longer needed or their coverage is maintained.`,
        file: testFile.path,
        introducedBy: "deleted",
        pattern: "test-deleted",
        confidence: 95,
        coverageType: "deleted-test"
      });
    }
    return { findings };
  }
};

// src/test-coverage/NoAssertionTestAnalyzer.ts
var TEST_DIRS3 = ["test/", "tests/", "__tests__/", "__spec__/"];
var ASSERTION_PATTERNS = [
  /\bexpect\s*\(/,
  // Jest expect()
  /\bassert\s*\./,
  // Node assert
  /\bshould\s*\./,
  // Should.js
  /\btoBe\s*\(/,
  // Jasmine/Jest
  /\btoEqual\s*\(/,
  // Jest
  /\btoStrictEqual\s*\(/,
  // Jest
  /\btoThrow\s*\(/,
  // Jest
  /\.resolves\b/,
  // Jest
  /\.rejects\b/,
  // Jest
  /chai\.expect\s*\(/,
  // Chai
  /chai\.assert\s*\./,
  // Chai
  /should\.exist\s*\(/,
  // Should.js
  /expect\s*\(\s*page/,
  // Playwright
  /\bsupertest\b.*\.expect\s*\(/
  // Supertest
];
function isTestFile4(path) {
  const lower = path.toLowerCase();
  return TEST_DIRS3.some((dir) => lower.includes(dir)) || /\.test\./.test(lower) || /\.spec\./.test(lower);
}
function hasAnyAssertion(content) {
  const withoutComments = content.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  return ASSERTION_PATTERNS.some((pattern) => pattern.test(withoutComments));
}
function isOrganizationalBlock(line) {
  const orgPattern = /^\s*(describe|it|test|suite|context|before|after|beforeEach|afterEach)\s*\(\s*['"]/;
  return orgPattern.test(line);
}
function generateId10(analyzerId, filePath, idx) {
  const base = filePath.split("/").pop() ?? filePath;
  return `${analyzerId}-${base}-${idx}`;
}
var NoAssertionTestAnalyzer = {
  id: "no-assertion",
  name: "No Assertion Test Analyzer",
  async run(ctx) {
    const findings = [];
    const changedTestFiles = ctx.diffResult.files.filter(
      (f) => !f.binary && f.changeType !== "deleted" && isTestFile4(f.path)
    );
    for (const testFile of changedTestFiles) {
      const fileHunks = ctx.diffResult.hunks.filter((h) => h.filePath === testFile.path);
      const testLines = [];
      for (const hunk of fileHunks) {
        for (const line of hunk.lines) {
          if (line.type === "added" || line.type === "context") {
            const trimmed = line.content.trim();
            if (trimmed && !isOrganizationalBlock(trimmed)) {
              testLines.push(line.content);
            }
          }
        }
      }
      const content = testLines.join("\n");
      if (testLines.length < 3) continue;
      if (!hasAnyAssertion(content)) {
        findings.push({
          id: generateId10("no-assertion", testFile.path, 1),
          severity: "medium",
          category: "test-coverage",
          title: `Test file appears to have no assertions`,
          explanation: `The test file "${testFile.path}" was ${testFile.changeType} but no assertion patterns were detected. A test without assertions may not be validating anything.`,
          file: testFile.path,
          introducedBy: testFile.changeType,
          pattern: "no-assertion",
          confidence: 70,
          coverageType: "no-assertion"
        });
      }
    }
    return { findings };
  }
};

// src/test-coverage/CriticalFeatureCoverageAnalyzer.ts
var AUTH_PATTERNS = [
  /auth/i,
  /login/i,
  /signin/i,
  /signup/i,
  /password/i,
  /session/i,
  /token/i,
  /jwt/i,
  /oauth/i,
  /permission/i,
  /role/i,
  /access/i,
  /mfa/i,
  /2fa/i
];
var BILLING_PATTERNS = [
  /billing/i,
  /payment/i,
  /invoice/i,
  /subscription/i,
  /price/i,
  /plan/i,
  /checkout/i,
  /stripe/i,
  /charge/i,
  /subscription/i
];
var ADMIN_PATTERNS = [
  /admin/i,
  /dashboard/i,
  /manage/i,
  /user-management/i
];
var TEST_DIRS4 = ["test/", "tests/", "__tests__/", "__spec__/"];
function isCriticalFeature(path) {
  const lower = path.toLowerCase();
  for (const pattern of AUTH_PATTERNS) {
    if (pattern.test(lower)) return { type: "auth", matched: pattern.source };
  }
  for (const pattern of BILLING_PATTERNS) {
    if (pattern.test(lower)) return { type: "billing", matched: pattern.source };
  }
  for (const pattern of ADMIN_PATTERNS) {
    if (pattern.test(lower)) return { type: "admin", matched: pattern.source };
  }
  return null;
}
function isTestFile5(path) {
  const lower = path.toLowerCase();
  return TEST_DIRS4.some((dir) => lower.includes(dir)) || /\.test\./.test(lower) || /\.spec\./.test(lower);
}
function generateId11(analyzerId, filePath, idx) {
  const base = filePath.split("/").pop() ?? filePath;
  return `${analyzerId}-${base}-${idx}`;
}
var CriticalFeatureCoverageAnalyzer = {
  id: "critical-feature-coverage",
  name: "Critical Feature Coverage Analyzer",
  async run(ctx) {
    const findings = [];
    const criticalFiles = ctx.diffResult.files.filter(
      (f) => !f.binary && f.changeType !== "deleted" && isCriticalFeature(f.path) !== null
    );
    if (criticalFiles.length === 0) {
      return { findings };
    }
    const testFilesChanged = ctx.diffResult.files.some(
      (f) => !f.binary && f.changeType !== "deleted" && isTestFile5(f.path)
    );
    for (const criticalFile of criticalFiles) {
      const featureInfo = isCriticalFeature(criticalFile.path);
      if (!testFilesChanged) {
        findings.push({
          id: generateId11("critical-feature-coverage", criticalFile.path, 1),
          severity: "high",
          category: "test-coverage",
          title: `Critical ${featureInfo.type} feature changed without test coverage`,
          explanation: `The ${featureInfo.type} related file "${criticalFile.path}" was ${criticalFile.changeType} but no test file was modified. Given the critical nature of ${featureInfo.type} features, tests should be added or updated.`,
          file: criticalFile.path,
          introducedBy: criticalFile.changeType,
          pattern: `critical:${featureInfo.type}`,
          confidence: 85,
          coverageType: "critical-unchanged"
        });
      }
    }
    return { findings };
  }
};

// src/test-coverage/TestCoverageAnalyzer.ts
var TEST_COVERAGE_ANALYZERS = [
  MissingTestDetector,
  TestDeletionAnalyzer,
  NoAssertionTestAnalyzer,
  CriticalFeatureCoverageAnalyzer
];
var TestCoverageAnalyzer = class {
  id = "test-coverage";
  name = "Test Coverage Analyzer";
  /**
   * Run all test coverage analyzers in parallel
   */
  async run(ctx) {
    const results = await Promise.all(
      TEST_COVERAGE_ANALYZERS.map(
        (analyzer) => analyzer.run(ctx).catch((err) => {
          console.error(`Error in ${analyzer.name}:`, err);
          return { findings: [] };
        })
      )
    );
    const allFindings = [];
    const seen = /* @__PURE__ */ new Set();
    for (const result of results) {
      for (const finding of result.findings) {
        if (!seen.has(finding.id)) {
          seen.add(finding.id);
          allFindings.push(finding);
        }
      }
    }
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    allFindings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
    return { findings: allFindings };
  }
};
var TestCoverageAnalyzerInstance = new TestCoverageAnalyzer();
export {
  ApiContractAnalyzer,
  ChangedSurfaceAnalyzer,
  ChangedSurfaceAnalyzerInstance,
  CriticalFeatureCoverageAnalyzer,
  DependencyAnalyzer,
  DiffScopedSecurityAnalyzers,
  EnvConfigAnalyzer,
  FunctionSignatureAnalyzer,
  MissingTestDetector,
  NoAssertionTestAnalyzer,
  RouteUiEvidenceAnalyzer,
  SchemaMigrationAnalyzer,
  TestCoverageAnalyzer,
  TestCoverageAnalyzerInstance,
  TestDeletionAnalyzer
};
