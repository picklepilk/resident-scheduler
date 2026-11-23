// Usage: node scripts/rule-clarifications.mjs <backup.json> [--md out.md]
// Reads a Settings backup ({data:{res_app_settings: <json string|object>}}) and prints the chief's
// rule-clarification answers as markdown (pure lib only; no app import).
import fs from 'node:fs';
import { mergeSeeds, buildAnswersMarkdown } from '../src/lib/ruleClarifications.js';

const unwrap = v => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return v; } };
const argv = process.argv.slice(2).filter(x => x !== '--');
let mdOut = null; const files = [];
for (let i = 0; i < argv.length; i++) { if (argv[i] === '--md') mdOut = argv[++i]; else files.push(argv[i]); }
if (!files[0]) { console.error('usage: node scripts/rule-clarifications.mjs <backup.json> [--md out.md]'); process.exit(1); }
const parsed = JSON.parse(fs.readFileSync(files[0], 'utf-8'));
const d = parsed.data || parsed;
const settings = unwrap(d.res_app_settings) || {};
const md = buildAnswersMarkdown(mergeSeeds(settings.ruleClarifications).items);
if (mdOut) { fs.writeFileSync(mdOut, md); console.error(`wrote ${mdOut}`); } else process.stdout.write(md);
