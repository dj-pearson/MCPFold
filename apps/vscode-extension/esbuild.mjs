// Bundle the extension for the VS Code extension host (CommonJS, `vscode` kept external).
import { build, context } from 'esbuild';

const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: !process.argv.includes('--minify'),
  minify: process.argv.includes('--minify'),
  logLevel: 'info',
};

if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('[mcpfold] watching for changes…');
} else {
  await build(options);
  console.log('[mcpfold] build complete → dist/extension.js');
}
