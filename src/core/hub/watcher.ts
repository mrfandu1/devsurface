import fs from 'node:fs';

/** Root-level files whose changes invalidate the last scan. */
const WATCHED_FILES = new Set([
  'package.json',
  'devsurface.config.json',
  '.env',
  '.env.example',
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
  '.nvmrc',
  '.node-version',
  'tsconfig.json',
  'CHANGELOG.md',
  'Dockerfile',
  'pnpm-workspace.yaml',
  'turbo.json'
]);

const DEBOUNCE_MS = 600;

export function isWatchedProjectFile(filename: string): boolean {
  return WATCHED_FILES.has(filename);
}

/**
 * Watch a workspace root for changes to scan-relevant files and invoke
 * `onChange` (debounced) with the filename that triggered it. Returns a
 * disposer. Watching is best-effort: on platforms where fs.watch fails the
 * dashboard simply falls back to its polling refresh.
 */
export function watchWorkspace(root: string, onChange: (file: string) => void): () => void {
  let timer: NodeJS.Timeout | null = null;
  let lastFile = '';

  let watcher: fs.FSWatcher;
  try {
    watcher = fs.watch(root, { persistent: false }, (_event, filename) => {
      if (typeof filename !== 'string' || !isWatchedProjectFile(filename)) {
        return;
      }
      lastFile = filename;
      if (timer !== null) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        onChange(lastFile);
      }, DEBOUNCE_MS);
    });
    watcher.on('error', () => undefined);
  } catch {
    return () => undefined;
  }

  return () => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    watcher.close();
  };
}
