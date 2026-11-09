#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Prefer dist/cli.js if built, otherwise load src/cli.ts using node's type stripping
const distCli = path.join(__dirname, '..', 'dist', 'cli.js');
const srcCli = path.join(__dirname, '..', 'src', 'cli.ts');

async function main() {
  if (fs.existsSync(distCli)) {
    const { createCli } = await import(distCli);
    await createCli().parseAsync(process.argv);
  } else {
    const { createCli } = await import(srcCli);
    await createCli().parseAsync(process.argv);
  }
}

main().catch((err) => {
  console.error('\nFatal error in agent-quality:\n', err);
  process.exit(1);
});
