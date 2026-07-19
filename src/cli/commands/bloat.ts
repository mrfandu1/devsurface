import pc from 'picocolors';
import { findBloat } from '../../core/bloat/index.js';
import { formatBytes } from '../../core/stats/index.js';
import { safeTerminalText } from '../terminal.js';

/** `devsurface bloat` — the large files, LFS candidates, and stray build output. */
export async function bloatCommand(
  cwd = process.cwd(),
  options: { json?: boolean } = {}
): Promise<void> {
  const report = await findBloat(cwd);

  if (options.json === true) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(
    pc.bold(
      `${report.totalFiles.toLocaleString()} files · ${formatBytes(report.totalBytes)} on disk\n`
    )
  );

  if (report.largest.length > 0) {
    console.log(pc.bold('Largest files:'));
    for (const file of report.largest.slice(0, 10)) {
      const tag = file.binary ? pc.dim(' [binary]') : '';
      console.log(`  ${formatBytes(file.bytes).padStart(9)}  ${safeTerminalText(file.file)}${tag}`);
    }
  }

  if (report.lfsCandidates.length > 0) {
    console.log(pc.bold(pc.yellow('\nLarge binaries (consider Git LFS or external storage):')));
    for (const file of report.lfsCandidates.slice(0, 8)) {
      console.log(`  ${formatBytes(file.bytes).padStart(9)}  ${safeTerminalText(file.file)}`);
    }
  }

  if (report.suspiciousCommitted.length > 0) {
    console.log(pc.bold(pc.yellow('\nLikely committed by mistake (build output / logs):')));
    for (const file of report.suspiciousCommitted.slice(0, 12)) {
      console.log(`  ${pc.dim(safeTerminalText(file))}`);
    }
  }

  console.log(pc.bold('\nBiggest directories (by file count):'));
  for (const dir of report.heaviestDirs.slice(0, 8)) {
    console.log(
      `  ${String(dir.files).padStart(6)} files  ${formatBytes(dir.bytes).padStart(9)}  ${safeTerminalText(dir.dir)}`
    );
  }
}
