import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const isWatch = process.argv.includes('--watch');
const projectRoot = process.cwd();
const entry = path.join(projectRoot, 'src', 'renderer', 'editor.js');
const outdir = path.join(projectRoot, 'dist', 'renderer');
const outfile = path.join(outdir, 'editor.bundle.js');
const runtimeOutfile = path.join(projectRoot, 'src', 'renderer', 'editor.bundle.js');
const preloadEntry = path.join(projectRoot, 'src', 'preload.js');
const preloadOutfile = path.join(projectRoot, 'dist', 'preload.bundle.cjs');
const preloadRuntimeOutfile = path.join(projectRoot, 'src', 'preload.bundle.cjs');
const require = createRequire(import.meta.url);
const localNodeModules = path.join(projectRoot, 'node_modules');
if (!fsSync.existsSync(localNodeModules)) {
  throw new Error('LOCAL_NODE_MODULES_REQUIRED: run npm ci in this exact checkout');
}
const esbuild = require(require.resolve('esbuild', { paths: [projectRoot] }));

await fs.mkdir(outdir, { recursive: true });

async function copyRuntimeBundle() {
  await fs.mkdir(path.dirname(runtimeOutfile), { recursive: true });
  await fs.copyFile(outfile, runtimeOutfile);
}

async function copyRuntimePreloadBundle() {
  await fs.mkdir(path.dirname(preloadRuntimeOutfile), { recursive: true });
  await fs.copyFile(preloadOutfile, preloadRuntimeOutfile);
}

const buildOptions = {
  entryPoints: [entry],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2018'],
  minify: !isWatch,
  outfile,
  nodePaths: [localNodeModules],
  sourcemap: isWatch ? 'external' : false,
  logLevel: 'info',
  plugins: [
    {
      name: 'runtime-bundle-copy',
      setup(build) {
        build.onEnd(async (result) => {
          if (result.errors.length > 0) {
            return;
          }
          await copyRuntimeBundle();
        });
      }
    }
  ]
};

const preloadBuildOptions = {
  entryPoints: [preloadEntry],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: ['node22'],
  external: ['electron'],
  minify: false,
  outfile: preloadOutfile,
  nodePaths: [localNodeModules],
  sourcemap: isWatch ? 'external' : false,
  logLevel: 'info',
  plugins: [
    {
      name: 'runtime-preload-bundle-copy',
      setup(build) {
        build.onEnd(async (result) => {
          if (result.errors.length > 0) {
            return;
          }
          await copyRuntimePreloadBundle();
        });
      }
    }
  ]
};

if (isWatch) {
  const [rendererContext, preloadContext] = await Promise.all([
    esbuild.context(buildOptions),
    esbuild.context(preloadBuildOptions),
  ]);
  await Promise.all([rendererContext.watch(), preloadContext.watch()]);
  console.log('[renderer] esbuild watch: ON');

  const dispose = () => {
    Promise.all([rendererContext.dispose(), preloadContext.dispose()]).finally(() => process.exit(0));
  };

  process.on('SIGINT', dispose);
  process.on('SIGTERM', dispose);
} else {
  await esbuild.build(preloadBuildOptions);
  await esbuild.build(buildOptions);
}
