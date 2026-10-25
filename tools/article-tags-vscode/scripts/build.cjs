const path = require('node:path');
const { build } = require('esbuild');

build({
  entryPoints: [path.join(__dirname, '../src/extension.cjs')],
  outfile: path.join(__dirname, '../dist/extension.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  external: ['vscode'],
  minify: true,
  legalComments: 'eof',
}).catch(() => { process.exitCode = 1; });
