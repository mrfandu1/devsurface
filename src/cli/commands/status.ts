import pc from 'picocolors';

interface HubStatusPayload {
  status?: string;
  version?: string;
  uptimeSeconds?: number;
  workspaceCount?: number;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** Check whether a local DevSurface hub is running and report what it knows. */
export async function statusCommand(port = 4567): Promise<void> {
  const url = `http://127.0.0.1:${port}/api/hub/status`;
  let payload: HubStatusPayload;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }
    payload = (await response.json()) as HubStatusPayload;
  } catch {
    console.log(pc.yellow(`No DevSurface hub is running on port ${port}.`));
    console.log(pc.dim('Start one with: npx devsurface'));
    process.exitCode = 1;
    return;
  }

  console.log(pc.green(`DevSurface hub is running on http://127.0.0.1:${port}`));
  console.log(`Version:     ${payload.version ?? 'unknown'}`);
  if (typeof payload.uptimeSeconds === 'number') {
    console.log(`Uptime:      ${formatUptime(payload.uptimeSeconds)}`);
  }
  if (typeof payload.workspaceCount === 'number') {
    console.log(`Workspaces:  ${payload.workspaceCount}`);
  }
}
