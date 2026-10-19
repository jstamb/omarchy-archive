/// <reference types="astro/client" />

type Runtime = import('@astrojs/cloudflare').Runtime<import('./lib/db').Env>;

declare namespace App {
  interface Locals extends Runtime {}
}

declare const __BUILD_ID__: string;
