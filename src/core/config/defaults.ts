import type { DevSurfaceConfig } from '../types.js';

export const CONFIG_FILE_NAME = 'devsurface.config.json';

export const defaultConfig: DevSurfaceConfig = {
  name: 'My App',
  description: 'Local developer control panel',
  commands: {
    install: 'npm install',
    dev: 'npm run dev',
    build: 'npm run build',
    test: 'npm test',
    lint: 'npm run lint'
  },
  groups: {
    Setup: ['install'],
    Development: ['dev'],
    Quality: ['test', 'lint'],
    Build: ['build']
  },
  ports: [3000],
  env: {
    example: '.env.example',
    local: '.env'
  },
  services: {
    docker: true
  },
  docs: ''
};
