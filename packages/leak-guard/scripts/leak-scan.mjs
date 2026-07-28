#!/usr/bin/env node
// Structural leak guard: a fast, dependency-free grep over tracked source for the
// high-risk patterns that open a plaintext-escape path. Known-safe matches live in
// leak-scan-allowlist.json with a written reason, so a NEW match fails CI until a human classifies
// it. This complements the property/canary tests (which prove behavior) with a static gate that
// needs no imports and spans files the tests never load.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = join(HERE, '..', '..', '..');
const DEFAULT_ALLOWLIST_PATH = join(HERE, '..', 'leak-scan-allowlist.json');

function parseArgs(argv) {
  let scanRoot = DEFAULT_REPO_ROOT;
  let allowlistPath = DEFAULT_ALLOWLIST_PATH;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--root' && argv[i + 1]) {
      scanRoot = argv[++i];
    } else if (argv[i] === '--allowlist' && argv[i + 1]) {
      allowlistPath = argv[++i];
    }
  }
  return { scanRoot, allowlistPath };
}

// Content-derived identifiers that must never flow into a log line, a cache value, or a wire field.
const CONTENT_IDENTS = String.raw`plaintext|decrypted|clearText|cleartext|factBody|wikiText|rawBody|bodyText|messageText`;
const PROSE_FIELD_NAMES = String.raw`body|content|text|summary|description|prompt|message|snippet|excerpt`;

const RULES = [
  {
    id: 'cache-content-value',
    description: 'cache.set() with a value derived from decrypted content',
    include: /\.(ts|tsx)$/,
    pattern: new RegExp(String.raw`\.set\(\s*[^,]+,\s*[^)]*\b(?:${CONTENT_IDENTS})\b`),
  },
  {
    id: 'logger-content-arg',
    description: 'logger/console call carrying a decrypted-content identifier',
    include: /\.(ts|tsx)$/,
    pattern: new RegExp(
      String.raw`(?:logger|log|console)\.(?:trace|debug|info|warn|error|fatal)\([^)]*\b(?:${CONTENT_IDENTS})\b`,
    ),
  },
  {
    id: 'wire-prose-string-field',
    description: 'prose-named z.string() field in a shared wire contract (potential plaintext channel)',
    include: /packages\/contracts\/src\/.*\.ts$/,
    pattern: new RegExp(String.raw`^\s*(?:${PROSE_FIELD_NAMES})\s*:\s*z\.string\(`, 'i'),
  },
  {
    // The export payload is the first sanctioned content-egress surface: the ENTIRE
    // ProjectedPage/PortableBlock leaves the trust boundary, so every string-leaf field — not just
    // prose-named ones — must be consciously classified in the allowlist. A new field trips CI.
    id: 'export-payload-string-field',
    description: 'any string-leaf field in the wiki-export egress contract',
    include: /packages\/contracts\/src\/wiki-export\.ts$/,
    pattern: /^\s*\w+\s*:\s*z\.[^,]*string\(/,
  },
  {
    id: 'telemetry-content-property',
    description: 'telemetry track() property object with a prose-named key',
    include: /\.(ts|tsx)$/,
    pattern: new RegExp(String.raw`\.track\([^)]*\b(?:${PROSE_FIELD_NAMES})\s*:`),
  },
];

function trackedFiles(scanRoot) {
  if (scanRoot === DEFAULT_REPO_ROOT) {
    const out = execFileSync('git', ['ls-files'], { cwd: scanRoot, encoding: 'utf8' });
    return out.split('\n').filter(Boolean);
  }
  const out = execFileSync('find', [scanRoot, '-type', 'f'], { encoding: 'utf8' });
  return out
    .split('\n')
    .filter(Boolean)
    .map((abs) => relative(scanRoot, abs))
    .filter((rel) => !rel.startsWith('.git/'));
}

function loadAllowlist(allowlistPath) {
  if (!existsSync(allowlistPath)) return new Set();
  const entries = JSON.parse(readFileSync(allowlistPath, 'utf8'));
  return new Set(entries.map((e) => `${e.rule}::${e.path}::${e.match}`));
}

function scanFile(scanRoot, path, rules) {
  const abs = join(scanRoot, path);
  let source;
  try {
    source = readFileSync(abs, 'utf8');
  } catch {
    return [];
  }
  const findings = [];
  const lines = source.split('\n');
  for (const rule of rules) {
    if (!rule.include.test(path)) continue;
    lines.forEach((line, i) => {
      if (rule.pattern.test(line)) {
        findings.push({ rule: rule.id, path, line: i + 1, match: line.trim().slice(0, 200) });
      }
    });
  }
  return findings;
}

function main() {
  const { scanRoot, allowlistPath } = parseArgs(process.argv);
  const allowlist = loadAllowlist(allowlistPath);
  const files = trackedFiles(scanRoot).filter((f) => !f.includes('packages/leak-guard/'));
  const findings = [];
  for (const file of files) {
    for (const finding of scanFile(scanRoot, file, RULES)) {
      const key = `${finding.rule}::${finding.path}::${finding.match}`;
      if (!allowlist.has(key)) findings.push(finding);
    }
  }

  if (findings.length === 0) {
    console.log('leak-scan: clean — no unreviewed plaintext-escape patterns.');
    return;
  }

  console.error(`leak-scan: ${findings.length} unreviewed finding(s):\n`);
  for (const f of findings) {
    console.error(`  [${f.rule}] ${relative('.', f.path)}:${f.line}\n    ${f.match}`);
  }
  console.error(
    '\nEach finding is a potential plaintext escape. If it is genuinely content-free, add it to\n' +
      `packages/leak-guard/leak-scan-allowlist.json with a { rule, path, match, reason } entry.\n`,
  );
  process.exit(1);
}

main();
