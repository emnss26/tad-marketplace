#!/usr/bin/env node
/**
 * Bundle each backend handler into a self-contained Lambda artifact.
 *
 *   backend/handlers/<name>.ts  ->  build/lambdas/<name>/index.mjs
 *
 * Terraform (infra/lambda.tf) zips each directory with archive_file and
 * tracks changes via source_code_hash. Run this BEFORE terraform plan/apply:
 *
 *   npm run build:lambdas
 *
 * Notes:
 * - format=esm + node20: the Lambda runtime is nodejs20.x with handler
 *   "index.handler"; the .mjs extension makes Node treat it as ESM.
 * - @aws-sdk/* stays external: the nodejs20.x runtime ships AWS SDK v3.
 * - The createRequire banner lets any CJS dependency bundled into the ESM
 *   output (e.g. transitive require() calls) resolve at runtime.
 */

import { build } from 'esbuild';
import { rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'build', 'lambdas');

/** Must stay in sync with the `local.handlers` map in infra/lambda.tf. */
const HANDLERS = [
  'auth-magic-link',
  'auth-verify',
  'auth-logout',
  'me',
  'me-licenses',
  'me-seats',
  'checkout-session',
  'checkout-confirm',
  'installer-download',
  'seat-activate',
  'seat-revoke',
  'team-invite',
  'license-cancel',
  'webhook-paypal',
];

await rm(OUT_DIR, { recursive: true, force: true });

const started = Date.now();

await Promise.all(
  HANDLERS.map((name) =>
    build({
      entryPoints: [resolve(ROOT, 'backend', 'handlers', `${name}.ts`)],
      outfile: resolve(OUT_DIR, name, 'index.mjs'),
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: 'esm',
      external: ['@aws-sdk/*'],
      banner: {
        js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
      },
      sourcemap: false,
      minify: false,
      logLevel: 'warning',
    }),
  ),
);

console.log(
  `[build-lambdas] bundled ${HANDLERS.length} handlers into build/lambdas/ in ${Date.now() - started}ms`,
);
