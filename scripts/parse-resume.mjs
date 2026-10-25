#!/usr/bin/env node
// Parses resume.tex (RenderCV 1.x, sb2nov theme, hand-edited) into src/data/resume.json.
//
// This reads the structure RenderCV emits, not general LaTeX. Anything unrecognised inside a
// section it reads is a hard error with the .tex line number: a half-parsed resume is never written.
//
// Source, first that exists: $RESUME_PATH, .resume/resume.tex (CI checkout), ../resume-latex/resume.tex.

import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export class ResumeParseError extends Error {
  constructor(message, line) {
    super(line ? `resume.tex line ${line}: ${message}` : message);
    this.line = line;
  }
}

const fail = (message, line) => {
  throw new ResumeParseError(message, line);
};

// ---------- inline text ----------

// Rich text is an array of segments: { text, bold?, href? }.
const LITERAL_ESCAPES = { '&': '&', '%': '%', '#': '#', $: '$', _: '_', '{': '{', '}': '}', ' ': ' ', ',': ' ' };

function readGroup(src, i, line) {
  if (src[i] !== '{') fail(`expected "{" in: ${src.trim()}`, line);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '\\') {
      j++;
      continue;
    }
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return [src.slice(i + 1, j), j + 1];
  }
  fail(`unbalanced braces in: ${src.trim()}`, line);
}

function skipSpaces(src, i) {
  while (src[i] === ' ') i++;
  return i;
}

export function parseInline(src, line, fmt = {}) {
  const out = [];
  const push = (text) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.bold === fmt.bold && last.href === fmt.href) last.text += text;
    else out.push({ text, ...(fmt.bold && { bold: true }), ...(fmt.href && { href: fmt.href }) });
  };
  const pushAll = (segments) => {
    for (const s of segments) {
      const last = out[out.length - 1];
      if (last && last.bold === s.bold && last.href === s.href) last.text += s.text;
      else out.push({ ...s });
    }
  };

  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\') {
      const next = src[i + 1];
      if (next in LITERAL_ESCAPES) {
        push(LITERAL_ESCAPES[next]);
        i += 2;
        continue;
      }
      if (next === '\\') {
        push(' ');
        i += 2;
        continue;
      }
      const m = /^[a-zA-Z]+\*?/.exec(src.slice(i + 1));
      if (!m) fail(`unrecognised escape "\\${next ?? ''}"`, line);
      const cmd = m[0];
      i = skipSpaces(src, i + 1 + cmd.length);
      if (cmd === 'textbf') {
        const [arg, end] = readGroup(src, i, line);
        pushAll(parseInline(arg, line, { ...fmt, bold: true }));
        i = end;
      } else if (cmd === 'textit' || cmd === 'emph' || cmd === 'mbox') {
        const [arg, end] = readGroup(src, i, line);
        pushAll(parseInline(arg, line, fmt));
        i = end;
      } else if (cmd === 'href' || cmd === 'hrefWithoutArrow') {
        const [url, afterUrl] = readGroup(src, i, line);
        const [label, end] = readGroup(src, skipSpaces(src, afterUrl), line);
        if (!/^(https?:|mailto:)/.test(url)) fail(`link with unsupported scheme: ${url}`, line);
        pushAll(parseInline(label, line, { ...fmt, href: url }));
        i = end;
      } else if (cmd === 'color') {
        i = readGroup(src, i, line)[1];
      } else {
        fail(`unrecognised command "\\${cmd}"`, line);
      }
      continue;
    }
    if (ch === '{') {
      const [arg, end] = readGroup(src, i, line);
      pushAll(parseInline(arg, line, fmt));
      i = end;
      continue;
    }
    if (ch === '}') fail('unbalanced "}"', line);
    if (ch === '$') fail('math mode is not supported', line);
    if (ch === '%') break; // comment to end of line
    if (src.startsWith('---', i)) {
      push('—');
      i += 3;
    } else if (src.startsWith('--', i)) {
      push('–');
      i += 2;
    } else if (src.startsWith('``', i)) {
      push('“');
      i += 2;
    } else if (src.startsWith("''", i)) {
      push('”');
      i += 2;
    } else if (ch === '~') {
      push(' ');
      i++;
    } else {
      push(ch);
      i++;
    }
  }
  return out;
}

function tidy(segments) {
  const out = segments
    .map((s) => ({ ...s, text: s.text.replace(/\s+/g, ' ') }))
    .filter((s) => s.text !== '');
  if (out.length) {
    out[0].text = out[0].text.trimStart();
    out[out.length - 1].text = out[out.length - 1].text.trimEnd();
  }
  return out.filter((s) => s.text !== '');
}

