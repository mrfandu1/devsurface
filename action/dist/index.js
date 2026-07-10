// src/action/runtime.ts
import { promises as fs5 } from "fs";
import path4 from "path";

// src/core/check/index.ts
import { promises as fs3 } from "fs";
import path3 from "path";

// src/core/config/load.ts
import { promises as fs } from "fs";
import path from "path";

// src/core/security/url.ts
function isSafeHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// src/core/config/defaults.ts
var CONFIG_FILE_NAME = "devsurface.config.json";

// src/core/config/load.ts
var MAX_CONFIGURED_PORTS = 32;
function isWithinRoot(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || !relative.startsWith("..") && !path.isAbsolute(relative);
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function toStringRecord(value, warnings, label) {
  if (value === void 0) {
    return void 0;
  }
  if (!isRecord(value)) {
    warnings.push(`${label} must be an object.`);
    return void 0;
  }
  const record = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string") {
      record[key] = raw;
    } else {
      warnings.push(`${label}.${key} must be a string.`);
    }
  }
  return record;
}
function toGroups(value, warnings) {
  if (value === void 0) {
    return void 0;
  }
  if (!isRecord(value)) {
    warnings.push("groups must be an object.");
    return void 0;
  }
  const groups = {};
  for (const [key, raw] of Object.entries(value)) {
    if (Array.isArray(raw) && raw.every((entry) => typeof entry === "string")) {
      groups[key] = raw;
    } else {
      warnings.push(`groups.${key} must be an array of command names.`);
    }
  }
  return groups;
}
var MAX_SETUP_GUIDE_STEPS = 24;
var MAX_SETUP_GUIDE_STEP_LENGTH = 200;
function toSetupGuide(value, warnings) {
  if (value === void 0) {
    return void 0;
  }
  if (!Array.isArray(value)) {
    warnings.push("setupGuide must be an array of strings or step objects.");
    return void 0;
  }
  const steps = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      const trimmed = entry.trim();
      if (trimmed.length > 0) {
        steps.push(trimmed.slice(0, MAX_SETUP_GUIDE_STEP_LENGTH));
      }
    } else if (isRecord(entry)) {
      if (typeof entry.title !== "string" || entry.title.trim().length === 0) {
        warnings.push("setupGuide step objects must have a non-empty title string.");
        continue;
      }
      const step = {
        title: entry.title.trim().slice(0, MAX_SETUP_GUIDE_STEP_LENGTH)
      };
      if (typeof entry.description === "string" && entry.description.trim().length > 0) {
        step.description = entry.description.trim().slice(0, MAX_SETUP_GUIDE_STEP_LENGTH);
      }
      if (typeof entry.command === "string" && entry.command.trim().length > 0) {
        step.command = entry.command.trim();
      }
      if (typeof entry.script === "string" && entry.script.trim().length > 0) {
        step.script = entry.script.trim();
      }
      steps.push(step);
    } else {
      warnings.push("setupGuide entries must be strings or step objects.");
    }
  }
  if (steps.length > MAX_SETUP_GUIDE_STEPS) {
    warnings.push(`setupGuide may contain at most ${MAX_SETUP_GUIDE_STEPS} steps.`);
  }
  return steps.slice(0, MAX_SETUP_GUIDE_STEPS);
}
function toPorts(value, warnings) {
  if (value === void 0) {
    return void 0;
  }
  if (!Array.isArray(value)) {
    warnings.push("ports must be an array of numbers.");
    return void 0;
  }
  const ports = value.filter(
    (port) => Number.isInteger(port) && port > 0 && port < 65536
  );
  if (ports.length !== value.length) {
    warnings.push("ports may only contain integers between 1 and 65535.");
  }
  if (ports.length > MAX_CONFIGURED_PORTS) {
    warnings.push(`ports may contain at most ${MAX_CONFIGURED_PORTS} entries.`);
  }
  return ports.slice(0, MAX_CONFIGURED_PORTS);
}
var KNOWN_CONFIG_KEYS = /* @__PURE__ */ new Set([
  "$schema",
  "name",
  "description",
  "commands",
  "groups",
  "ports",
  "env",
  "services",
  "setupGuide",
  "setup_guide",
  "docs",
  "launch"
]);
var MAX_LAUNCH_STEPS = 10;
function toLaunch(value, warnings) {
  if (value === void 0) {
    return void 0;
  }
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    warnings.push('launch must be an array of script/command names (or "docker").');
    return void 0;
  }
  const steps = value.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  if (steps.length > MAX_LAUNCH_STEPS) {
    warnings.push(`launch may contain at most ${MAX_LAUNCH_STEPS} steps.`);
  }
  return steps.slice(0, MAX_LAUNCH_STEPS);
}
function validateConfig(raw) {
  const warnings = [];
  if (!isRecord(raw)) {
    return { config: {}, warnings: ["devsurface.config.json must contain a JSON object."] };
  }
  for (const key of Object.keys(raw)) {
    if (!KNOWN_CONFIG_KEYS.has(key)) {
      warnings.push(`Unknown config key "${key}" is ignored.`);
    }
  }
  const env = isRecord(raw.env) ? {
    example: typeof raw.env.example === "string" ? raw.env.example : void 0,
    local: typeof raw.env.local === "string" ? raw.env.local : void 0
  } : void 0;
  if (raw.env !== void 0 && !isRecord(raw.env)) {
    warnings.push("env must be an object.");
  }
  const services = isRecord(raw.services) ? {
    docker: typeof raw.services.docker === "boolean" ? raw.services.docker : void 0
  } : void 0;
  if (raw.services !== void 0 && !isRecord(raw.services)) {
    warnings.push("services must be an object.");
  }
  let docs;
  if (typeof raw.docs === "string" && raw.docs.length > 0) {
    if (isSafeHttpUrl(raw.docs)) {
      docs = raw.docs;
    } else {
      warnings.push("docs must be an http or https URL.");
    }
  }
  return {
    config: {
      name: typeof raw.name === "string" ? raw.name : void 0,
      description: typeof raw.description === "string" ? raw.description : void 0,
      commands: toStringRecord(raw.commands, warnings, "commands"),
      groups: toGroups(raw.groups, warnings),
      ports: toPorts(raw.ports, warnings),
      env,
      services,
      setupGuide: toSetupGuide(raw.setupGuide ?? raw.setup_guide, warnings),
      docs,
      launch: toLaunch(raw.launch, warnings)
    },
    warnings
  };
}
async function loadConfig(root) {
  const configPath = path.join(root, CONFIG_FILE_NAME);
  try {
    const [realRoot, realConfigPath] = await Promise.all([
      fs.realpath(root),
      fs.realpath(configPath)
    ]);
    if (!isWithinRoot(realRoot, realConfigPath)) {
      return null;
    }
    const content = await fs.readFile(realConfigPath, "utf8");
    const parsed = JSON.parse(content);
    const { config, warnings } = validateConfig(parsed);
    return { path: realConfigPath, config, warnings };
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : void 0;
    if (code === "ENOENT") {
      return null;
    }
    if (error instanceof SyntaxError) {
      return {
        path: configPath,
        config: {},
        warnings: [`${CONFIG_FILE_NAME} contains invalid JSON.`]
      };
    }
    return null;
  }
}

