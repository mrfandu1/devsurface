const REGISTRY_LATEST_URL = 'https://registry.npmjs.org/devsurface/latest';
const UPDATE_CHECK_TIMEOUT_MS = 900;

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
}

function parseVersion(version: string): [number, number, number] | null {
  const match = version.match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) {
    return null;
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isNewerVersion(latestVersion: string, currentVersion: string): boolean {
  const latest = parseVersion(latestVersion);
  const current = parseVersion(currentVersion);
  if (latest === null || current === null) {
    return false;
  }

  for (let index = 0; index < latest.length; index += 1) {
    if (latest[index] > current[index]) {
      return true;
    }
    if (latest[index] < current[index]) {
      return false;
    }
  }

  return false;
}

export function formatUpdateNotice(info: UpdateInfo): string {
  return `Update available: v${info.latestVersion}\nRun: npx devsurface@latest`;
}

function shouldCheckForUpdates(): boolean {
  return process.env.DEVSURFACE_UPDATE_CHECK !== '0' && process.env.CI !== 'true';
}

export async function checkForUpdate(
  currentVersion: string,
  fetchImpl: typeof fetch = fetch
): Promise<UpdateInfo | null> {
  if (!shouldCheckForUpdates()) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPDATE_CHECK_TIMEOUT_MS);

  try {
    const response = await fetchImpl(REGISTRY_LATEST_URL, {
      headers: {
        accept: 'application/json'
      },
      signal: controller.signal
    });
    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as { version?: unknown };
    const latestVersion = typeof body.version === 'string' ? body.version : null;
    if (latestVersion === null || !isNewerVersion(latestVersion, currentVersion)) {
      return null;
    }

    return {
      currentVersion,
      latestVersion
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function printUpdateNotice(currentVersion: string): Promise<void> {
  const update = await checkForUpdate(currentVersion);
  if (update !== null) {
    console.log(`\n${formatUpdateNotice(update)}`);
  }
}
