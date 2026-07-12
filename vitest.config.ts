import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    restoreMocks: true,
    // Scan-heavy tests probe real tools (git, docker) and spawn processes;
    // on loaded Windows machines the 5s default flakes under parallel workers.
    testTimeout: 20_000
  }
});
