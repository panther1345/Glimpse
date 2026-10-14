import { build } from 'esbuild';
for (const n of ['launcher', 'selection', 'overlay', 'popup'])
  await build({ entryPoints: [`src/content/${n}.ts${n === 'popup' ? 'x' : ''}`], bundle: true, format: 'iife', outfile: `dist/content/${n}.js`, target: 'chrome114', minify: true, jsx: 'automatic', loader: { '.tsx': 'tsx' }, define: { 'process.env.NODE_ENV': '"production"' } });
console.log('content scripts built');