export const plain = (segments) => segments.map((s) => s.text).join('');

// ---------- dates ----------

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function parseDate(text, line) {
  const t = text.trim();
  if (/^(present|now|current)$/i.test(t)) return null;
  let m = /^([A-Za-z]+)\.? (\d{4})$/.exec(t);
  if (m) {
    const idx = MONTHS.findIndex((name) => name.startsWith(m[1].toLowerCase()) && m[1].length >= 3);
    if (idx < 0) fail(`unrecognised month "${m[1]}"`, line);
    return `${m[2]}-${String(idx + 1).padStart(2, '0')}`;
  }
  m = /^(\d{4})$/.exec(t);
  if (m) return m[1];
  fail(`unrecognised date "${t}"`, line);
}

function parseRange(text, line) {
  const parts = text.split(/\s+[-–—]+\s+/);
  if (parts.length !== 2) fail(`expected a date range like "May 2018 - Present", got "${text.trim()}"`, line);
  return { start: parseDate(parts[0], line), end: parseDate(parts[1], line) };
}

// ---------- document structure ----------

const IGNORABLE = /^\s*(%.*)?$|^\s*\\(vspace|medskip|smallskip|bigskip)\b.*$/;

function gatherBraced(lines, startIdx, startCol) {
  // Returns [content, lastLineIdx, restOfLastLine] for a {...} that may span lines.
  let text = '';
  for (let k = startIdx; k < lines.length; k++) {
    const piece = k === startIdx ? lines[k].text.slice(startCol) : lines[k].text;
    text += (k === startIdx ? '' : '\n') + piece;
    let depth = 0;
    let begun = false;
    for (let j = 0; j < text.length; j++) {
      if (text[j] === '\\') {
        j++;
        continue;
      }
      if (text[j] === '{') {
        depth++;
        begun = true;
      } else if (text[j] === '}' && --depth === 0 && begun) {
        const firstBrace = text.indexOf('{');
        if (text.slice(0, firstBrace).trim()) fail('unexpected text before "{"', lines[startIdx].no);
        return [text.slice(firstBrace + 1, j), k, text.slice(j + 1)];
      }
    }
  }
  fail('unterminated "{"', lines[startIdx].no);
}

function parseHeader(lines, basics) {
  for (const { text, no } of lines) {
    const t = text.trim();
    if (IGNORABLE.test(t) || /^\\(normalsize|kern [\d.]+ cm%?|AND%?)$/.test(t)) continue;
    let m = /^\\textbf\{\\fontsize\{[^}]*\}\{[^}]*\}\\selectfont (.+)\}$/.exec(t);
    if (m) {
      basics.name = plain(tidy(parseInline(m[1], no)));
      continue;
    }
    if (!t.startsWith('\\mbox{')) fail(`unrecognised header line: ${t}`, no);
    if (t.includes('tel:') || t.includes('\\faPhone')) continue; // privacy: phone numbers are never read
    if (t.includes('\\faMapMarker')) {
      m = /\\hspace\*\{[^}]*\}([^{}\\]+)\}%?$/.exec(t);
      if (!m) fail('could not read the city', no);
      basics.city = m[1].trim();
      continue;
    }
    m = /\\hrefWithoutArrow\{([^}]+)\}/.exec(t);
    if (!m) fail(`unrecognised header entry: ${t}`, no);
    const url = m[1];
    if (url.startsWith('mailto:')) basics.email = url.slice('mailto:'.length);
    else if (/^https:\/\/(www\.)?linkedin\.com\//.test(url)) basics.linkedin = url;
    else if (/^https:\/\//.test(url)) basics.website = url.replace(/(?<!:)\/{2,}/g, '/');
    else fail(`unrecognised header link: ${url}`, no);
  }
}

