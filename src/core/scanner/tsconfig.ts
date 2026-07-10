/**
 * Minimal tsconfig.json inspection for the doctor. tsconfig allows comments
 * and trailing commas, so this strips both before parsing.
 */

function stripJsonComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,\s*([}\]])/g, '$1');
}

export interface TsconfigStrictness {
  /** True/false when the config states it; null when unknown (parse failure or extends). */
  strict: boolean | null;
}

export function inspectTsconfigStrictness(content: string): TsconfigStrictness {
  try {
    const parsed = JSON.parse(stripJsonComments(content)) as {
      extends?: unknown;
      compilerOptions?: { strict?: unknown };
    };
    const strict = parsed.compilerOptions?.strict;
    if (typeof strict === 'boolean') {
      return { strict };
    }
    // Inherited configs may enable strict elsewhere — do not judge.
    if (parsed.extends !== undefined) {
      return { strict: null };
    }
    return { strict: false };
  } catch {
    return { strict: null };
  }
}
