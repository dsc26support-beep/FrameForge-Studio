// Lightweight secret scan over tracked files. Complements (does not replace) GitHub secret scanning / gitleaks.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const rules = [
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ['Slack token', /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/],
  ['Google OAuth client id', /\b\d{8,}-[a-z0-9]{20,}\.apps\.googleusercontent\.com\b/],
  ['Anthropic/OpenAI style key', /\bsk-(?:ant-)?[A-Za-z0-9_-]{32,}\b/],
  ['Hard-coded password assignment', /\b(?:password|passwd|secret|api[_-]?key)\s*[:=]\s*['"][^'"\s]{8,}['"]/i],
];
const skip = /(^|\/)(package-lock\.json|scan-secrets\.mjs)$|\.(png|jpg|mp4|zip|ffproj|ico)$/;
let hits = 0;
for (const f of files) {
  if (skip.test(f)) continue;
  let text;
  try {
    text = readFileSync(f, 'utf8');
  } catch {
    continue;
  }
  for (const [name, re] of rules) {
    const m = re.exec(text);
    if (m) {
      hits++;
      console.error(`Possible ${name} in ${f}: ${m[0].slice(0, 12)}...`);
    }
  }
}
if (hits) {
  console.error(`\n${hits} possible secret(s) found. Remove them and rotate the credential.`);
  process.exit(1);
}
console.log(`Secret scan clean (${files.length} files checked).`);