// src/core/documentation.ts
function extractScriptReferences(content) {
  const references = /* @__PURE__ */ new Set();
  const commandRegexes = [
    /\bnpm\s+run\s+([A-Za-z0-9:_-]+)/g,
    /\bpnpm\s+run\s+([A-Za-z0-9:_-]+)/g,
    /\bbun\s+run\s+([A-Za-z0-9:_-]+)/g,
    /\byarn\s+run\s+([A-Za-z0-9:_-]+)/g,
    /\bnpm\s+(test|start|build)\b/g,
    /\bpnpm\s+(test|start|build)\b/g,
    /\byarn\s+(test|start|build)\b/g,
    /\bbun\s+(test|start|build)\b/g
  ];
  for (const regex of commandRegexes) {
    for (const match of content.matchAll(regex)) {
      references.add(match[1]);
    }
  }
  return Array.from(references);
}
function documentsEnvironmentSetup(content) {
  return /(?:\.env(?:\.example)?|environment\s+variables?)/i.test(content);
}
function undocumentedPorts(content, ports) {
  return ports.filter((port) => !new RegExp(`\\b${port}\\b`).test(content));
}

// src/core/scanner/ports.ts
import net from "net";
function uniquePorts(ports) {
  return Array.from(
    new Set(ports.filter((port) => Number.isInteger(port) && port > 0 && port < 65536))
  );
}
function inferPortsFromScripts(scripts) {
  const ports = [];
  for (const command of Object.values(scripts)) {
    const patterns = [
      /(?:--port|-p)\s+(\d{2,5})/g,
      /\bPORT=(\d{2,5})\b/g,
      /localhost:(\d{2,5})/g,
      /127\.0\.0\.1:(\d{2,5})/g
    ];
    for (const pattern of patterns) {
      for (const match of command.matchAll(pattern)) {
        ports.push(Number(match[1]));
      }
    }
  }
  return uniquePorts(ports);
}

