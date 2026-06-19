import type { FrameworkInfo, PackageJsonInfo } from '../types.js';

const frameworkPackages: Array<{ packageName: string; label: string }> = [
  { packageName: 'next', label: 'Next.js' },
  { packageName: 'vite', label: 'Vite' },
  { packageName: 'express', label: 'Express' },
  { packageName: 'fastify', label: 'Fastify' },
  { packageName: '@nestjs/core', label: 'NestJS' },
  { packageName: '@remix-run/react', label: 'Remix' },
  { packageName: 'prisma', label: 'Prisma' }
];

export function detectFramework(packageJson: PackageJsonInfo | null): FrameworkInfo | null {
  if (packageJson === null) {
    return null;
  }

  const dependencies = {
    ...packageJson.data.dependencies,
    ...packageJson.data.devDependencies,
    ...packageJson.data.optionalDependencies,
    ...packageJson.data.peerDependencies
  };

  const detected = frameworkPackages
    .filter((framework) => dependencies[framework.packageName] !== undefined)
    .map((framework) => framework.label);

  if (detected.length === 0) {
    return {
      type: 'Node.js',
      detected: ['Node.js']
    };
  }

  return {
    type: ['Node.js', ...detected].join(' / '),
    detected
  };
}
