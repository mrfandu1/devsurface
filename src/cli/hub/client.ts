import { DEFAULT_HOST, DEFAULT_PORT } from '../../server/index.js';

export async function isHubRunning(port: number = DEFAULT_PORT): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/hub/status`, {
      signal: AbortSignal.timeout(2000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function registerWorkspaceRemotely(
  dirPath: string,
  port: number = DEFAULT_PORT
): Promise<{ id: string; name: string } | null> {
  try {
    const sessionResponse = await fetch(`http://127.0.0.1:${port}/api/session`, {
      signal: AbortSignal.timeout(2000)
    });
    if (!sessionResponse.ok) return null;
    const session = (await sessionResponse.json()) as { token: string };

    const response = await fetch(`http://127.0.0.1:${port}/api/workspaces`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DevSurface-Intent': 'dashboard',
        'X-DevSurface-Token': session.token
      },
      body: JSON.stringify({ path: dirPath }),
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return null;
    return (await response.json()) as { id: string; name: string };
  } catch {
    return null;
  }
}

export function dashboardUrl(
  workspaceId: string,
  port: number = DEFAULT_PORT,
  host: string = DEFAULT_HOST
): string {
  const displayHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  return `http://${displayHost}:${port}/?workspace=${workspaceId}`;
}