// src/core/scanner/packageJson.ts
import { promises as fs2 } from "fs";
import path2 from "path";
function isWithinRoot2(root, target) {
  const relative = path2.relative(root, target);
  return relative === "" || !relative.startsWith("..") && !path2.isAbsolute(relative);
}
async function readPackageJson(root) {
  const packageJsonPath = path2.join(root, "package.json");
  try {
    const [realRoot, realPackageJsonPath] = await Promise.all([
      fs2.realpath(root),
      fs2.realpath(packageJsonPath)
    ]);
    if (!isWithinRoot2(realRoot, realPackageJsonPath)) {
      return null;
    }
    const content = await fs2.readFile(realPackageJsonPath, "utf8");
    const data = JSON.parse(content);
    return { path: realPackageJsonPath, data };
  } catch {
    return null;
  }
}

// src/core/scanner/scripts.ts
function extractScripts(packageJson) {
  if (!packageJson?.data.scripts || typeof packageJson.data.scripts !== "object" || Array.isArray(packageJson.data.scripts)) {
    return null;
  }
  return Object.fromEntries(
    Object.entries(packageJson.data.scripts).filter((entry) => {
      const [, command] = entry;
      return typeof command === "string";
    })
  );
}

// src/core/check/index.ts
function isWithinRoot3(root, target) {
  const relative = path3.relative(root, target);
  return relative === "" || !relative.startsWith("..") && !path3.isAbsolute(relative);
}
async function readFileInsideRoot(root, relativePath) {
  const candidate = path3.resolve(root, relativePath);
  if (!isWithinRoot3(root, candidate)) {
    return null;
  }
  try {
    const [realRoot, realCandidate] = await Promise.all([
      fs3.realpath(root),
      fs3.realpath(candidate)
    ]);
    if (!isWithinRoot3(realRoot, realCandidate)) {
      return null;
    }
    return await fs3.readFile(realCandidate, "utf8");
  } catch {
    return null;
  }
}
async function readFirstDocumentationFile(root, candidates) {
  for (const candidate of candidates) {
    const content = await readFileInsideRoot(root, candidate);
    if (content !== null) {
      return { path: candidate, content };
    }
  }
  return null;
}
async function fileExistsInsideRoot(root, relativePath) {
  return await readFileInsideRoot(root, relativePath) !== null;
}
function check(id, severity, title, message, target) {
  return { id, severity, title, message, target };
}
async function runRepositoryChecks(requestedRoot = process.cwd()) {
  const root = await fs3.realpath(path3.resolve(requestedRoot));
  const [packageJson, config, readme, contributing] = await Promise.all([
    readPackageJson(root),
    loadConfig(root),
    readFirstDocumentationFile(root, ["README.md", "README"]),
    readFirstDocumentationFile(root, ["CONTRIBUTING.md", "CONTRIBUTING"])
  ]);
  const checks = [];
  const scripts = extractScripts(packageJson) ?? {};
  const projectName = config?.config.name ?? packageJson?.data.name ?? path3.basename(root);
  for (const configWarning of config?.warnings ?? []) {
    checks.push(
      check(
        "config-warning",
        "warning",
        "Invalid DevSurface configuration",
        configWarning,
        "devsurface.config.json"
      )
    );
  }
  if (packageJson === null) {
    checks.push(
      check(
        "missing-package-json",
        "error",
        "No package.json",
        "DevSurface checks require a Node.js project with a package.json.",
        "package.json"
      )
    );
  } else {
    if (scripts.test === void 0) {
      checks.push(
        check(
          "missing-test-script",
          "warning",
          "No test script",
          "package.json does not define a test script.",
          "package.json"
        )
      );
    }
    if (scripts.build === void 0) {
      checks.push(
        check(
          "missing-build-script",
          "warning",
          "No build script",
          "package.json does not define a build script.",
          "package.json"
        )
      );
    }
  }
  if (readme === null) {
    checks.push(
      check("missing-readme", "warning", "No README", "No README.md or README file was found.")
    );
  } else {
    const missingScripts = extractScriptReferences(readme.content).filter(
      (script) => scripts[script] === void 0
    );
    if (missingScripts.length > 0) {
      checks.push(
        check(
          "readme-script-mismatch",
          "warning",
          "README references missing scripts",
          `README mentions scripts not present in package.json: ${missingScripts.join(", ")}.`,
          readme.path
        )
      );
    }
  }
  if (contributing === null) {
    checks.push(
      check(
        "missing-contributing",
        "warning",
        "No CONTRIBUTING guide",
        "No CONTRIBUTING.md or CONTRIBUTING file was found."
      )
    );
  }
  const documentation = [readme?.content, contributing?.content].filter(Boolean).join("\n");
  const envExample = config?.config.env?.example ?? ".env.example";
  if (await fileExistsInsideRoot(root, envExample) && !documentsEnvironmentSetup(documentation)) {
    checks.push(
      check(
        "undocumented-env",
        "warning",
        "Environment setup is undocumented",
        `${envExample} exists, but README or CONTRIBUTING does not explain environment setup.`,
        envExample
      )
    );
  }
  const ports = Array.from(
    /* @__PURE__ */ new Set([...config?.config.ports ?? [], ...inferPortsFromScripts(scripts)])
  );
  const missingPortDocs = undocumentedPorts(documentation, ports);
  if (missingPortDocs.length > 0) {
    checks.push(
      check(
        "undocumented-ports",
        "info",
        "Detected ports are undocumented",
        `README or CONTRIBUTING does not mention: ${missingPortDocs.join(", ")}.`
      )
    );
  }
  return { root, projectName, checks };
}

