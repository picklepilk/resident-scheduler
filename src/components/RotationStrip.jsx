// Rotation strip: one horizontal track as wide as the rotation, cut at block edges, one pip per owed
// shift. Presentational only; the ledger comes from the parent (lib/rotationLedger.js, injected).
// Shapes differ, not only colours: done-before = solid dot, placed here = solid diamond, still to
// place here = hollow diamond, owed after = dashed hollow circle, cannot fit = warn triangle + count.

export function fmtMD(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const [, m, d] = iso.split('-');
  if (!m || !d) return iso;
  return `${Number(m)}/${Number(d)}`;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function stripSentence(ledger, placedHere) {
  if (!ledger) return 'No rotation ledger.';
  const placed = Math.max(0, placedHere || 0);
  const parts = [
    `${ledger.obligation} shifts owed in total`,
    `${ledger.doneBefore} done before this block`,
    `${placed} of ${ledger.dueHere} placed in this block`,
    `${ledger.owedAfter} owed after`,
  ];
  if (ledger.cannotFit > 0) parts.push(`${ledger.cannotFit} cannot fit`);
  return parts.join(', ') + '.';
}

function Pip({ kind, cx, cy, r }) {
  if (kind === 'done') return <circle className="tri-rot-pip tri-rot-pip--done" cx={cx} cy={cy} r={r} />;
  if (kind === 'after') return <circle className="tri-rot-pip tri-rot-pip--after" cx={cx} cy={cy} r={r - 0.75} />;
  const pts = `${cx},${cy - r - 1} ${cx + r + 1},${cy} ${cx},${cy + r + 1} ${cx - r - 1},${cy}`;
  return <polygon className={`tri-rot-pip tri-rot-pip--${kind}`} points={pts} />;
}

export default function RotationStrip({ ledger, placedHere = 0, block, compact = false }) {
  if (!ledger) return null;
  const segs = (ledger.segments || []).filter(s => s && s.days > 0);
  const label = stripSentence(ledger, placedHere);
  const placed = Math.max(0, Math.min(placedHere || 0, ledger.dueHere || 0));
  const W = compact ? 120 : 640;
  const H = compact ? 18 : 40;
  const cy = compact ? 9 : 19;
  const rMax = compact ? 4 : 7;
  const reserve = ledger.cannotFit > 0 ? (compact ? 22 : 34) : 0;
  const trackW = W - reserve;
  const totalDays = segs.reduce((a, s) => a + s.days, 0) || 1;
  const totalPips = segs.reduce((a, s) => a + (s.count || 0), 0);
  const barMode = compact && totalPips > 20;

  let x = 0;
  let placedLeft = placed;
  const nodes = [];
  const cuts = [];
  segs.forEach((s, i) => {
    const w = (s.days / totalDays) * trackW;
    const n = Math.max(0, s.count || 0);
    const prev = segs[i - 1];
    if (prev && prev.where !== s.where) cuts.push(x);
    nodes.push(<rect key={`bg${i}`} className={`tri-rot-seg tri-rot-seg--${s.where}`} x={x} y={cy - (compact ? 7 : 12)} width={Math.max(0, w)} height={compact ? 14 : 24} />);
    if (prev && prev.where === s.where) nodes.push(<line key={`sep${i}`} className="tri-rot-sep" x1={x} x2={x} y1={cy - (compact ? 6 : 10)} y2={cy + (compact ? 6 : 10)} />);
    const step = n ? w / n : w;
    const r = clamp(step * 0.4, 2.5, rMax);
    const fits = n > 0 && step >= (compact ? 6 : 9) && !barMode;
    if (n > 0 && fits) {
      const nPlaced = s.where === 'here' ? Math.min(placedLeft, n) : 0;
      if (s.where === 'here') placedLeft -= nPlaced;
      for (let k = 0; k < n; k++) {
        const kind = s.where === 'before' ? 'done' : s.where === 'after' ? 'after' : (k < nPlaced ? 'placed' : 'todo');
        nodes.push(<Pip key={`p${i}-${k}`} kind={kind} cx={x + step * (k + 0.5)} cy={cy} r={r} />);
      }
    } else if (n > 0) {
      if (s.where === 'here') placedLeft -= Math.min(placedLeft, n);
      const bh = compact ? 10 : 16;
      nodes.push(<rect key={`bar${i}`} className={`tri-rot-bar tri-rot-bar--${s.where}`} x={x + 1} y={cy - bh / 2} width={Math.max(2, w - 2)} height={bh} rx={2} />);
      if (w >= (compact ? 14 : 22)) nodes.push(<text key={`bt${i}`} className={`tri-rot-bartext tri-rot-bartext--${s.where}`} x={x + w / 2} y={cy + (compact ? 3 : 4)} textAnchor="middle" fontSize={compact ? 9 : 11}>{n}</text>);
    }
    x += w;
  });
  cuts.forEach((cx, i) => nodes.push(<line key={`cut${i}`} className="tri-rot-cut" x1={cx} x2={cx} y1={compact ? 0 : 1} y2={H - (compact ? 0 : 1)} />));
  if (ledger.cannotFit > 0) {
    const mx = trackW + (compact ? 4 : 8);
    nodes.push(
      <g key="cf" className="tri-rot-cf">
        <polygon className="tri-rot-cf__tri" points={`${mx},${cy + 6} ${mx + 6},${cy - 6} ${mx + 12},${cy + 6}`} />
        <text className="tri-rot-cf__text" x={mx + 15} y={cy + 4} fontSize={compact ? 9 : 12}>{ledger.cannotFit}</text>
      </g>
    );
  }

  const svg = (
    <svg className="tri-rot-svg" viewBox={`0 0 ${W} ${H}`} width={compact ? W : '100%'} height={compact ? H : undefined}
      style={compact ? undefined : { aspectRatio: `${W} / ${H}`, maxHeight: 44 }} preserveAspectRatio="xMinYMid meet" aria-hidden="true" focusable="false">
      {nodes}
    </svg>
  );

  if (compact) {
    return <span className="tri-rot tri-rot--compact" role="img" aria-label={label} title={label}>{svg}</span>;
  }
  return (
    <div className="tri-rot" role="img" aria-label={label}>
      {svg}
      <div className="tri-rot-nums" aria-hidden="true">
        <span>{ledger.doneBefore} before</span><span className="tri-rot-nums__sep">|</span>
        <span>{placed} of {ledger.dueHere} here</span><span className="tri-rot-nums__sep">|</span>
        <span>{ledger.owedAfter} after</span>
      </div>
    </div>
  );
}
