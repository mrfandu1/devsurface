/**
 * Secret leak scanner.
 *
 * Looks for credentials accidentally written into source files — API keys,
 * tokens, private keys, passwords in connection strings — and reports them
 * with the value redacted so the report itself can never leak anything.
 * Fully local and read-only; `.env` files are deliberately skipped because
 * secrets are *supposed* to live there (the doctor checks they are ignored).
 */

import { promises as fs } from 'node:fs';
import { walkFiles } from '../walk/index.js';

export type SecretSeverity = 'critical' | 'warning';

export interface SecretFinding {
  /** Which detector matched, e.g. "AWS access key". */
  kind: string;
  severity: SecretSeverity;
  /** Repo-relative file path with forward slashes. */
  file: string;
  /** 1-based line number. */
  line: number;
  /** First few characters of the match followed by "…" — never the value. */
  preview: string;
  /** Plain-English advice for this kind of finding. */
  advice: string;
}

export interface SecretReport {
  findings: SecretFinding[];
  scannedFiles: number;
  truncated: boolean;
  /** True when nothing suspicious was found. */
  clean: boolean;
}

interface SecretDetector {
  kind: string;
  severity: SecretSeverity;
  pattern: RegExp;
  advice: string;
}

const DETECTORS: SecretDetector[] = [
  {
    kind: 'AWS access key',
    severity: 'critical',
    pattern: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/,
    advice: 'Rotate the key in the AWS console and move it into an environment variable.'
  },
  {
    kind: 'GitHub token',
    severity: 'critical',
    pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
    advice: 'Revoke the token at github.com/settings/tokens and use an env variable instead.'
  },
  {
    kind: 'Slack token',
    severity: 'critical',
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
    advice: 'Revoke the token in the Slack app settings and load it from the environment.'
  },
  {
    kind: 'Stripe live key',
    severity: 'critical',
    pattern: /\b[sr]k_live_[A-Za-z0-9]{16,}\b/,
    advice: 'Roll the key in the Stripe dashboard immediately — live keys move real money.'
  },
  {
    kind: 'OpenAI-style key',
    severity: 'critical',
    pattern: /\bsk-[A-Za-z0-9_-]{32,}\b/,
    advice: 'Revoke the key with the provider and read it from an environment variable.'
  },
  {
    kind: 'Google API key',
    severity: 'warning',
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/,
    advice: 'Restrict or regenerate the key in the Google Cloud console.'
  },
  {
    kind: 'Private key block',
    severity: 'critical',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY(?: BLOCK)?-----/,
    advice: 'Remove the key file from the repo and generate a new key pair.'
  },
  {
    kind: 'Password in URL',
    severity: 'critical',
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@"']+:[^\s/@"']{4,}@[^\s"']+/i,
    advice: 'Change that password, then build the URL from environment variables at runtime.'
  },
  {
    kind: 'Hardcoded secret assignment',
    severity: 'warning',
    pattern:
      /(?:secret|password|passwd|api[_-]?key|auth[_-]?token|access[_-]?token)["']?\s*[:=]\s*["'][^"']{12,}["']/i,
    advice: 'Move the value into .env and reference it via the environment.'
  },
  {
    kind: 'JWT literal',
    severity: 'warning',
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
    advice: 'Tokens expire and leak scope — issue them at runtime instead of pasting one in.'
  }
];

const SCANNABLE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.cs',
  '.php',
  '.sh',
  '.ps1',
  '.yaml',
  '.yml',
  '.toml',
  '.json',
  '.ini',
  '.cfg',
  '.conf',
  '.properties',
  '.tf',
  '.pem',
  '.txt',
  '.md'
]);

/** Files that legitimately contain key-shaped strings — never scanned. */
const SKIPPED_FILES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'composer.lock',
  'Cargo.lock',
  'go.sum'
]);

const MAX_FILE_BYTES = 512 * 1024;
const MAX_FINDINGS = 200;

function extensionOf(relPath: string): string {
  const dot = relPath.lastIndexOf('.');
  return dot === -1 ? '' : relPath.slice(dot).toLowerCase();
}

function baseNameOf(relPath: string): string {
  const slash = relPath.lastIndexOf('/');
  return slash === -1 ? relPath : relPath.slice(slash + 1);
}

/** Redact a matched value: keep a short prefix, never the payload. */
export function redactSecret(match: string): string {
  const compact = match.replace(/\s+/g, ' ').trim();
  return compact.length <= 8 ? '…' : `${compact.slice(0, 8)}…`;
}

function isEnvFile(relPath: string): boolean {
  return baseNameOf(relPath).startsWith('.env');
}

/** Lines that clearly read from the environment are fine, not leaks. */
function readsFromEnvironment(line: string): boolean {
  return /process\.env|import\.meta\.env|os\.environ|os\.getenv|ENV\[|System\.getenv/i.test(line);
}

function looksLikePlaceholder(line: string): boolean {
  return /\b(example|sample|placeholder|your[_-]?|xxx+|changeme|<[^>]+>|\$\{)/i.test(line);
}

/** Scan the repository for secrets that should not be in source control. */
export async function scanSecrets(root: string): Promise<SecretReport> {
  const files = await walkFiles(root);
  const candidates = files.filter(
    (file) =>
      file.size <= MAX_FILE_BYTES &&
      SCANNABLE_EXTENSIONS.has(extensionOf(file.relPath)) &&
      !SKIPPED_FILES.has(baseNameOf(file.relPath)) &&
      !isEnvFile(file.relPath)
  );

  const findings: SecretFinding[] = [];
  let truncated = false;

  for (const file of candidates) {
    if (findings.length >= MAX_FINDINGS) {
      truncated = true;
      break;
    }
    let content: string;
    try {
      content = await fs.readFile(file.absPath, 'utf8');
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length && findings.length < MAX_FINDINGS; index += 1) {
      const line = lines[index];
      if (line.length > 2_000 || readsFromEnvironment(line) || looksLikePlaceholder(line)) {
        continue;
      }
      for (const detector of DETECTORS) {
        const match = detector.pattern.exec(line);
        if (match === null) {
          continue;
        }
        findings.push({
          kind: detector.kind,
          severity: detector.severity,
          file: file.relPath,
          line: index + 1,
          preview: redactSecret(match[0]),
          advice: detector.advice
        });
        break; // One finding per line keeps the report readable.
      }
    }
  }

  findings.sort(
    (left, right) =>
      (left.severity === right.severity ? 0 : left.severity === 'critical' ? -1 : 1) ||
      left.file.localeCompare(right.file) ||
      left.line - right.line
  );

  return {
    findings,
    scannedFiles: candidates.length,
    truncated,
    clean: findings.length === 0
  };
}
