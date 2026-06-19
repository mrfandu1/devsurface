import type { PackageJsonInfo } from '../types.js';

export function extractScripts(packageJson: PackageJsonInfo | null): Record<string, string> | null {
  if (
    !packageJson?.data.scripts ||
    typeof packageJson.data.scripts !== 'object' ||
    Array.isArray(packageJson.data.scripts)
  ) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(packageJson.data.scripts).filter((entry): entry is [string, string] => {
      const [, command] = entry;
      return typeof command === 'string';
    })
  );
}
