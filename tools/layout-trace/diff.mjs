export const OPTS = { CARD_W: 280, CARD_H: 112, COUPLE_GAP: 76, H_GAP: 36, V_GAP: 96, TREE_GAP: 100 };

export function runTrace(engine, model) {
  const trace = [];
  const t0 = performance.now();
  const { positions, hidden } = engine(model, { ...OPTS, trace });
  return { trace, positions, hidden, units: trace.units || [], ms: performance.now() - t0 };
}

export function alignSteps(a, b) {
  const n = a.length,
    m = b.length;
  const key = (s) => s.title;
  const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      L[i][j] = key(a[i]) === key(b[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const rows = [];
  let i = 0,
    j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && key(a[i]) === key(b[j])) rows.push([i++, j++]);
    else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) rows.push([null, j++]);
    else rows.push([i++, null]);
  }
  return rows;
}

export const rowDiffers = (before, after, [i, j]) =>
  i == null || j == null || before.trace[i].detail !== after.trace[j].detail;

export function movedPeople(before, after, people) {
  const out = [];
  for (const [id, p] of after.positions) {
    const q = before.positions.get(id);
    if (!q) out.push({ id, name: people[id]?.name, kind: 'appeared', dx: 0, dy: 0 });
    else if (q.x !== p.x || q.y !== p.y)
      out.push({ id, name: people[id]?.name, kind: 'moved', dx: p.x - q.x, dy: p.y - q.y });
  }
  for (const id of before.positions.keys())
    if (!after.positions.has(id)) out.push({ id, name: people[id]?.name, kind: 'disappeared', dx: 0, dy: 0 });
  return out.sort((a, b) => Math.hypot(b.dx, b.dy) - Math.hypot(a.dx, a.dy));
}

export function extent(run) {
  let minX = Infinity,
    maxX = -Infinity,
    maxY = 0;
  for (const p of run.positions.values()) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x + OPTS.CARD_W);
    maxY = Math.max(maxY, p.y + OPTS.CARD_H);
  }
  return { width: Math.round(maxX - minX), height: Math.round(maxY) };
}
