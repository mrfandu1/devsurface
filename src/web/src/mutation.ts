let cachedToken: string | null = null;

export async function mutationHeaders(): Promise<Record<string, string>> {
  if (cachedToken === null) {
    const response = await fetch('/api/session');
    if (!response.ok) {
      throw new Error('/api/session returned a non-success status.');
    }
    const body = (await response.json()) as { token: string };
    cachedToken = body.token;
  }

  return {
    'X-DevSurface-Intent': 'dashboard',
    'X-DevSurface-Token': cachedToken
  };
}

export function apiPrefix(workspaceId: string | null): string {
  return workspaceId ? `/api/workspaces/${encodeURIComponent(workspaceId)}` : '/api';
}
