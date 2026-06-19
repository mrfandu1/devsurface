import type { ScanResult } from './types';

type PortProbe = ScanResult['ports'][number];

const PORT_PATTERNS = [
  /(?:--port|-p)(?:\s+|=)(\d{2,5})/g,
  /\bPORT=(\d{2,5})\b/g,
  /\$env:PORT\s*=\s*(\d{2,5})\b/gi,
  /\bset\s+PORT=(\d{2,5})\b/gi,
  /\blocalhost:(\d{2,5})\b/g,
  /\b127\.0\.0\.1:(\d{2,5})\b/g,
  /\b0\.0\.0\.0:(\d{2,5})\b/g
];

function uniquePorts(ports: number[]): number[] {
  return Array.from(
    new Set(ports.filter((port) => Number.isInteger(port) && port > 0 && port < 65536))
  );
}

export function inferPortsFromCommand(command: string): number[] {
  const ports: number[] = [];

  for (const pattern of PORT_PATTERNS) {
    for (const match of command.matchAll(pattern)) {
      ports.push(Number(match[1]));
    }
  }

  return uniquePorts(ports);
}

export function scriptLooksLikeServer(script: string, command: string): boolean {
  const scriptName = script.toLowerCase();
  if (/(^|[:_-])(dev|serve|start|preview)([:_-]|$)/.test(scriptName)) {
    return true;
  }

  const commandText = command.toLowerCase();
  if (/\bvite(?:\s|$)/.test(commandText) && !/\bvite\s+build\b/.test(commandText)) {
    return true;
  }

  return [
    /\bnext\s+(dev|start)\b/,
    /\breact-scripts\s+start\b/,
    /\bastro\s+dev\b/,
    /\bnuxt\s+(dev|start|preview)\b/,
    /\bsvelte-kit\s+dev\b/,
    /\bwebpack\s+serve\b/,
    /\bremix\s+dev\b/,
    /\bserve\b/
  ].some((pattern) => pattern.test(commandText));
}

export function candidatePortsForScript(project: ScanResult, script: string): number[] {
  const command = project.scripts[script] ?? '';
  return uniquePorts([
    ...inferPortsFromCommand(command),
    ...project.ports.map((port) => port.port)
  ]);
}

export function chooseAutoOpenPort(
  previousPorts: PortProbe[],
  nextPorts: PortProbe[],
  candidatePorts: number[]
): number | null {
  const nextByPort = new Map(nextPorts.map((port) => [port.port, port]));
  for (const port of candidatePorts) {
    if (nextByPort.get(port)?.inUse) {
      return port;
    }
  }

  const previouslyAvailable = new Set(
    previousPorts.filter((port) => !port.inUse).map((port) => port.port)
  );
  const newlyOccupied = nextPorts.find((port) => port.inUse && previouslyAvailable.has(port.port));
  return newlyOccupied?.port ?? null;
}

export function appUrlForPort(port: number): string {
  return `http://127.0.0.1:${port}`;
}
