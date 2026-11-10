import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { runTrace, alignSteps, rowDiffers, movedPeople, extent } from './diff.mjs';

const [
  beforePath = 'tools/layout-trace/engine-before.js',
  afterPath = 'src/engine.js',
  fixture = 'tests/fixtures/wide-tree.json',
  out = 'layout-report.md',
] = process.argv.slice(2);
const model = JSON.parse(readFileSync(fixture, 'utf8'));
const load = async (p) => (await import(pathToFileURL(p))).computeLayout;
const after = runTrace(await load(afterPath), model);
const size = (r) => `${extent(r).width}×${extent(r).height}`;
const lines = [
  '# Layout report',
  '',
  `Fixture \`${fixture}\`, ${Object.keys(model.people).length} people. After: ${after.trace.length} steps, ${after.ms.toFixed(1)} ms, ${size(after)} px.`,
  '',
];

if (!existsSync(beforePath)) lines.push(`No previous engine at \`${beforePath}\`, nothing to compare.`);
else {
  const before = runTrace(await load(beforePath), model);
  if (!before.trace.length) lines.push('Previous engine emits no trace; only final positions are compared.', '');
  const moved = movedPeople(before, after, model.people);
  const rows = before.trace.length ? alignSteps(before.trace, after.trace) : [];
  const diffs = rows.filter((r) => rowDiffers(before, after, r));
  lines.push(
    '| | before | after |',
    '|---|---|---|',
    `| steps | ${before.trace.length} | ${after.trace.length} |`,
    `| time | ${before.ms.toFixed(1)} ms | ${after.ms.toFixed(1)} ms |`,
    `| size | ${size(before)} | ${size(after)} |`,
    `| people moved | | ${moved.length} |`,
    `| differing steps | | ${diffs.length} |`,
    '',
  );
  if (!moved.length && !diffs.length) lines.push('**Layout unchanged.**');
  if (moved.length) {
    lines.push('## Moved people (top 30)', '', '| person | Δx | Δy |', '|---|---:|---:|');
    for (const m of moved.slice(0, 30))
      lines.push(
        `| ${m.name || m.id}${m.kind !== 'moved' ? ` (${m.kind})` : ''} | ${Math.round(m.dx)} | ${Math.round(m.dy)} |`,
      );
    lines.push('');
  }
  if (diffs.length) {
    lines.push('## Differing steps (first 40)', '');
    for (const [i, j] of diffs.slice(0, 40)) {
      const b = i != null ? before.trace[i] : null,
        a = j != null ? after.trace[j] : null;
      lines.push(`- **${(a || b).phase}** · ${(a || b).title}`);
      if (b) lines.push(`  - before: ${b.detail}`);
      if (a) lines.push(`  - after: ${a.detail}`);
    }
  }
}
const md = lines.join('\n') + '\n';
writeFileSync(out, md);
if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, md, { flag: 'a' });
console.log(md);
