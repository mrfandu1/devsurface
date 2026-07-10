export interface ComposeEnvRef {
  name: string;
  /** True when the reference carries a fallback (`${VAR:-default}`). */
  hasDefault: boolean;
}

/**
 * Extract `${VAR}` environment references from raw Compose file content.
 * References with defaults (`${VAR:-x}` / `${VAR-x}`) are noted so callers
 * can skip warning about them.
 */
export function extractComposeEnvRefs(content: string): ComposeEnvRef[] {
  const refs = new Map<string, ComposeEnvRef>();
  for (const match of content.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)(:?[-?][^}]*)?\}/g)) {
    const name = match[1];
    const modifier = match[2] ?? '';
    const hasDefault = modifier.startsWith(':-') || modifier.startsWith('-');
    const existing = refs.get(name);
    // A single var may appear with and without defaults; "no default" wins.
    if (existing === undefined || (existing.hasDefault && !hasDefault)) {
      refs.set(name, { name, hasDefault });
    }
  }
  return [...refs.values()];
}
