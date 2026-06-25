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
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_, p1, p2) => p2 || p1.split('/').pop())
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanField(s) {
  if (!s) return '';
  return String(s)
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_, p1, p2) => p2 || p1.split('/').pop())
    .replace(/(?:^|\s)#[A-Za-z][\w/\-]*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Parse the Obsidian inline-meta head: leading `Key: value` lines terminated by
// `---` or a blank line followed by non key:value content. Returns the parsed
// fields and the remaining body (review content).
function parseInlineMeta(body) {
  const meta = {};
  const lines = body.split(/\r?\n/);
  let i = 0;
  let sawAny = false;
  for (; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '---') { i++; break; }
    if (!trimmed) {
      if (sawAny) { i++; break; }
      continue;
    }
    const m = trimmed.match(/^([A-Za-z][A-Za-z0-9_ \-]*?)\s*:\s*(.*)$/);
    if (!m) break;
    meta[m[1].trim().toLowerCase()] = m[2].trim();
    sawAny = true;
  }
  // Skip any trailing blank lines or `---` separator that follow the meta head.
  while (i < lines.length) {
    const t = lines[i].trim();
    if (t === '' || t === '---') { i++; continue; }
    break;
  }
  const rest = lines.slice(i).join('\n');
  return { meta: sawAny ? meta : {}, rest: sawAny ? rest : body };
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

function splitTopicList(s) {
  if (!s) return [];
  // Split on commas not inside `[[...]]` brackets.
  const out = [];
  let depth = 0;
  let buf = '';
  for (const ch of String(s)) {
    if (ch === '[') depth++;
    else if (ch === ']') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      const v = cleanField(buf);
      if (v) out.push(v);
      buf = '';
    } else {
      buf += ch;
    }
  }
  const tail = cleanField(buf);
  if (tail) out.push(tail);
  return out;
}

function deriveSlug(filePath) {
  return path.basename(filePath, path.extname(filePath));
}

function quartzUrl(slug) {
  // Quartz serves notes at hyphenated basenames; folder structure is stripped.
  const base = slug.split('/').pop().trim().replace(/\s+/g, '-');
  return `${QUARTZ_BASE}/${encodeURIComponent(base).replace(/%2D/g, '-')}`;
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
    // Skip dotfiles and Obsidian system folders (_templates, _attachments, _scripts).
    if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
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
    const { meta: inline, rest: reviewBody } = parseInlineMeta(body);
    const tags = collectTags(fm, body);
    // Inline `Type: #source #book` may not have been picked up if collectTags
    // missed the leading-line case — re-scan inline meta values for #tags.
    if (inline.type) {
      String(inline.type).split(/\s+/).forEach(tok => {
        if (tok.startsWith('#')) tags.push(tok.slice(1));
      });
    }
    splitTopicList(inline.topics).forEach(t => { if (t) tags.push(t); });
    const dedupedTags = Array.from(new Set(tags.map(t => t.trim()).filter(Boolean)));
    if (!hasBookTag(dedupedTags)) continue;

    const fileBase = path.basename(file, path.extname(file));
    const title = fm.title || fm.book || fileBase;
    const slug = deriveSlug(file);
    const stat = fs.statSync(file);

    const summary = fm.summary || fm.description || fm.review || firstParagraph(reviewBody);

    books.push({
      title: String(title).trim(),
      author: cleanField(fm.author || fm.authors || inline.author || ''),
      status: fm.status || inline.status || '',
      rating: fm.rating || fm.score || inline.rating || '',
      finished: fm.finished || fm.read || fm.completed || fm.date || inline.finished || '',
      started: fm.started || inline.started || '',
      tags: dedupedTags.filter(t => t.toLowerCase() !== 'book' && !t.toLowerCase().startsWith('book/')),
      summary: String(summary || '').trim(),
      slug,
      url: fm.url || inline.link || quartzUrl(slug),
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
    source: 'github.com/lakshya-aga/ubiquitous-enigma',
    count: books.length,
    books
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${books.length} book reviews to ${OUT_PATH}`);
}

main();