// One \begin{onecolentry}...\end{onecolentry} → { paragraphs: [rich], highlights: [rich] }.
function parseOneCol(lines) {
  const paragraphs = [];
  const highlights = [];
  let para = null; // { src, no }
  let item = null;
  let inHighlights = false;
  const flushPara = () => {
    if (para) paragraphs.push(tidy(parseInline(para.src, para.no)));
    para = null;
  };
  const flushItem = () => {
    if (item) highlights.push(tidy(parseInline(item.src, item.no)));
    item = null;
  };
  for (const { text, no } of lines) {
    const t = text.trim();
    if (/^\\begin\{highlights(forbulletentries)?\}$/.test(t)) {
      if (inHighlights) fail('nested highlights', no);
      flushPara();
      inHighlights = true;
      continue;
    }
    if (/^\\end\{highlights(forbulletentries)?\}$/.test(t)) {
      if (!inHighlights) fail('\\end{highlights} without \\begin', no);
      flushPara();
      flushItem();
      inHighlights = false;
      continue;
    }
    if (IGNORABLE.test(t)) {
      // A blank line ends the current paragraph or item.
      flushPara();
      flushItem();
      continue;
    }
    if (/^\\(begin|end)\{/.test(t)) fail(`unexpected environment: ${t}`, no);
    if (inHighlights && t.startsWith('\\item')) {
      flushPara();
      flushItem();
      item = { src: t.replace(/^\\item\s*/, ''), no };
      continue;
    }
    if (item) {
      item.src += ' ' + t; // continuation of the current \item
      continue;
    }
    // Plain text, either in the entry or inside highlights without \item: a paragraph.
    if (para) para.src += ' ' + t;
    else para = { src: t, no };
  }
  if (inHighlights) fail('highlights not closed', lines.at(-1)?.no);
  flushPara();
  flushItem();
  return { paragraphs: paragraphs.filter((p) => p.length), highlights: highlights.filter((h) => h.length) };
}

// Body of a twocolentry: \textbf{...} and \textit{...} lines.
function parseTwoColBody(lines) {
  const body = { bold: null, italic: null };
  for (const { text, no } of lines) {
    const t = text.trim();
    if (IGNORABLE.test(t)) continue;
    let m = /^\\textbf\{(.+)\}$/.exec(t);
    if (m && !body.bold) {
      body.bold = plain(tidy(parseInline(m[1], no)));
      continue;
    }
    m = /^\\textit\{(.+)\}$/.exec(t);
    if (m && !body.italic) {
      body.italic = plain(tidy(parseInline(m[1], no)));
      continue;
    }
    fail(`unrecognised line in two-column entry: ${t}`, no);
  }
  return body;
}

// Splits "AWS(EC2, ECS), Azure(Basic)" on top-level commas.
function splitTopLevel(text) {
  const items = [];
  let depth = 0;
  let cur = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      items.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  items.push(cur.trim());
  return items.filter(Boolean);
}

const SECTIONS = {
  introduction: /^introduction$|^summary$|^about/i,
  skills: /^skills/i,
  education: /^education$/i,
  experience: /^(work )?experience$/i,
};

export function parseResume(tex) {
  const all = tex.split(/\r?\n/).map((text, i) => ({ text, no: i + 1 }));
  const begin = all.findIndex((l) => l.text.trim() === '\\begin{document}');
  const end = all.findIndex((l) => l.text.trim() === '\\end{document}');
  if (begin < 0 || end < 0) fail('missing \\begin{document} or \\end{document}');
  const lines = all.slice(begin + 1, end);

  const resume = { basics: {}, introduction: [], skills: [], education: [], experience: [] };

  const hStart = lines.findIndex((l) => l.text.trim() === '\\begin{header}');
  const hEnd = lines.findIndex((l) => l.text.trim() === '\\end{header}');
  if (hStart < 0 || hEnd < hStart) fail('missing header environment');
  parseHeader(lines.slice(hStart + 1, hEnd), resume.basics);
  for (const key of ['name', 'city', 'email', 'linkedin', 'website']) {
    if (!resume.basics[key]) fail(`header is missing ${key}`, lines[hStart].no);
  }

  let section = null; // key of SECTIONS, or 'skip'
  let company = null;
  let lastEntry = null; // role or education entry the next onecolentry belongs to

  for (let idx = hEnd + 1; idx < lines.length; idx++) {
    const { text, no } = lines[idx];
    const t = text.trim();

    const sec = /^\\section\{(.+)\}$/.exec(t);
    if (sec) {
      const name = plain(tidy(parseInline(sec[1], no)));
      section = Object.keys(SECTIONS).find((k) => SECTIONS[k].test(name)) ?? 'skip';
      if (section === 'skip') console.warn(`parse-resume: skipping unknown section "${name}" (line ${no})`);
      company = null;
      lastEntry = null;
      continue;
    }
    if (section === 'skip') continue;
    if (IGNORABLE.test(t)) continue;
    if (!section) fail(`content before the first \\section: ${t}`, no);

    const sub = /^\\subsection\{(.+)\}$/.exec(t);
    if (sub) {
      if (section !== 'experience') fail('\\subsection outside Experience', no);
      const full = plain(tidy(parseInline(sub[1], no)));
      const comma = full.indexOf(',');
      company = {
        company: comma < 0 ? full : full.slice(0, comma).trim(),
        location: comma < 0 ? null : full.slice(comma + 1).trim(),
        roles: [],
      };
      resume.experience.push(company);
      lastEntry = null;
      continue;
    }

    if (t.startsWith('\\begin{twocolentry}')) {
      const col = text.indexOf('\\begin{twocolentry}') + '\\begin{twocolentry}'.length;
      const [dateSrc, lastIdx, rest] = gatherBraced(lines, idx, col);
      if (rest.trim()) fail(`unexpected text after the date column: ${rest.trim()}`, lines[lastIdx].no);
      const close = lines.findIndex((l, k) => k > lastIdx && l.text.trim() === '\\end{twocolentry}');
      if (close < 0) fail('twocolentry not closed', no);
      const dates = parseRange(plain(tidy(parseInline(dateSrc, no))), no);
      const body = parseTwoColBody(lines.slice(lastIdx + 1, close));
      if (!body.bold) fail('two-column entry without a \\textbf title', no);
      if (section === 'experience') {
        if (!company) fail('role before any \\subsection{Company, City}', no);
        if (body.italic) fail(`unexpected subtitle in a role: ${body.italic}`, no);
        lastEntry = { title: body.bold, ...dates, summary: [], highlights: [] };
        company.roles.push(lastEntry);
      } else if (section === 'education') {
        lastEntry = { institution: body.bold, degree: body.italic, ...dates, highlights: [] };
        resume.education.push(lastEntry);
      } else {
        fail(`two-column entry not expected in this section`, no);
      }
      idx = close;
      continue;
    }

    if (t === '\\begin{onecolentry}') {
      let depth = 0;
      let close = -1;
      for (let k = idx; k < lines.length; k++) {
        const lt = lines[k].text.trim();
        if (lt === '\\begin{onecolentry}') depth++;
        if (lt === '\\end{onecolentry}' && --depth === 0) {
          close = k;
          break;
        }
      }
      if (close < 0) fail('onecolentry not closed', no);
      const { paragraphs, highlights } = parseOneCol(lines.slice(idx + 1, close));
      if (section === 'introduction') {
        if (highlights.length) fail('highlights are not expected in the introduction', no);
        resume.introduction.push(...paragraphs);
      } else if (section === 'skills') {
        if (highlights.length) fail('highlights are not expected in skills', no);
        for (const p of paragraphs) {
          const [head, ...restSegs] = p;
          if (!head?.bold || !/:\s*$/.test(head.text)) {
            fail('each skills entry must start with \\textbf{Label:}', no);
          }
          resume.skills.push({ label: head.text.replace(/:\s*$/, '').trim(), items: splitTopLevel(plain(restSegs)) });
        }
      } else if (section === 'experience') {
        if (!lastEntry) fail('entry text before any role', no);
        lastEntry.summary.push(...paragraphs);
        lastEntry.highlights.push(...highlights);
      } else if (section === 'education') {
        if (!lastEntry) fail('entry text before any education entry', no);
        if (paragraphs.length) fail('only highlights are expected under an education entry', no);
        lastEntry.highlights.push(...highlights);
      }
      idx = close;
      continue;
    }

    fail(`unrecognised line in ${section}: ${t}`, no);
  }

  for (const key of ['introduction', 'skills', 'education', 'experience']) {
    if (!resume[key].length) fail(`section "${key}" is missing or empty`);
  }
  for (const c of resume.experience) if (!c.roles.length) fail(`${c.company} has no roles`);

  assertPrivate(resume);
  return resume;
}

// Belt and braces on top of the header allowlist.
export function assertPrivate(resume) {
  const json = JSON.stringify(resume);
  if (/tel:/i.test(json)) fail('output contains a tel: link');
  if (/\+\d{1,3}[\s-]?\d/.test(json) || /(?:\d[\s-]?){10,}/.test(json)) {
    fail('output contains something that looks like a phone number');
  }
}

// ---------- CLI ----------

function resolveSource(repoRoot) {
  const candidates = [
    process.env.RESUME_PATH,
    resolve(repoRoot, '.resume/resume.tex'),
    resolve(repoRoot, '../resume-latex/resume.tex'),
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) fail(`resume.tex not found. Looked in:\n  ${candidates.join('\n  ')}\nSet RESUME_PATH to its location.`);
  return found;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outPath = resolve(repoRoot, 'src/data/resume.json');
  try {
    const source = resolveSource(repoRoot);
    const resume = parseResume(readFileSync(source, 'utf8'));
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(`${outPath}.tmp`, JSON.stringify(resume, null, 2) + '\n');
    renameSync(`${outPath}.tmp`, outPath);
    const roles = resume.experience.reduce((n, c) => n + c.roles.length, 0);
    console.log(`parse-resume: ${source} -> src/data/resume.json (${resume.experience.length} companies, ${roles} roles)`);
  } catch (err) {
    console.error(`parse-resume: FAILED\n${err.message}`);
    process.exit(1);
  }
}
