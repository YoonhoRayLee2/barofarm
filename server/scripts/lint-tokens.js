#!/usr/bin/env node
/**
 * lint-tokens.js — Fresh Field Design System lint
 *
 * Scans all .css and .js files under server/public/web/
 * and reports any raw hex colour or rgb/rgba() literals.
 *
 * Exits with code 1 if any violations are found, 0 otherwise.
 *
 * Usage:
 *   node scripts/lint-tokens.js
 *
 * Excluded files:
 *   - styles/tokens.css (the definition file itself)
 */

'use strict';

const fs   = require('fs');
const path = require('path');

/* ─── Configuration ──────────────────────────────────────────── */

const WEB_DIR = path.resolve(__dirname, '../public/web');

/** Files excluded from linting (relative to WEB_DIR). */
const EXCLUDE = [
  path.join('styles', 'tokens.css'),
];

/**
 * Regex patterns that indicate a raw colour literal.
 *
 * Hex rule: # followed by 3–8 hex digits that are NOT followed by
 *   a hyphen or more word chars (to avoid matching CSS selector IDs
 *   like #fab-option, #color-accent, etc.).
 *   The hex must also be preceded by a non-identifier character
 *   (space, colon, comma, open-paren, or start-of-line).
 */
const PATTERNS = [
  {
    name: 'hex colour',
    // Preceded by CSS value context (colon, space, comma, open-paren)
    // followed by 3, 4, 6, or 8 hex digits then NOT a hyphen or hex digit
    re: /(?<=[:,\s(]|^)#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-fA-F\-_])/,
  },
  {
    name: 'rgb/rgba literal',
    re: /rgba?\(\s*\d+/,
  },
];

/* ─── File walker ────────────────────────────────────────────── */

/**
 * Recursively collect all .css and .js files under `dir`.
 * @param {string} dir
 * @returns {string[]} absolute file paths
 */
function collectFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full));
    } else if (entry.isFile() && /\.(css|js)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

/* ─── Lint runner ────────────────────────────────────────────── */

function main() {
  const files = collectFiles(WEB_DIR);
  const violations = [];

  for (const absPath of files) {
    const rel = path.relative(WEB_DIR, absPath);
    const relNorm = rel.replace(/\\/g, '/');

    // Skip excluded files
    if (EXCLUDE.some(ex => relNorm === ex.replace(/\\/g, '/'))) {
      continue;
    }

    const lines = fs.readFileSync(absPath, 'utf8').split('\n');

    lines.forEach((line, idx) => {
      // Skip comment-only lines (CSS /* */ or JS //)
      const trimmed = line.trimStart();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        return;
      }

      for (const { name, re } of PATTERNS) {
        if (re.test(line)) {
          const match = line.match(re);
          violations.push({
            file: relNorm,
            line: idx + 1,
            type: name,
            match: match ? match[0] : '?',
            content: line.trimEnd(),
          });
        }
      }
    });
  }

  if (violations.length === 0) {
    console.log('[lint-tokens] PASS — 0 hex/rgb literals found.');
    process.exit(0);
  }

  console.error(`[lint-tokens] FAIL — ${violations.length} violation(s) found:\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.type}]  "${v.match}"`);
    console.error(`    ${v.content}`);
  }
  process.exit(1);
}

main();
