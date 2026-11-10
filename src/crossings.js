export function applyCrossings(buckets, mode) {
  const R = 6,
    M = 1;
  const paths = [];
  for (const bucket of buckets)
    for (let i = 0; i < bucket.length; i++) {
      const pieces = [];
      let cur = null;
      for (const m of bucket[i].matchAll(/([MLQA])([^MLQA]*)/g)) {
        const n = m[2]
          .trim()
          .split(/[\s,]+/)
          .map(Number);
        if (m[1] === 'M') {
          cur = { x: n[0], y: n[1] };
          pieces.push({ cmd: 'M', x: n[0], y: n[1] });
        } else if (m[1] === 'L') {
          pieces.push({ cmd: 'L', x1: cur.x, y1: cur.y, x2: n[0], y2: n[1], cuts: [] });
          cur = { x: n[0], y: n[1] };
        } else {
          pieces.push({ cmd: m[1], raw: m[2].trim() });
          cur = { x: n[n.length - 2], y: n[n.length - 1] };
        }
      }
      paths.push({ bucket, i, pieces });
    }
  const hs = [],
    vs = [];
  paths.forEach((p, pi) => {
    for (const pc of p.pieces) {
      if (pc.cmd !== 'L') continue;
      if (pc.y1 === pc.y2 && pc.x1 !== pc.x2) hs.push({ pc, pi });
      else if (pc.x1 === pc.x2 && pc.y1 !== pc.y2) vs.push({ pc, pi });
    }
  });
  for (const h of hs) {
    const hx1 = Math.min(h.pc.x1, h.pc.x2) + M,
      hx2 = Math.max(h.pc.x1, h.pc.x2) - M,
      hy = h.pc.y1;
    for (const v of vs) {
      if (v.pi === h.pi) continue;
      const vy1 = Math.min(v.pc.y1, v.pc.y2) + M,
        vy2 = Math.max(v.pc.y1, v.pc.y2) - M,
        vx = v.pc.x1;
      if (vx > hx1 && vx < hx2 && hy > vy1 && hy < vy2)
        (mode === 'jump' ? h.pc : v.pc).cuts.push(mode === 'jump' ? vx : hy);
    }
  }
  for (const p of paths) {
    let out = '';
    for (const pc of p.pieces) {
      if (pc.cmd === 'M') {
        out += `M${pc.x} ${pc.y}`;
        continue;
      }
      if (pc.cmd !== 'L') {
        out += `${pc.cmd}${pc.raw}`;
        continue;
      }
      const sorted = [...new Set(pc.cuts)].sort((a, b) => a - b),
        groups = [];
      for (const c of sorted) {
        const g = groups[groups.length - 1];
        if (g && c - g[1] <= 2 * R) g[1] = c;
        else groups.push([c, c]);
      }
      if (!groups.length) {
        out += ` L${pc.x2} ${pc.y2}`;
        continue;
      }
      if (mode === 'jump') {
        const dir = Math.sign(pc.x2 - pc.x1);
        for (const [a, b] of dir > 0 ? groups : groups.reverse()) {
          const [s0, s1] = dir > 0 ? [a - R, b + R] : [b + R, a - R];
          out += ` L${s0} ${pc.y1} A${Math.abs(s1 - s0) / 2} ${R} 0 0 ${dir > 0 ? 1 : 0} ${s1} ${pc.y1}`;
        }
      } else {
        const dir = Math.sign(pc.y2 - pc.y1);
        for (const [a, b] of dir > 0 ? groups : groups.reverse()) {
          const [s0, s1] = dir > 0 ? [a - R, b + R] : [b + R, a - R];
          out += ` L${pc.x1} ${s0} M${pc.x1} ${s1}`;
        }
      }
      out += ` L${pc.x2} ${pc.y2}`;
    }
    p.bucket[p.i] = out;
  }
}
