/**
 * Heuristics for spotting real-looking secret values committed to
 * .env.example. Only key names ever leave this module — values are inspected
 * locally and discarded.
 */

const PLACEHOLDER_PATTERNS = [
  /^\s*$/,
  /^["']?\s*["']?$/,
  /your[-_ ]?/i,
  /my[-_ ]?(key|secret|token|password)/i,
  /(example|sample|placeholder|dummy|fake|test|changeme|change[-_ ]me|replace|todo|fixme)/i,
  /^[<[{(].*[>\]})]$/,
  /^\$\{.*\}$/,
  /^(x+|\*+|\.+|-+|0+|1234.*|abc.*|password|secret|token|key|value|string|true|false|null|none|localhost)$/i,
  /^(http|postgres|postgresql|mysql|mongodb|redis|amqp):\/\/[^@]*$/i
];

/** Character-class variety: a rough stand-in for entropy that needs no math. */
function charsetVariety(value: string): number {
  let variety = 0;
  if (/[a-z]/.test(value)) variety += 1;
  if (/[A-Z]/.test(value)) variety += 1;
  if (/[0-9]/.test(value)) variety += 1;
  if (/[^A-Za-z0-9]/.test(value)) variety += 1;
  return variety;
}

/**
 * Vendor-specific token shapes that identify a real credential on their own:
 * GitHub, Slack, Stripe, AWS, Google, npm, GitLab, DigitalOcean, Shopify,
 * SendGrid, Mailgun-style, Hugging Face, PyPI, OpenAI/Anthropic-style keys.
 */
const KNOWN_TOKEN_PREFIXES =
  /^(ghp_|gho_|ghu_|ghs_|ghr_|github_pat_|xox[bapsro]-|sk-|sk_live_|sk_test_|pk_live_|rk_live_|whsec_|AKIA|ASIA|AIza|npm_|glpat-|glrt-|dop_v1_|doo_v1_|shpat_|shpss_|SG\.|hf_|pypi-|figd_|lin_api_|ntn_|secret_|sntrys_|rnd_|tskey-)/;

/** True when a single example value looks like a real credential, not a placeholder. */
export function looksLikeRealSecret(value: string): boolean {
  const trimmed = value.trim().replace(/^["']|["']$/g, '');
  if (trimmed.length < 16) {
    return false;
  }
  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return false;
  }
  // A recognized vendor prefix on a long value is decisive by itself.
  if (KNOWN_TOKEN_PREFIXES.test(trimmed)) {
    return true;
  }
  // Long single-charset strings ("aaaa...") are placeholders; real tokens mix cases/digits.
  if (charsetVariety(trimmed) < 3) {
    return false;
  }
  // URLs with embedded credentials count; bare URLs were excluded above.
  return true;
}

/**
 * Scan raw .env.example content and return the key names whose values look
 * like real secrets. Values are never returned.
 */
export function findSuspiciousExampleKeys(content: string): string[] {
  const suspicious: string[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }
    const normalized = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
    const separator = normalized.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const key = normalized.slice(0, separator).trim();
    const value = normalized.slice(separator + 1);
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && looksLikeRealSecret(value)) {
      suspicious.push(key);
    }
  }
  return suspicious;
}
