#!/usr/bin/env node
/**
 * fetch-books.js
 *
 * Walks a checked-out copy of the ubiquitous-enigma/sources Obsidian vault,
 * picks up every markdown note tagged with `#book` (in YAML frontmatter or
 * inline body), extracts review metadata, and writes books.json.
 *
 * Run from the website repo with the vault checked out at ./_vault:
 *   VAULT_DIR=./_vault QUARTZ_BASE=https://lakshya-aga.github.io/quartz \
 *     node scripts/fetch-books.js
 */

const fs = require('fs');
const path = require('path');

const VAULT_DIR = process.env.VAULT_DIR || './_vault';
const OUT_PATH = process.env.OUT_PATH || 'books.json';
const QUARTZ_BASE = (process.env.QUARTZ_BASE || 'https://lakshya-aga.github.io/quartz').replace(/\/+$/, '');

// ---------- frontmatter parsing (minimal YAML subset) ----------
function parseFrontmatter(raw) {
  if (!raw.startsWith('---')) return { fm: {}, body: raw };
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return { fm: {}, body: raw };
  const block = raw.slice(3, end).replace(/^\r?\n/, '');
  const body = raw.slice(end + 4).replace(/^\r?\n/, '');
  return { fm: parseYaml(block), body };
}

function parseYaml(block) {
  const out = {};
  const lines = block.split(/\r?\n/);
  let key = null;
  let listAccum = null;

  const finalize = () => {
    if (key && listAccum) {
      out[key] = listAccum;
      listAccum = null;
      key = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const listMatch = line.match(/^\s+-\s+(.*)$/);
    if (listMatch && key) {
      if (!listAccum) listAccum = [];
      listAccum.push(stripQuotes(listMatch[1].trim()));
      continue;
    }

    finalize();
    const kv = line.match(/^([A-Za-z0-9_\-]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    const k = kv[1];
    let v = kv[2].trim();

    if (v === '' || v === '|' || v === '>') {
      key = k;
      listAccum = [];
      continue;
    }

    if (v.startsWith('[') && v.endsWith(']')) {
      const inner = v.slice(1, -1).trim();
      out[k] = inner ? inner.split(',').map(s => stripQuotes(s.trim())).filter(Boolean) : [];
      continue;
    }

    out[k] = stripQuotes(v);
  }
  finalize();
  return out;
}

function stripQuotes(s) {
  if (typeof s !== 'string') return s;
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

// ---------- tag detection ----------
function collectTags(fm, body) {
  const tags = new Set();
  const fmTags = fm.tags || fm.tag;
  if (Array.isArray(fmTags)) {
    fmTags.forEach(t => tags.add(String(t).replace(/^#/, '').trim()));
  } else if (typeof fmTags === 'string') {
    fmTags.split(/[,\s]+/).forEach(t => { if (t) tags.add(t.replace(/^#/, '').trim()); });
  }
  // Inline tags: #book, #book/finance, etc. Avoid markdown headings (#, ##) by requiring word char.
  const inline = body.match(/(?:^|[^\w&])#([A-Za-z][\w/\-]*)/g) || [];
  inline.forEach(m => {
    const t = m.replace(/^[^#]*#/, '');
    tags.add(t);
  });
  return Array.from(tags);
}

function hasBookTag(tags) {
  return tags.some(t => {
    const lower = t.toLowerCase();
    return lower === 'book' || lower.startsWith('book/');
  });
}

// ---------- markdown helpers ----------
function stripMarkdown(s) {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_, p1, p2) => p2 || p1)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstParagraph(body) {
  const cleaned = body
    .split(/\r?\n/)
    .filter(line => !line.trim().startsWith('#'))
    .join('\n')
    .trim();
  const match = cleaned.split(/\n\s*\n/).find(p => p.trim().length > 0);
  if (!match) return '';
  return stripMarkdown(match).slice(0, 360);
}

function firstHeading(body) {
  const m = body.match(/^#\s+(.+)$/m);
  return m ? stripMarkdown(m[1]) : '';
}

function deriveSlug(filePath, vaultDir) {
  const rel = path.relative(vaultDir, filePath).replace(/\\/g, '/');
  return rel.replace(/\.md$/i, '');
}

function quartzUrl(slug) {
  const parts = slug.split('/').map(seg => encodeURIComponent(seg));
  return `${QUARTZ_BASE}/${parts.join('/')}`;
}

// ---------- walk ----------
function walk(dir, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return acc;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, acc);
    } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

// ---------- main ----------
function main() {
  if (!fs.existsSync(VAULT_DIR)) {
    console.error(`Vault directory not found: ${VAULT_DIR}`);
    process.exit(1);
  }

  const files = walk(VAULT_DIR);
  const books = [];

  for (const file of files) {
    let raw;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch (e) {
      console.warn(`Skipping unreadable file ${file}: ${e.message}`);
      continue;
    }

    const { fm, body } = parseFrontmatter(raw);
    const tags = collectTags(fm, body);
    if (!hasBookTag(tags)) continue;

    const fileBase = path.basename(file, path.extname(file));
    const title = fm.title || fm.book || firstHeading(body) || fileBase;
    const slug = deriveSlug(file, VAULT_DIR);
    const stat = fs.statSync(file);

    const summary = fm.summary || fm.description || fm.review || firstParagraph(body);

    books.push({
      title: String(title).trim(),
      author: fm.author || fm.authors || '',
      status: fm.status || '',
      rating: fm.rating || fm.score || '',
      finished: fm.finished || fm.read || fm.completed || fm.date || '',
      started: fm.started || '',
      tags: tags.filter(t => t.toLowerCase() !== 'book' && !t.toLowerCase().startsWith('book/')),
      summary: String(summary || '').trim(),
      slug,
      url: fm.url || quartzUrl(slug),
      updated: stat.mtime.toISOString()
    });
  }

  // Order: reading first, then most recently updated
  const order = { reading: 0, 'in-progress': 0, finished: 1, read: 1, completed: 1, paused: 2, 'to-read': 3, tbr: 3, dropped: 4 };
  books.sort((a, b) => {
    const sa = order[String(a.status).toLowerCase()] ?? 5;
    const sb = order[String(b.status).toLowerCase()] ?? 5;
    if (sa !== sb) return sa - sb;
    return new Date(b.finished || b.updated).getTime() - new Date(a.finished || a.updated).getTime();
  });

  const payload = {
    generated_at: new Date().toISOString(),
    source: 'github.com/ubiquitous-enigma/sources',
    count: books.length,
    books
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${books.length} book reviews to ${OUT_PATH}`);
}

main();
