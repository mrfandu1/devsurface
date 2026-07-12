/**
 * Friendly names for well-known development ports, so "3000 is busy" reads
 * as "3000 (React/Next.js dev server) is busy". Pure data.
 */

const WELL_KNOWN_PORTS: Record<number, string> = {
  80: 'HTTP (web)',
  443: 'HTTPS (web)',
  1025: 'mail catcher (SMTP)',
  1080: 'MailDev inbox',
  1433: 'SQL Server database',
  3000: 'React/Next.js dev server',
  3001: 'secondary dev server',
  3306: 'MySQL database',
  4000: 'Phoenix/GraphQL dev server',
  4200: 'Angular dev server',
  4321: 'Astro dev server',
  4567: 'DevSurface dashboard',
  5000: 'Flask/serve dev server',
  5173: 'Vite dev server',
  5174: 'Vite dev server (second app)',
  5432: 'PostgreSQL database',
  5555: 'Prisma Studio',
  6006: 'Storybook',
  6379: 'Redis',
  7071: 'Azure Functions',
  8000: 'Django/FastAPI dev server',
  8025: 'MailHog inbox',
  8080: 'HTTP alternative / Java app',
  8081: 'Metro bundler (React Native)',
  8443: 'HTTPS alternative',
  8787: 'Cloudflare Workers dev',
  8888: 'Jupyter Notebook',
  9000: 'PHP/SonarQube',
  9090: 'Prometheus',
  9200: 'Elasticsearch',
  9229: 'Node.js debugger',
  11211: 'Memcached',
  19000: 'Expo dev server',
  24678: 'Vite HMR websocket',
  27017: 'MongoDB database',
  54321: 'Supabase local'
};

/** Friendly label for a port, or null when it is not a well-known one. */
export function portLabel(port: number): string | null {
  return WELL_KNOWN_PORTS[port] ?? null;
}
