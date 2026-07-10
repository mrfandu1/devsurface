/**
 * Shields-style flat SVG badge for the project's setup readiness score.
 * Pure string rendering: no network, no dependencies, deterministic output.
 */

const CHAR_WIDTH = 6.5;
const PADDING = 10;

/** Color buckets follow the familiar shields.io coverage convention. */
export function readinessColor(readiness: number): string {
  if (readiness >= 90) {
    return '#4c1';
  }
  if (readiness >= 75) {
    return '#97ca00';
  }
  if (readiness >= 50) {
    return '#dfb317';
  }
  if (readiness >= 25) {
    return '#fe7d37';
  }
  return '#e05d44';
}

function textWidth(text: string): number {
  return Math.round(text.length * CHAR_WIDTH + PADDING * 2);
}

/**
 * Render a "devsurface | NN% ready" badge. `readiness` is clamped to 0-100 so
 * corrupted input can never produce a strange badge; the label is sanitized
 * and bounded so custom labels cannot break the SVG.
 */
export function renderReadinessBadge(readiness: number, labelText = 'devsurface'): string {
  const score = Math.max(0, Math.min(100, Math.round(readiness)));
  const label = labelText.replace(/[<>&"']/g, '').slice(0, 32) || 'devsurface';
  const message = `${score}% ready`;
  const color = readinessColor(score);
  const labelWidth = textWidth(label);
  const messageWidth = textWidth(message);
  const width = labelWidth + messageWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${label}: ${message}">
  <title>${label}: ${message}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${width}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${messageWidth}" height="20" fill="${color}"/>
    <rect width="${width}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text x="${labelWidth + messageWidth / 2}" y="14">${message}</text>
  </g>
</svg>
`;
}
