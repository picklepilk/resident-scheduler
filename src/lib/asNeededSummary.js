// Summarize report.asNeededPlacements for display. Pure; the stored array is untrusted shape
// (backup / cloud / old reports). Names come ONLY from residentNameById, never a persisted `name`.
// A placement may carry `units` (count-based rules, e.g. nights above 6); default 1.
export function summarizeAsNeeded(placements, residentNameById) {
  const names = residentNameById && typeof residentNameById === 'object' ? residentNameById : {};
  const byLabel = new Map();
  const byResident = new Map();
  let total = 0;
  if (Array.isArray(placements)) {
    for (const p of placements) {
      if (!p || typeof p !== 'object' || Array.isArray(p)) continue;
      const label = typeof p.label === 'string' && p.label ? p.label : 'As needed';
      const rid = typeof p.residentId === 'string' || typeof p.residentId === 'number' ? String(p.residentId) : null;
      const u = Number.isFinite(p.units) && p.units > 0 ? Math.floor(p.units) || 1 : 1;
      total += u;
      byLabel.set(label, (byLabel.get(label) || 0) + u);
      if (rid != null) {
        const nm = typeof names[rid] === 'string' && names[rid] ? names[rid] : rid;
        let e = byResident.get(rid);
        if (!e) { e = { residentId: rid, name: nm, count: 0, labels: {} }; byResident.set(rid, e); }
        e.count += u;
        e.labels[label] = (e.labels[label] || 0) + u;
      }
    }
  }
  return {
    total,
    byLabel: [...byLabel].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    byResident: [...byResident.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  };
}
