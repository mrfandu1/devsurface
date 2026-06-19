const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1']);

function hostnameFromHostHeader(host: string): string | null {
  const trimmed = host.trim().toLowerCase();
  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']');
    return end > 0 ? trimmed.slice(1, end) : null;
  }

  return trimmed.split(':')[0] ?? null;
}

export function isAllowedLocalHostHeader(host: string | null | undefined): boolean {
  if (typeof host !== 'string') {
    return false;
  }

  const hostname = hostnameFromHostHeader(host);
  return hostname !== null && LOCAL_HOSTNAMES.has(hostname);
}

export function isAllowedLocalOrigin(origin: string | null): boolean {
  if (origin === null) {
    return true;
  }

  try {
    const url = new URL(origin);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      LOCAL_HOSTNAMES.has(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

export function isSameOrigin(requestUrl: string, origin: string): boolean {
  try {
    return new URL(requestUrl).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}
