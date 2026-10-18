// Structured pre-generate / live "setup readiness" gaps. Pure: every input is plain data the big
// file precomputes (it may not be imported here). A gap NEVER blocks generation — `severity` only
// drives presentation. `suppresses` names what silently does not run while the gap is open.
//
// gap: { id, severity:'blocking'|'advisory', label, detail, fixTarget:{tab, section?}, suppresses:[string] }

export const PRESSURE_LIGHT = 0.60;
export const PRESSURE_MODERATE = 0.85;

export function pressureLevel(ratio) {
  if (!Number.isFinite(ratio)) return null;
  if (ratio < PRESSURE_LIGHT) return 'light';
  if (ratio < PRESSURE_MODERATE) return 'moderate';
  return 'tight';
}

function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function computeSetupGaps(input = {}) {
  const {
    block = {}, missingSpecialDayLists = [], unmigrated = false, missingRuleDates = [], jcGaps = [],
    holidaysConfigured = true, ayLabel = '', conferenceDatesAbsent = false,
    residentIssues = [], pendingResidentCount = 0, offServiceNoRanges = [], supplyDemand = null,
  } = input;
  const gaps = [];
  // Default BLOCKING (the rule/resident silently does not work); holidays, conferences, pending requests
  // and pressure pass severity: 'advisory' explicitly.
  const add = g => gaps.push({ severity: 'blocking', suppresses: [], ...g });

  if (!validDate(block.startDate) || !validDate(block.endDate) || block.endDate < block.startDate) {
    add({
      id: 'blockDates', severity: 'blocking', label: 'Block dates missing or invalid',
      detail: 'Block start/end dates are missing or invalid -- Generate cannot build a schedule without them (Dashboard tab)',
      fixTarget: { tab: 'dashboard', section: 'block-dates' }, suppresses: ['Every date-based rule'],
    });
  }
  for (const m of missingSpecialDayLists) {
    add({
      id: `specialDays:${m.key || m.label}`, label: `No ${String(m.label).toLowerCase()}`,
      detail: `No ${String(m.label).toLowerCase()} entered — some residents' eligibility rules depend on them (Dashboard tab → Special Days)`,
      fixTarget: { tab: 'dashboard', section: 'special-days' }, suppresses: [`${m.label} eligibility rules`],
    });
  }
  if (unmigrated) {
    add({
      id: 'ruleDatesUnmigrated', label: 'Rule dates not yet migrated',
      detail: 'Rule dates not yet migrated (cloud not loaded) -- First Friday / Wellness Wednesday / Journal Club dates may be missing',
      fixTarget: { tab: 'dashboard', section: 'ay-card' },
      suppresses: ['First Friday rule', 'Wellness Wednesday rule', 'Journal Club rule'],
    });
  }
  for (const m of missingRuleDates) {
    add({
      id: `ruleDates:${m.ruleKey}${m.sub != null ? ':' + m.sub : ''}`, label: `No ${m.label} dates logged`,
      detail: m.message, fixTarget: { tab: 'dashboard', section: 'ay-card' }, suppresses: [`${m.label} rule`],
    });
  }
  for (const g of jcGaps) {
    add({
      id: `jcPresenter:${g.dateStr}:${g.pgy}`, label: `No PGY-${g.pgy} JC presenter (${g.display || g.dateStr})`,
      detail: `No PGY-${g.pgy} Journal Club presenter set for ${g.display || g.dateStr} (set on the resident's profile)`,
      fixTarget: { tab: 'em' }, suppresses: ['Journal Club presenter exemption'],
    });
  }
  if (!holidaysConfigured) {
    add({
      id: 'holidaysMissing', severity: 'advisory', label: 'No holidays configured',
      detail: `No holidays configured for ${ayLabel || 'this academic year'} -- holiday fairness and holiday coverage checks will not run (Dashboard tab, academic year card)`,
      fixTarget: { tab: 'dashboard', section: 'ay-card' }, suppresses: ['Holiday fairness', 'Holiday coverage'],
    });
  }
  if (conferenceDatesAbsent) {
    add({
      id: 'conferencesMissing', severity: 'advisory', label: 'No conference dates',
      detail: `No conference dates for ${ayLabel || 'this academic year'} -- 12h conference windows and conference seniority fallback will not apply (Dashboard tab, academic year card)`,
      fixTarget: { tab: 'dashboard', section: 'ay-card' }, suppresses: ['12h conference windows', 'Conference seniority fallback'],
    });
  }
  for (const r of residentIssues) {
    add({
      id: `resident:${r.id || r.name}`, label: `${r.name}: missing ${r.missing.join('/')}`,
      detail: `${r.name} is missing ${r.missing.join(', ')} -- eligibility and targets cannot resolve for them (EM Residents / Off-Service tab)`,
      fixTarget: { tab: r.tab || 'em' }, suppresses: ['Eligibility', 'Shift target'],
    });
  }
  if (pendingResidentCount > 0) {
    const n = pendingResidentCount;
    add({
      id: 'pendingRequests', severity: 'advisory', label: `${n} resident${n !== 1 ? 's' : ''} with unreviewed requests`,
      detail: `${n} resident${n !== 1 ? 's have' : ' has'} pending day-off requests not yet reviewed -- they are not honored by Generate (Requests tab)`,
      fixTarget: { tab: 'requests' }, suppresses: ['Pending day-off requests'],
    });
  }
  for (const n of offServiceNoRanges) {
    add({
      id: `offServiceRanges:${n.id || n.name}`, label: `${n.name}: no availability ranges`,
      detail: `Off-service resident ${n.name} uses date-range availability but has no ranges -- they will never be scheduled (Off-Service tab)`,
      fixTarget: { tab: 'offservice' }, suppresses: ['Off-service availability'],
    });
  }
  let pressure = null;
  if (supplyDemand && supplyDemand.supply > 0) {
    const ratio = supplyDemand.demand / supplyDemand.supply;
    pressure = { ratio, level: pressureLevel(ratio), demand: supplyDemand.demand, supply: supplyDemand.supply };
    if (pressure.level) {
      add({
        id: 'pressure', severity: 'advisory', label: `Demand vs supply: ${pressure.level} (${Math.round(ratio * 100)}%)`,
        detail: `Targets total ${pressure.demand} vs ${pressure.supply} slots of coverage capacity (${Math.round(ratio * 100)}%) -- level: ${pressure.level}; if tight, expect under-target residents (raise coverage maxes or lower targets) (Scheduling Rules tab)`,
        fixTarget: { tab: 'rules' }, suppresses: [],
      });
    }
  }
  return { gaps, pressure };
}

// Stamp stored on block.generatedWithGaps: null when nothing to record.
export function buildGapStamp(gaps, at = new Date().toISOString()) {
  if (!Array.isArray(gaps) || gaps.length === 0) return null;
  return { at, gaps: gaps.map(g => ({ id: g.id, label: g.label })) };
}

// Stamped gaps that are still open in the live list. Tolerates a malformed stamp.
export function openStampedGaps(stamp, liveGaps) {
  if (!stamp || !Array.isArray(stamp.gaps)) return [];
  const live = new Map((liveGaps || []).map(g => [g.id, g]));
  return stamp.gaps.filter(s => s && live.has(s.id)).map(s => live.get(s.id));
}

export function blockingGapCount(gaps) { return (gaps || []).filter(g => g.severity === 'blocking').length; }
