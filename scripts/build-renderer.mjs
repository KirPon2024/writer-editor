import * as esbuild from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';

const isWatch = process.argv.includes('--watch');
const projectRoot = process.cwd();
const entry = path.join(projectRoot, 'src', 'renderer', 'editor.js');
const outdir = path.join(projectRoot, 'dist', 'renderer');
const outfile = path.join(outdir, 'editor.bundle.js');

await fs.mkdir(outdir, { recursive: true });

const buildOptions = {
  entryPoints: [entry],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2018'],
  outfile,
  sourcemap: isWatch ? 'external' : false,
  logLevel: 'info'
};

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('[renderer] esbuild watch: ON');

  const dispose = () => {
    ctx.dispose().finally(() => process.exit(0));
  };

  process.on('SIGINT', dispose);
  process.on('SIGTERM', dispose);
} else {
  await esbuild.build(buildOptions);
}