// src/action/github.ts
import { promises as fs4 } from "fs";
var COMMENT_MARKER = "<!-- devsurface-health-check -->";
async function readPullRequestNumber(eventPath) {
  if (!eventPath) {
    return null;
  }
  try {
    const event = JSON.parse(await fs4.readFile(eventPath, "utf8"));
    return typeof event.pull_request?.number === "number" ? event.pull_request.number : null;
  } catch {
    return null;
  }
}
async function githubRequest(url, token, init, fetchImpl) {
  return await fetchImpl(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers
    }
  });
}
async function upsertPullRequestComment(options, fetchImpl = fetch) {
  if (!options.token || !options.repository || !options.eventPath) {
    return "skipped";
  }
  const pullRequestNumber = await readPullRequestNumber(options.eventPath);
  if (pullRequestNumber === null) {
    return "skipped";
  }
  const baseUrl = `https://api.github.com/repos/${options.repository}`;
  const listResponse = await githubRequest(
    `${baseUrl}/issues/${pullRequestNumber}/comments?per_page=100`,
    options.token,
    { method: "GET" },
    fetchImpl
  );
  if (listResponse.status === 403) {
    return "forbidden";
  }
  if (!listResponse.ok) {
    throw new Error(`GitHub comment lookup failed with status ${listResponse.status}.`);
  }
  const comments = await listResponse.json();
  const existing = comments.find((comment) => comment.body?.includes(COMMENT_MARKER));
  const response = existing === void 0 ? await githubRequest(
    `${baseUrl}/issues/${pullRequestNumber}/comments`,
    options.token,
    { method: "POST", body: JSON.stringify({ body: options.body }) },
    fetchImpl
  ) : await githubRequest(
    `${baseUrl}/issues/comments/${existing.id}`,
    options.token,
    { method: "PATCH", body: JSON.stringify({ body: options.body }) },
    fetchImpl
  );
  if (response.status === 403) {
    return "forbidden";
  }
  if (!response.ok) {
    throw new Error(`GitHub comment update failed with status ${response.status}.`);
  }
  return existing === void 0 ? "created" : "updated";
}

