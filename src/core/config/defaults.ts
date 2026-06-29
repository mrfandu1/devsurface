import type { DevSurfaceConfig } from '../types.js';

export const CONFIG_FILE_NAME = 'devsurface.config.json';

export const defaultConfig: DevSurfaceConfig = {
  name: 'My App',
  description: 'Local developer control panel',
  commands: {
    install: 'npm install',
    migrate: 'npm run db:migrate',
    seed: 'npm run db:seed',
    dev: 'npm run dev',
    build: 'npm run build',
    test: 'npm test',
    lint: 'npm run lint'
  },
  groups: {
    'First-time setup': ['install', 'migrate', 'seed'],
    'Daily development': ['dev'],
    'Before committing': ['test', 'lint'],
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
  setupGuide: [
    {
      title: 'Install dependencies',
      description: 'Run the package manager install to set up node_modules.',
      command: 'install'
    },
    'Copy .env.example to .env',
    'Fill in required environment values (DATABASE_URL, etc.)',
    {
      title: 'Run database migrations',
      description: 'Apply the database schema to your local database.',
      command: 'migrate'
    },
    {
      title: 'Start the development server',
      description: 'Run the local dev server and open the app in a browser.',
      command: 'dev'
    }
  ],
  docs: ''
};
