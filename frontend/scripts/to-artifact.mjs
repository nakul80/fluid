// Turns dist-single/index.html into a body-only page for publishing as a claude.ai Artifact
// (the host adds its own <!doctype>/<head>/<body> skeleton).
import { readFileSync, writeFileSync } from 'node:fs';
const [src, dest] = process.argv.slice(2);
const html = readFileSync(src, 'utf8');
const pick = (re) => [...html.matchAll(re)].map((m) => m[0]).join('\n');
const title = pick(/<title>[\s\S]*?<\/title>/g);
const styles = pick(/<style[\s\S]*?<\/style>/g);
const scripts = pick(/<script[\s\S]*?<\/script>/g);
writeFileSync(dest, `${title}\n${styles}\n<div id="root"></div>\n${scripts}\n`);
console.log('wrote', dest, Math.round(readFileSync(dest).length / 1024) + ' KB');
