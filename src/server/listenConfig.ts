export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 4567;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const CONTAINER_HOSTS = new Set(['0.0.0.0', '::']);

export function resolveHost(): string {
  const envHost = process.env.DEVSURFACE_HOST;
  if (!envHost) {
    return DEFAULT_HOST;
  }

  if (LOOPBACK_HOSTS.has(envHost)) {
    return envHost;
  }

  if (CONTAINER_HOSTS.has(envHost) && process.env.DEVSURFACE_CONTAINER === 'true') {
    return envHost;
  }

  if (CONTAINER_HOSTS.has(envHost)) {
    throw new Error(
      'All-interface DevSurface binding is only allowed when DEVSURFACE_CONTAINER=true. DevSurface binds to 127.0.0.1 on bare metal.'
    );
  }

  throw new Error('DEVSURFACE_HOST must be a loopback host, or 0.0.0.0 inside a container.');
}

let listenHost = DEFAULT_HOST;

export function setListenHost(host: string): void {
  listenHost = host;
}

export function getListenHost(): string {
  return listenHost;
}

export function resetListenHost(): void {
  listenHost = DEFAULT_HOST;
}

export function normalizeRemoteAddress(raw: string | undefined): string | null {
  if (typeof raw !== 'string' || raw.length === 0) {
    return null;
  }

  if (raw.startsWith('::ffff:')) {
    return raw.slice('::ffff:'.length);
  }

  return raw;
}

export function isLoopbackRemoteAddress(raw: string | undefined): boolean {
  const address = normalizeRemoteAddress(raw);
  if (!address) {
    return false;
  }

  if (address === '::1' || address === '127.0.0.1') {
    return true;
  }

  return address.startsWith('127.');
}

function parseIpv4(address: string): [number, number, number, number] | null {
  const parts = address.split('.');
  if (parts.length !== 4) {
    return null;
  }

  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return null;
  }

  return octets as [number, number, number, number];
}

export function isPrivateRemoteAddress(raw: string | undefined): boolean {
  const address = normalizeRemoteAddress(raw);
  if (!address) {
    return false;
  }

  if (isLoopbackRemoteAddress(address)) {
    return true;
  }

  if (address.startsWith('fe80:')) {
    return true;
  }

  const ipv4 = parseIpv4(address);
  if (!ipv4) {
    return false;
  }

  const [a, b] = ipv4;
  if (a === 10) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }

  return false;
}

export function isAllowedRemoteAddress(raw: string | undefined, host: string): boolean {
  if (host === '0.0.0.0' || host === '::') {
    return isPrivateRemoteAddress(raw);
  }

  return isLoopbackRemoteAddress(raw);
}

export function isAllowedClientConnection(
  raw: string | undefined,
  host: string = getListenHost()
): boolean {
  if (raw === undefined) {
    return true;
  }

  return isAllowedRemoteAddress(raw, host);
}

export function initializeListenHost(): string {
  const host = resolveHost();
  setListenHost(host);
  return host;
}
