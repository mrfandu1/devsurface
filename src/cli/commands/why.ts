import pc from 'picocolors';
import { explainErrorOutput } from '../../core/friendly/index.js';
import { safeTerminalText } from '../terminal.js';

async function readStdin(): Promise<string> {
  let data = '';
  for await (const chunk of process.stdin) {
    data += chunk;
  }
  return data;
}

/**
 * `devsurface why [error text]` — paste a scary error, get a plain-English
 * explanation and one concrete next step. Reads stdin when piped, so
 * `npm run build 2>&1 | devsurface why` also works.
 */
export async function whyCommand(parts: string[]): Promise<void> {
  let text = parts.join(' ').trim();
  if (text.length === 0 && !process.stdin.isTTY) {
    text = (await readStdin()).trim();
  }
  if (text.length === 0) {
    console.log('Paste the error after the command, for example:');
    console.log(pc.dim('  devsurface why "EADDRINUSE: address already in use :::3000"'));
    console.log(pc.dim('  npm run build 2>&1 | devsurface why'));
    return;
  }

  const friendly = explainErrorOutput(text);
  if (friendly === null) {
    console.log('That error is not one DevSurface recognizes yet — but two universal tricks:');
    console.log('  1. The FIRST error line in the output is usually the real cause.');
    console.log('  2. Searching the exact error text online almost always finds the answer.');
    return;
  }

  console.log(pc.bold(pc.yellow(`\n${safeTerminalText(friendly.title)}`)));
  console.log(`\n${safeTerminalText(friendly.explanation)}`);
  console.log(pc.bold('\nWhat to do:'));
  console.log(`  ${safeTerminalText(friendly.suggestion)}\n`);
}
