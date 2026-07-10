import pc from 'picocolors';
import { checkForUpdate, isNewerVersion } from '../updateCheck.js';
import { DEV_SURFACE_VERSION } from '../../version.js';

/** Explicit update check against the npm registry (network, on demand only). */
export async function upgradeCommand(): Promise<void> {
  console.log(`Current version: v${DEV_SURFACE_VERSION}`);

  const previous = process.env.DEVSURFACE_UPDATE_CHECK;
  process.env.DEVSURFACE_UPDATE_CHECK = '1';
  let update;
  try {
    update = await checkForUpdate(DEV_SURFACE_VERSION);
  } finally {
    if (previous === undefined) {
      delete process.env.DEVSURFACE_UPDATE_CHECK;
    } else {
      process.env.DEVSURFACE_UPDATE_CHECK = previous;
    }
  }

  if (update !== null && isNewerVersion(update.latestVersion, DEV_SURFACE_VERSION)) {
    console.log(pc.yellow(`Latest version:  v${update.latestVersion}`));
    console.log('\nUpgrade with one of:');
    console.log('  npx devsurface@latest');
    console.log('  npm install -g devsurface@latest');
    console.log(
      pc.dim('\nChangelog: https://github.com/mrfandu1/devsurface/blob/main/CHANGELOG.md')
    );
    return;
  }

  console.log(pc.green('You are on the latest version (or the registry was unreachable).'));
}
