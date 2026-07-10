import type { ManagedProcessSnapshot } from './types';

export type FaviconState = 'failed' | 'running' | null;

/** The status dot the favicon should show: failures win, then activity. */
export function faviconStateFromProcesses(processes: ManagedProcessSnapshot[]): FaviconState {
  if (processes.some((processInfo) => processInfo.status === 'failed')) {
    return 'failed';
  }
  if (processes.some((processInfo) => processInfo.status === 'running')) {
    return 'running';
  }
  return null;
}

let baseFaviconHref: string | null = null;

/**
 * Overlay a status dot on the favicon (red = a script failed, green =
 * something is running). Passing null restores the original icon.
 */
export function applyStatusFavicon(state: FaviconState): void {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (link === null) {
    return;
  }
  if (baseFaviconHref === null) {
    baseFaviconHref = link.href;
  }
  if (state === null) {
    link.href = baseFaviconHref;
    return;
  }

  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d');
    if (context === null) {
      return;
    }
    context.drawImage(image, 0, 0, 32, 32);
    context.beginPath();
    context.arc(24, 24, 7, 0, Math.PI * 2);
    context.fillStyle = state === 'failed' ? '#e05d44' : '#2f9e44';
    context.fill();
    context.strokeStyle = '#ffffff';
    context.lineWidth = 2;
    context.stroke();
    link.href = canvas.toDataURL('image/png');
  };
  image.src = baseFaviconHref;
}
