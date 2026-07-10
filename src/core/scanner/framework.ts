import type { FrameworkInfo, PackageJsonInfo } from '../types.js';

/**
 * Ordered from most to least meaningful: meta-frameworks and app platforms
 * first, then UI libraries, servers, and tooling. The order controls how the
 * summary "type" string reads.
 */
const frameworkPackages: Array<{ packageName: string; label: string }> = [
  { packageName: 'next', label: 'Next.js' },
  { packageName: 'nuxt', label: 'Nuxt' },
  { packageName: '@sveltejs/kit', label: 'SvelteKit' },
  { packageName: '@remix-run/react', label: 'Remix' },
  { packageName: 'astro', label: 'Astro' },
  { packageName: 'gatsby', label: 'Gatsby' },
  { packageName: '@docusaurus/core', label: 'Docusaurus' },
  { packageName: '@redwoodjs/core', label: 'RedwoodJS' },
  { packageName: 'expo', label: 'Expo' },
  { packageName: 'react-native', label: 'React Native' },
  { packageName: 'electron', label: 'Electron' },
  { packageName: '@tauri-apps/cli', label: 'Tauri' },
  { packageName: '@angular/core', label: 'Angular' },
  { packageName: '@nestjs/core', label: 'NestJS' },
  { packageName: '@adonisjs/core', label: 'AdonisJS' },
  { packageName: 'vue', label: 'Vue' },
  { packageName: 'svelte', label: 'Svelte' },
  { packageName: 'solid-js', label: 'Solid' },
  { packageName: '@builder.io/qwik', label: 'Qwik' },
  { packageName: 'preact', label: 'Preact' },
  { packageName: 'lit', label: 'Lit' },
  { packageName: 'ember-source', label: 'Ember' },
  { packageName: '@11ty/eleventy', label: 'Eleventy' },
  { packageName: 'vitepress', label: 'VitePress' },
  { packageName: '@strapi/strapi', label: 'Strapi' },
  { packageName: 'payload', label: 'Payload' },
  { packageName: 'express', label: 'Express' },
  { packageName: 'fastify', label: 'Fastify' },
  { packageName: 'koa', label: 'Koa' },
  { packageName: '@hapi/hapi', label: 'hapi' },
  { packageName: 'hono', label: 'Hono' },
  { packageName: '@trpc/server', label: 'tRPC' },
  { packageName: 'vite', label: 'Vite' },
  { packageName: 'prisma', label: 'Prisma' },
  { packageName: 'drizzle-orm', label: 'Drizzle' },
  { packageName: 'storybook', label: 'Storybook' },
  { packageName: 'tailwindcss', label: 'Tailwind CSS' }
];

/** How many detected frameworks the summary "type" string includes. */
const TYPE_SUMMARY_LIMIT = 3;

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
    type: ['Node.js', ...detected.slice(0, TYPE_SUMMARY_LIMIT)].join(' / '),
    detected
  };
}
