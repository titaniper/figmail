import esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const watch = process.argv.includes('--watch');
mkdirSync('dist', { recursive: true });

const shared = {
  bundle: true,
  target: 'es2017',
  format: 'iife',
  logLevel: 'info',
};

// Main thread (plugin sandbox): traverses the Figma document, builds the IR.
const mainCtx = await esbuild.context({
  ...shared,
  entryPoints: ['src/main/code.ts'],
  outfile: 'dist/code.js',
});

// UI (iframe): receives the IR, renders MJML -> HTML, previews, copies, downloads.
// esbuild produces the JS in memory; we inline it into ui.html so the whole UI
// ships as a single self-contained file (required by Figma).
const inlineHtml = {
  name: 'inline-html',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length) return;
      const js = result.outputFiles.find((f) => f.path.endsWith('.js')).text;
      const template = readFileSync('src/ui/ui.html', 'utf8');
      writeFileSync('dist/ui.html', template.replace('/*__INLINE_JS__*/', () => js));
      console.log('inlined dist/ui.html');
    });
  },
};

const uiCtx = await esbuild.context({
  ...shared,
  entryPoints: ['src/ui/ui.ts'],
  write: false,
  outdir: 'dist-ui-tmp',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [inlineHtml],
});

if (watch) {
  await mainCtx.watch();
  await uiCtx.watch();
  console.log('watching for changes…');
} else {
  await mainCtx.rebuild();
  await uiCtx.rebuild();
  await mainCtx.dispose();
  await uiCtx.dispose();
}
