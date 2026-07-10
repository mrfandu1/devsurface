export function extractScriptReferences(content: string): string[] {
  const references = new Set<string>();
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

/** Command words that mark a fenced-code line as a real setup/run command. */
const README_COMMAND_STARTERS = new Set([
  'npm',
  'pnpm',
  'yarn',
  'bun',
  'npx',
  'bunx',
  'node',
  'deno',
  'docker',
  'docker-compose',
  'cp',
  'copy',
  'make',
  'just',
  'task',
  'cargo',
  'go',
  'python',
  'python3',
  'pip',
  'poetry',
  'uv',
  'composer',
  'bundle',
  'rails',
  'mvn',
  'gradle'
]);

const README_COMMAND_LIMIT = 10;

/**
 * Extract the setup/run commands a README documents in fenced code blocks
 * (```bash / sh / shell / console / zsh, or untagged). Lines are normalized
 * (leading `$`/`>` prompts stripped) and only recognizably command-shaped
 * lines are kept, so prose and output samples never leak through.
 */
const SHELL_FENCE_LANGUAGES = new Set(['', 'bash', 'sh', 'shell', 'console', 'zsh']);

export function extractReadmeCommands(content: string): string[] {
  const commands: string[] = [];
  const seen = new Set<string>();
  let inFence = false;
  let shellFence = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const fenceMatch = rawLine.trim().match(/^```(\S*)/);
    if (fenceMatch !== null) {
      if (inFence) {
        inFence = false;
        shellFence = false;
      } else {
        inFence = true;
        shellFence = SHELL_FENCE_LANGUAGES.has(fenceMatch[1].toLowerCase());
      }
      continue;
    }
    if (!inFence || !shellFence) {
      continue;
    }

    const line = rawLine
      .trim()
      .replace(/^[$>]\s+/, '')
      .trim();
    if (line.length === 0 || line.startsWith('#') || line.length > 120) {
      continue;
    }
    const firstWord = line.split(/\s+/)[0];
    if (!README_COMMAND_STARTERS.has(firstWord) || seen.has(line)) {
      continue;
    }
    seen.add(line);
    commands.push(line);
    if (commands.length >= README_COMMAND_LIMIT) {
      return commands;
    }
  }

  return commands;
}

export function documentsEnvironmentSetup(content: string): boolean {
  return /(?:\.env(?:\.example)?|environment\s+variables?)/i.test(content);
}

export function undocumentedPorts(content: string, ports: number[]): number[] {
  return ports.filter((port) => !new RegExp(`\\b${port}\\b`).test(content));
}
