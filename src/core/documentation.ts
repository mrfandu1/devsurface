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

export function documentsEnvironmentSetup(content: string): boolean {
  return /(?:\.env(?:\.example)?|environment\s+variables?)/i.test(content);
}

export function undocumentedPorts(content: string, ports: number[]): number[] {
  return ports.filter((port) => !new RegExp(`\\b${port}\\b`).test(content));
}
