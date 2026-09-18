#!/usr/bin/env node
/**
 * verify-docs — turns this repo's three stated maintenance habits into checks.
 *
 * `docs/README.md` says of those rules: "None of these are enforced by CI.
 * They are habits, and the audits above are what happens when a habit slips."
 * Four of the stale references found during the 2026-09-04 cleanup were
 * introduced by commits made earlier the same day, which is about as clear a
 * demonstration as a habit can give. These are the slips that are mechanically
 * decidable; the rest still needs a reader.
 *
 * Run: pnpm verify:docs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const failures = [];
const checks = [];

function fail(check, message) {
  failures.push({ check, message });
}
function ran(name) {
  checks.push(name);
}

/** Every file under dir matching a predicate, skipping the usual noise. */
function walk(dir, test, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, test, out);
    else if (test(full)) out.push(full);
  }
  return out;
}

const rel = (p) => relative(ROOT, p);

// `openspec update` rewrites .claude/commands and .claude/skills wholesale, so
// holding them to this repo's doc rules would fail on text nobody here
// maintains. .claude/agents is hand-written and is checked like any other doc.
const VENDORED = ['.claude/commands/', '.claude/skills/'];
const vendored = (f) => VENDORED.some((dir) => rel(f).startsWith(dir));

const markdown = walk(ROOT, (f) => f.endsWith('.md')).filter((f) => !vendored(f));
const read = (p) => readFileSync(p, 'utf8');

