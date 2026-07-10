import { parse as parseYaml } from 'yaml';
import type { ComposeServicePorts } from '../types.js';

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port > 0 && port < 65536;
}

/**
 * Host-side port from one compose `ports` entry. Handles the short syntax
 * ("8080:80", "127.0.0.1:5432:5432", 3000, "3000") and the long syntax
 * ({ published: 8080, target: 80 }).
 */
export function hostPortFromEntry(entry: unknown): number | null {
  if (typeof entry === 'number') {
    return isValidPort(entry) ? entry : null;
  }
  if (typeof entry === 'string') {
    // Strip a protocol suffix ("8080:80/tcp") and take the host-side part.
    const value = entry.split('/')[0];
    const parts = value.split(':');
    // "80" | "8080:80" | "127.0.0.1:5432:5432"
    const hostPart = parts.length === 1 ? parts[0] : parts[parts.length - 2];
    const port = Number(hostPart);
    return isValidPort(port) ? port : null;
  }
  if (typeof entry === 'object' && entry !== null && 'published' in entry) {
    const published = Number((entry as { published: unknown }).published);
    return isValidPort(published) ? published : null;
  }
  return null;
}

/** Published host ports per service, parsed from raw Compose file content. */
export function parseComposePorts(content: string): ComposeServicePorts[] {
  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch {
    return [];
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('services' in parsed) ||
    typeof parsed.services !== 'object' ||
    parsed.services === null
  ) {
    return [];
  }

  const results: ComposeServicePorts[] = [];
  for (const [service, definition] of Object.entries(parsed.services as Record<string, unknown>)) {
    if (typeof definition !== 'object' || definition === null || !('ports' in definition)) {
      continue;
    }
    const rawPorts = (definition as { ports: unknown }).ports;
    if (!Array.isArray(rawPorts)) {
      continue;
    }
    const hostPorts = [
      ...new Set(
        rawPorts
          .map((entry) => hostPortFromEntry(entry))
          .filter((port): port is number => port !== null)
      )
    ];
    if (hostPorts.length > 0) {
      results.push({ service, hostPorts });
    }
  }
  return results;
}

/** The base image from the first FROM line of a Dockerfile. */
export function parseDockerfileBaseImage(content: string): string | null {
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }
    const match = line.match(/^FROM\s+(?:--platform=\S+\s+)?(\S+)/i);
    if (match !== null) {
      return match[1];
    }
    // ARG lines may precede FROM; anything else means no parseable FROM.
    if (!/^ARG\s/i.test(line)) {
      return null;
    }
  }
  return null;
}
