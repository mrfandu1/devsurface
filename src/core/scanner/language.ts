import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PackageJsonInfo, ProjectLanguage, ProjectLanguageInfo } from '../types.js';

const languageFiles: Array<{ language: ProjectLanguage; candidates: string[] }> = [
  { language: 'python', candidates: ['requirements.txt', 'pyproject.toml', 'Pipfile'] },
  { language: 'go', candidates: ['go.mod'] },
  { language: 'java', candidates: ['pom.xml', 'build.gradle', 'build.gradle.kts'] }
];

function isWithinRoot(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function safeFile(root: string, candidate: string): Promise<string | null> {
  const filePath = path.join(root, candidate);
  try {
    const [realRoot, stat, realPath] = await Promise.all([
      fs.realpath(root),
      fs.stat(filePath),
      fs.realpath(filePath)
    ]);
    if (stat.isFile() && isWithinRoot(realRoot, realPath)) {
      return realPath;
    }
  } catch {
    return null;
  }
  return null;
}

export async function detectProjectLanguage(
  root: string,
  packageJson: PackageJsonInfo | null
): Promise<ProjectLanguageInfo> {
  const detected: ProjectLanguage[] = [];
  const files: string[] = [];

  if (packageJson !== null) {
    detected.push('node');
    files.push(packageJson.path);
  }

  for (const definition of languageFiles) {
    let found = false;
    for (const candidate of definition.candidates) {
      const file = await safeFile(root, candidate);
      if (file !== null) {
        found = true;
        files.push(file);
      }
    }
    if (found) {
      detected.push(definition.language);
    }
  }

  return {
    primary: detected[0] ?? null,
    detected,
    files
  };
}
