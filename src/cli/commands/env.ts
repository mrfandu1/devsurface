import pc from 'picocolors';
import { syncEnvFromExample } from '../../core/env/sync.js';
import { scanProject } from '../../core/scanner/index.js';
import { safeTerminalText } from '../terminal.js';

/**
 * Report env readiness for humans and CI. Exits nonzero when required keys
 * are missing or empty, so it can gate pipelines. Values are never printed.
 */
export async function envCheckCommand(
  cwd = process.cwd(),
  options: { json?: boolean } = {}
): Promise<void> {
  const scan = await scanProject(cwd);
  const env = scan.env;

  if (env === null) {
    if (options.json === true) {
      console.log(JSON.stringify({ hasEnv: false, ok: true }));
      return;
    }
    console.log('This project does not use .env files. Nothing to check.');
    return;
  }

  const problems = env.missingKeys.length + env.emptyKeys.length;
  if (options.json === true) {
    console.log(
      JSON.stringify(
        {
          hasEnv: true,
          ok: problems === 0,
          missingKeys: env.missingKeys,
          emptyKeys: env.emptyKeys,
          extraKeys: env.extraKeys,
          hasLocal: env.hasLocal,
          hasExample: env.hasExample
        },
        null,
        2
      )
    );
  } else {
    for (const key of env.keys) {
      const status = key.present
        ? key.empty
          ? pc.yellow('empty  ')
          : pc.green('set    ')
        : pc.red('missing');
      console.log(`${status} ${safeTerminalText(key.key)}`);
    }
    for (const key of env.extraKeys) {
      console.log(`${pc.cyan('extra  ')} ${safeTerminalText(key)} ${pc.dim('(not in example)')}`);
    }
    console.log(
      problems === 0
        ? pc.green('\nAll environment keys are present and filled.')
        : pc.red(
            `\n${env.missingKeys.length} missing, ${env.emptyKeys.length} empty. Values are never displayed.`
          )
    );
  }

  if (problems > 0) {
    process.exitCode = 1;
  }
}

/**
 * Append the example's lines for missing keys to .env without ever touching
 * existing keys or values.
 */
export async function envSyncCommand(cwd = process.cwd()): Promise<void> {
  const scan = await scanProject(cwd);
  const result = await syncEnvFromExample(scan.env);

  if (!result.ok) {
    throw new Error(result.error ?? 'Unable to sync .env.');
  }
  if (result.added.length === 0) {
    console.log(pc.green('.env already has every key from .env.example.'));
    return;
  }
  console.log(
    `${result.created ? 'Created .env and added' : 'Added'} ${result.added.length} key${result.added.length === 1 ? '' : 's'}: ${result.added.map((key) => safeTerminalText(key)).join(', ')}`
  );
  console.log(pc.dim('Existing keys and values were left untouched. Fill in the new values.'));
}
