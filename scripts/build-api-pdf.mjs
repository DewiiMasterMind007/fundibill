// Compiles src/pdf/PdfDocument.jsx (JSX syntax) into plain ESM JavaScript at
// api/_lib/PdfDocument.mjs, for api/generate-invoice-pdf.js to import.
//
// Why this is needed: Vercel's Node function builder only transpiles the
// entry file of each function (api/*.js) — it does NOT run a JSX/TS
// transform on files that entry file merely imports. A raw .jsx file
// reaching the deployed function untouched fails at runtime with either
// "Cannot use import statement outside a module" (static import, since
// package.json has no "type": "module") or "Unknown file extension .jsx"
// (dynamic import — Node doesn't recognize .jsx as a loadable extension at
// all). Pre-compiling to plain .mjs (JSX already stripped to
// React.createElement calls, and .mjs is unambiguously ESM to Node
// regardless of package.json) sidesteps both. `react` and `@react-pdf/renderer`
// are left as real import statements (not bundled) so they resolve normally
// against node_modules at runtime, same as everywhere else.
//
// Run via `npm run build:api-pdf` (wired into the "vercel-build" script —
// Vercel runs that instead of "build" when present). Re-run manually any
// time src/pdf/PdfDocument.jsx changes and you want to test the API route
// locally without a full Vercel build.

import { transform } from 'esbuild'
import { readFileSync, mkdirSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const srcPath = path.join(__dirname, '../src/pdf/PdfDocument.jsx')
const outDir  = path.join(__dirname, '../api/_lib')
const outPath = path.join(outDir, 'PdfDocument.mjs')

const source = readFileSync(srcPath, 'utf8')
const result = await transform(source, {
  loader: 'jsx',
  format: 'esm',
  target: 'node18',
})

mkdirSync(outDir, { recursive: true })
writeFileSync(outPath, result.code)

console.log(`[build-api-pdf] compiled ${srcPath} -> ${outPath}`)
