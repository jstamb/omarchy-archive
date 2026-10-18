// Worker entry: images straight from R2, everything else through Astro.
import type { ExecutionContext } from '@cloudflare/workers-types';
import type { SSRManifest } from 'astro';
import { App } from 'astro/app';
import { handle } from '@astrojs/cloudflare/handler';
import type { Env } from '../lib/db';
import { serveImage } from './images';

export function createExports(manifest: SSRManifest) {
  const app = new App(manifest);
  return {
    default: {
      async fetch(request: unknown, env: Env, ctx: ExecutionContext) {
        if (new URL((request as Request).url).pathname.startsWith('/images/')) return serveImage(request as never, env.IMAGES, ctx) as never;
        return handle(manifest, app, request as never, env as never, ctx as never);
      },
    },
  };
}