// ---------------------------------------------------------------------------
// 1. Every relative markdown link points at a file that exists.
// ---------------------------------------------------------------------------
ran('markdown links resolve');
for (const file of markdown) {
  const body = read(file);
  for (const [, target] of body.matchAll(/\]\((?!https?:|mailto:|#)([^)]+)\)/g)) {
    const path = target.split('#')[0].trim();
    if (!path) continue;
    try {
      statSync(resolve(dirname(file), path));
    } catch {
      fail('markdown links resolve', `${rel(file)} → ${path} does not exist`);
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Named tests cited in the docs actually exist in the suite.
//
// This is the check that would have caught "RS-1..RS-5" surviving in three
// documents after the set grew to eight. traceability.md claims its test
// names "were read out of the suite, not transcribed from a document" — this
// keeps that true rather than true-as-of-whenever-someone-last-looked.
// ---------------------------------------------------------------------------
ran('cited test IDs exist');
const testSource = walk(ROOT, (f) => /\.(test|spec)\.tsx?$/.test(f))
  .map(read)
  .join('\n');
const citedIds = new Set();
for (const file of markdown) {
  // Skip the audit write-ups: they record what a review said at the time,
  // including tests it proposed that were never built under that name.
  if (rel(file).startsWith('docs/audits/')) continue;
  // Same reasoning for an in-flight OpenSpec change: naming the test that will
  // prove a rule is exactly what its task list is supposed to do, and that test
  // does not exist yet. Once the change archives, its requirements land in
  // openspec/specs/, which is held to the rule like everything else.
  if (rel(file).startsWith('openspec/changes/')) continue;
  for (const [, id] of read(file).matchAll(/\b((?:RS|OV)-\d+)\b/g)) citedIds.add(id);
}
for (const id of [...citedIds].sort()) {
  if (!testSource.includes(id)) {
    fail('cited test IDs exist', `${id} is cited in docs but appears in no test file`);
  }
}

// ---------------------------------------------------------------------------
// 3. The two specs agree about each other's version.
//    They are a pair; a rule changed in one changes in the other.
// ---------------------------------------------------------------------------
ran('spec version cross-reference');
{
  const master = read(join(ROOT, 'docs/overlap-master-doc.md'));
  const spec = read(join(ROOT, 'docs/engineering-spec.md'));
  const masterVersion = master.match(/^\*\*Version:\*\*\s*(v?[\d.]+)/m)?.[1];
  const claimed = spec.match(/\*\*Companion to:\*\*.*?v([\d.]+)/)?.[1];
  if (!masterVersion || !claimed) {
    fail('spec version cross-reference', 'could not parse one of the version headers');
  } else if (masterVersion.replace(/^v/, '') !== claimed) {
    fail(
      'spec version cross-reference',
      `engineering-spec.md says "Companion to master-doc v${claimed}" but the master doc is v${masterVersion}`,
    );
  }
}

// ---------------------------------------------------------------------------
// 4. traceability.md's test-count arithmetic is internally consistent.
// ---------------------------------------------------------------------------
ran('traceability test count adds up');
{
  const trace = read(join(ROOT, 'docs/traceability.md'));
  const m = trace.match(/\((\d+)\s+tests passing\s*—\s*(\d+)\s+shared\s*\+\s*(\d+)\s+web/);
  if (!m) {
    fail('traceability test count adds up', 'could not find the "N tests passing" header line');
  } else {
    const [, total, shared, web] = m.map(Number);
    if (shared + web !== total) {
      fail(
        'traceability test count adds up',
        `header says ${total} total but ${shared} shared + ${web} web = ${shared + web}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Every ticket cited in traceability.md exists on the backlog board.
//    A row pointing at a ticket nobody is tracking is a commitment with no owner.
// ---------------------------------------------------------------------------
ran('cited tickets exist on the board');
{
  const backlog = read(join(ROOT, 'docs/backlog.md'));
  const known = new Set([...backlog.matchAll(/^\|\s*(T\d+b?)\s*\|/gm)].map((m) => m[1]));
  const trace = read(join(ROOT, 'docs/traceability.md'));
  for (const [, ticket] of trace.matchAll(/\b(T\d+b?)\b/g)) {
    if (!known.has(ticket)) {
      fail('cited tickets exist on the board', `traceability.md cites ${ticket}, absent from backlog.md`);
    }
  }
}

// ---------------------------------------------------------------------------
// 6. No raw non-ASCII in any .html file, and no mojibake anywhere.
//    Standing rule: HTML is written as ASCII + named entities, because a file
//    served without charset=utf-8 renders raw UTF-8 as "â€".
// ---------------------------------------------------------------------------
ran('html is pure ASCII');
for (const file of walk(ROOT, (f) => f.endsWith('.html'))) {
  const offenders = [...new Set(read(file).match(/[^\x00-\x7F]/g) ?? [])];
  if (offenders.length) {
    fail('html is pure ASCII', `${rel(file)} contains raw ${offenders.join(' ')} — use named entities`);
  }
}

ran('no mojibake');
for (const file of [...markdown, ...walk(ROOT, (f) => /\.(html|tsx?|json)$/.test(f))]) {
  if (/â€|Ã©|Â /.test(read(file))) {
    fail('no mojibake', `${rel(file)} contains mis-decoded UTF-8`);
  }
}

// ---------------------------------------------------------------------------
// 8. The OpenSpec planning layer is internally consistent.
//
// `openspec/` holds the per-ticket plans and the per-capability specs they
// archive into (ADR-0008). Its own validator is the only thing that can check
// a change declares the artifacts its schema requires, and that an archived
// change really finished its task list. Folded in here rather than made a
// sixth command, so the definition of done stays five.
// ---------------------------------------------------------------------------
ran('openspec plans validate');
{
  const bin = join(ROOT, 'node_modules/.bin/openspec');
  if (!existsSync(bin)) {
    fail('openspec plans validate', 'node_modules/.bin/openspec is missing — run pnpm install');
  } else {
    for (const args of [
      ['validate', '--all', '--strict', '--no-interactive'],
      ['validate', '--archived', '--no-interactive'],
    ]) {
      try {
        execFileSync(bin, args, { cwd: ROOT, stdio: 'pipe', env: { ...process.env, OPENSPEC_TELEMETRY: '0' } });
      } catch (err) {
        const out = `${err.stdout ?? ''}${err.stderr ?? ''}`.trim();
        fail('openspec plans validate', `openspec ${args.join(' ')} failed:\n${out}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------

const width = Math.max(...checks.map((c) => c.length));
for (const check of checks) {
  const bad = failures.filter((f) => f.check === check);
  console.log(`${bad.length ? '✗' : '✓'} ${check.padEnd(width)}  ${bad.length ? `${bad.length} problem${bad.length > 1 ? 's' : ''}` : 'ok'}`);
}

if (failures.length) {
  console.log('');
  for (const { check, message } of failures) console.log(`  [${check}] ${message}`);
  console.log(`\n${failures.length} problem${failures.length > 1 ? 's' : ''}. These are the habits docs/README.md says nothing enforces.`);
  process.exit(1);
}
console.log('\nAll doc consistency checks passed.');