// src/action/report.ts
var SEVERITY_ORDER = ["error", "warning", "info"];
function stripControlCharacters(value) {
  let result = "";
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code > 31 && code < 127 || code > 159) {
      result += character;
    }
  }
  return result;
}
function countChecks(checks) {
  return {
    error: checks.filter((item) => item.severity === "error").length,
    warning: checks.filter((item) => item.severity === "warning").length,
    info: checks.filter((item) => item.severity === "info").length
  };
}
function escapeMarkdown(value) {
  return stripControlCharacters(value).replaceAll("\\", "\\\\").replace(/([`*_[\]{}()#+!|<>])/g, "\\$1").replaceAll("\r", "").replaceAll("\n", " ");
}
function renderReport(projectName, checks) {
  const counts = countChecks(checks);
  const lines = [
    "<!-- devsurface-health-check -->",
    `## DevSurface Health Check: ${escapeMarkdown(projectName)}`,
    "",
    `Errors: **${counts.error}** | Warnings: **${counts.warning}** | Info: **${counts.info}**`,
    ""
  ];
  if (checks.length === 0) {
    lines.push("No repository health issues found.");
    return `${lines.join("\n")}
`;
  }
  lines.push("| Severity | Check | Details |", "| --- | --- | --- |");
  for (const severity of SEVERITY_ORDER) {
    for (const item of checks.filter((candidate) => candidate.severity === severity)) {
      lines.push(
        `| ${severity} | ${escapeMarkdown(item.title)} | ${escapeMarkdown(item.message)} |`
      );
    }
  }
  return `${lines.join("\n")}
`;
}
function parseFailureThreshold(value) {
  const normalized = value?.trim().toLowerCase() || "error";
  if (normalized === "error" || normalized === "warning" || normalized === "never") {
    return normalized;
  }
  throw new Error(`fail-on must be one of: error, warning, never. Received: ${value}`);
}
function shouldFail(checks, threshold) {
  if (threshold === "never") {
    return false;
  }
  if (threshold === "warning") {
    return checks.some((item) => item.severity === "error" || item.severity === "warning");
  }
  return checks.some((item) => item.severity === "error");
}

// src/action/runtime.ts
function input(name, fallback = "") {
  return process.env[`INPUT_${name.toUpperCase().replaceAll("-", "_")}`]?.trim() || fallback;
}
function booleanInput(name, fallback) {
  const value = input(name);
  if (!value) {
    return fallback;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new Error(`${name} must be true or false.`);
}
function isWithinRoot4(root, target) {
  const relative = path4.relative(root, target);
  return relative === "" || !relative.startsWith("..") && !path4.isAbsolute(relative);
}
async function resolveActionRoot(workspace, requestedPath) {
  const resolvedWorkspace = path4.resolve(workspace);
  const resolvedRoot = path4.resolve(resolvedWorkspace, requestedPath);
  if (!isWithinRoot4(resolvedWorkspace, resolvedRoot)) {
    throw new Error("path must resolve inside GITHUB_WORKSPACE.");
  }
  const [realWorkspace, realRoot] = await Promise.all([
    fs5.realpath(resolvedWorkspace),
    fs5.realpath(resolvedRoot)
  ]);
  if (!isWithinRoot4(realWorkspace, realRoot)) {
    throw new Error("path must resolve inside GITHUB_WORKSPACE.");
  }
  return realRoot;
}
function escapeWorkflowValue(value) {
  return value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}
function escapeWorkflowProperty(value) {
  return escapeWorkflowValue(value).replaceAll(":", "%3A").replaceAll(",", "%2C");
}
function emitAnnotations(checks) {
  for (const item of checks) {
    const command = item.severity === "info" ? "notice" : item.severity;
    const properties = [
      item.target ? `file=${escapeWorkflowProperty(item.target)}` : null,
      `title=${escapeWorkflowProperty(item.title)}`
    ].filter(Boolean);
    console.log(`::${command} ${properties.join(",")}::${escapeWorkflowValue(item.message)}`);
  }
}
async function appendFileIfConfigured(filePath, content) {
  if (filePath) {
    await fs5.appendFile(filePath, content, "utf8");
  }
}
async function writeOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    await fs5.appendFile(outputPath, `${name}=${value}
`, "utf8");
  }
}
async function runAction() {
  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
  const requestedPath = input("path", ".");
  const root = await resolveActionRoot(workspace, requestedPath);
  const threshold = parseFailureThreshold(input("fail-on", "error"));
  const comment = booleanInput("comment", true);
  const result = await runRepositoryChecks(root);
  const report = renderReport(result.projectName, result.checks);
  const counts = countChecks(result.checks);
  emitAnnotations(result.checks);
  await appendFileIfConfigured(process.env.GITHUB_STEP_SUMMARY, report);
  await writeOutput("errors", String(counts.error));
  await writeOutput("warnings", String(counts.warning));
  await writeOutput("info", String(counts.info));
  await writeOutput("outcome", result.checks.length === 0 ? "healthy" : "issues-found");
  if (comment) {
    const commentResult = await upsertPullRequestComment({
      token: input("github-token"),
      repository: process.env.GITHUB_REPOSITORY ?? "",
      eventPath: process.env.GITHUB_EVENT_PATH ?? "",
      body: report
    }).catch((error) => {
      console.log(
        `DevSurface could not update the pull request comment: ${error instanceof Error ? error.message : String(error)}`
      );
      return "skipped";
    });
    if (commentResult === "forbidden") {
      console.log(
        "DevSurface could not comment because this workflow has a read-only token. Annotations and the job summary are still available."
      );
    }
  }
  if (shouldFail(result.checks, threshold)) {
    process.exitCode = 1;
    console.error(`DevSurface repository checks failed at the ${threshold} threshold.`);
  }
}

// src/action/index.ts
runAction().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
