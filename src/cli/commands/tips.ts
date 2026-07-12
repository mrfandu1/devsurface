import pc from 'picocolors';
import { buildTips, type TipKind } from '../../core/tips/index.js';
import { scanProject } from '../../core/scanner/index.js';
import { safeTerminalText } from '../terminal.js';

const KIND_LABELS: Record<TipKind, string> = {
  'do-this': 'Do this',
  shortcut: 'Shortcut',
  'good-to-know': 'Good to know'
};

function kindGlyph(kind: TipKind): string {
  if (kind === 'do-this') {
    return pc.yellow('▶');
  }
  if (kind === 'shortcut') {
    return pc.cyan('⚡');
  }
  return pc.green('ℹ');
}

/** `devsurface tips` — friendly, project-aware advice for newcomers. */
export async function tipsCommand(
  cwd = process.cwd(),
  options: { json?: boolean } = {}
): Promise<void> {
  const scan = await scanProject(cwd);
  const tips = buildTips(scan);

  if (options.json === true) {
    console.log(JSON.stringify(tips, null, 2));
    return;
  }

  console.log(pc.bold(`Tips for ${safeTerminalText(scan.projectName)}\n`));
  for (const tip of tips) {
    console.log(
      `${kindGlyph(tip.kind)} ${pc.bold(KIND_LABELS[tip.kind])} — ${safeTerminalText(tip.text)}`
    );
    if (tip.command !== undefined) {
      console.log(pc.dim(`   $ ${safeTerminalText(tip.command)}`));
    }
    console.log('');
  }
}
