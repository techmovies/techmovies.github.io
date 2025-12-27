import fs from 'node:fs/promises';
import path from 'node:path';
import { minify } from 'terser';
import JavaScriptObfuscator from 'javascript-obfuscator';
import CleanCSS from 'clean-css';

const root = process.cwd();

const inJs = path.join(root, 'script.js');
const inCss = path.join(root, 'styles.css');
const outJs = path.join(root, 'script.min.js');
const outCss = path.join(root, 'styles.min.css');

async function buildJs() {
  const js = await fs.readFile(inJs, 'utf8');

  const min = await minify(js, {
    compress: true,
    mangle: true,
    format: {
      comments: false
    }
  });

  if (!min || !min.code) {
    throw new Error('Terser failed to produce output');
  }

  const obfuscated = JavaScriptObfuscator.obfuscate(min.code, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.7,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.35,
    stringArray: true,
    stringArrayThreshold: 0.75,
    rotateStringArray: true,
    selfDefending: true,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 10,
    unicodeEscapeSequence: false
  }).getObfuscatedCode();

  await fs.writeFile(outJs, obfuscated, 'utf8');
}

async function buildCss() {
  const css = await fs.readFile(inCss, 'utf8');
  const out = new CleanCSS({ level: 2 }).minify(css);
  if (out.errors && out.errors.length) {
    throw new Error(out.errors.join('\n'));
  }
  await fs.writeFile(outCss, out.styles, 'utf8');
}

await buildJs();
await buildCss();

console.log('Built:', path.basename(outJs), 'and', path.basename(outCss));
