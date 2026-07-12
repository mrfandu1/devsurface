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
  { packageName: 'react-router-dom', label: 'React Router' },
  { packageName: '@tanstack/react-router', label: 'TanStack Router' },
  { packageName: '@tanstack/react-query', label: 'TanStack Query' },
  { packageName: '@reduxjs/toolkit', label: 'Redux Toolkit' },
  { packageName: 'redux', label: 'Redux' },
  { packageName: 'zustand', label: 'Zustand' },
  { packageName: 'jotai', label: 'Jotai' },
  { packageName: 'mobx', label: 'MobX' },
  { packageName: 'rxjs', label: 'RxJS' },
  { packageName: 'graphql', label: 'GraphQL' },
  { packageName: '@apollo/client', label: 'Apollo' },
  { packageName: 'apollo-server', label: 'Apollo Server' },
  { packageName: 'socket.io', label: 'Socket.IO' },
  { packageName: 'mongoose', label: 'Mongoose (MongoDB)' },
  { packageName: 'sequelize', label: 'Sequelize' },
  { packageName: 'typeorm', label: 'TypeORM' },
  { packageName: 'knex', label: 'Knex' },
  { packageName: 'kysely', label: 'Kysely' },
  { packageName: '@supabase/supabase-js', label: 'Supabase' },
  { packageName: 'firebase', label: 'Firebase' },
  { packageName: 'convex', label: 'Convex' },
  { packageName: 'stripe', label: 'Stripe' },
  { packageName: 'openai', label: 'OpenAI SDK' },
  { packageName: '@anthropic-ai/sdk', label: 'Anthropic SDK' },
  { packageName: '@ai-sdk/react', label: 'Vercel AI SDK' },
  { packageName: 'ai', label: 'Vercel AI SDK' },
  { packageName: 'langchain', label: 'LangChain' },
  { packageName: 'three', label: 'Three.js' },
  { packageName: 'd3', label: 'D3' },
  { packageName: 'chart.js', label: 'Chart.js' },
  { packageName: 'recharts', label: 'Recharts' },
  { packageName: 'framer-motion', label: 'Framer Motion' },
  { packageName: '@mui/material', label: 'Material UI' },
  { packageName: '@chakra-ui/react', label: 'Chakra UI' },
  { packageName: '@mantine/core', label: 'Mantine' },
  { packageName: 'antd', label: 'Ant Design' },
  { packageName: 'bootstrap', label: 'Bootstrap' },
  { packageName: 'styled-components', label: 'styled-components' },
  { packageName: '@emotion/react', label: 'Emotion' },
  { packageName: 'sass', label: 'Sass' },
  { packageName: 'next-auth', label: 'NextAuth' },
  { packageName: '@clerk/nextjs', label: 'Clerk' },
  { packageName: 'passport', label: 'Passport' },
  { packageName: 'bullmq', label: 'BullMQ (job queue)' },
  { packageName: 'ioredis', label: 'Redis client' },
  { packageName: 'pg', label: 'PostgreSQL client' },
  { packageName: 'mysql2', label: 'MySQL client' },
  { packageName: 'better-sqlite3', label: 'SQLite' },
  { packageName: 'puppeteer', label: 'Puppeteer' },
  { packageName: 'discord.js', label: 'Discord.js' },
  { packageName: 'telegraf', label: 'Telegram bot' },
  { packageName: 'commander', label: 'Commander (CLI)' },
  { packageName: 'yargs', label: 'yargs (CLI)' },
  { packageName: 'ink', label: 'Ink (terminal UI)' },
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

  const detected = [
    ...new Set(
      frameworkPackages
        .filter((framework) => dependencies[framework.packageName] !== undefined)
        .map((framework) => framework.label)
    )
  ];

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
