// src/lib/scheduleGrouping.js
// Pure row-grouping for the Schedule tab: partitions the visible residents into the labelled
// banner groups the grid and the By-Resident card view both render. No React, no side effects.
//
// LOOKUP TABLES ARE PARAMETERS, NOT IMPORTS. The three things this needs live in two different
// places — CATEGORIES in lib/parse.js, but BLOCK_TYPES_EM/BLOCK_TYPE_MAP and isEmResident inside
// ResidentScheduler.jsx, which lib/* may never import (see CLAUDE.md: that file imports lib/* the
// other direction, so the reverse edge would be circular). Taking them as arguments is what keeps
// this module lib-legal while still letting the real tables be the single source of truth.
//
// RETURN SHAPE IS DELIBERATELY UNCHANGED: `[{ cat, members }]`, exactly what the category-only
// version produced before there was more than one mode. `cat` is a real CATEGORIES entry in
// 'category' mode and a synthesized descriptor of the same shape ({id,label,badge,rowBg}) in the
// others, so ScheduleGrid's banner render and ResidentCardsView — which both read cat.id/label/
// badge/rowBg — needed no edits at all to gain PGY and rotation grouping.

export const GRID_GROUP_MODES = ['category', 'pgy', 'rotation'];
export const GRID_GROUP_MODE_DEFAULT = 'category';

// PGY bucket order and styling. Every category's pgyOptions only ever contains 1, 2 or 3, so three
// real buckets cover the roster; 'other' exists so a record with a missing/garbage pgy still
// RENDERS rather than silently disappearing from the schedule — same "data never invisible"
// posture as the grid's hide-unscheduled toggle, which always shows anyone holding a real shift.
// Colours are reused from the set the dark-mode override sheet already remaps (see index.css) and
// are deliberately distinct from every CATEGORIES hue, so a PGY banner can't be mistaken for a
// category banner.
export const PGY_GROUPS = [
  { id: 'PGY_1',     pgy: 1,    label: 'PGY-1',       badge: 'bg-slate-700 text-white', rowBg: 'bg-slate-50' },
  { id: 'PGY_2',     pgy: 2,    label: 'PGY-2',       badge: 'bg-slate-600 text-white', rowBg: 'bg-slate-50' },
  { id: 'PGY_3',     pgy: 3,    label: 'PGY-3',       badge: 'bg-slate-500 text-white', rowBg: 'bg-slate-50' },
  { id: 'PGY_OTHER', pgy: null, label: 'PGY — other', badge: 'bg-gray-500 text-white',  rowBg: 'bg-gray-50'  },
];

// One shared style for every EM-rotation group rather than ~20 hand-picked hues. Rotation groups
// are already named by their own label ("EM/TOX", "Peds/Trauma", …), so per-rotation colour would
// add maintenance for no information. Off-service residents are NOT styled from here — in rotation
// mode their category IS their rotation, so they reuse their own CATEGORIES entry verbatim.
export const ROTATION_EM_STYLE = { badge: 'bg-indigo-600 text-white', rowBg: 'bg-blue-50' };

// Groups whose `members` is empty are dropped, never rendered as an empty banner — same rule the
// category-only version applied (`if (m.length) g.push(...)`).
function pushNonEmpty(out, cat, members) {
  if (members.length) out.push({ cat, members });
}

/**
 * @param {object[]} residents  already filtered/visible, in the order they should render
 * @param {'category'|'pgy'|'rotation'} mode
 * @param {{categories:object[], blockTypes:object[], isEm:(r:object)=>boolean}} tables
 * @returns {{cat:{id:string,label:string,badge:string,rowBg:string}, members:object[]}[]}
 */
export function groupResidents(residents, mode, { categories, blockTypes, isEm }) {
  const list = Array.isArray(residents) ? residents : [];
  const out = [];

  if (mode === 'pgy') {
    // Sub-order within a PGY bucket follows CATEGORIES order (EM Home/BAMC first, then off-service),
    // with the resident's original index breaking ties — so the ordering is total and stable, and a
    // re-render can never reshuffle rows underneath row-level state like the lock button.
    const catIndex = new Map(categories.map((c, i) => [c.id, i]));
    const rank = r => catIndex.has(r.category) ? catIndex.get(r.category) : categories.length;
    for (const g of PGY_GROUPS) {
      const members = list
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => g.pgy === null ? ![1, 2, 3].includes(r.pgy) : r.pgy === g.pgy)
        .sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i)
        .map(({ r }) => r);
      pushNonEmpty(out, g, members);
    }
    return out;
  }

  if (mode === 'rotation') {
    // EM residents bucket by their CURRENT-block rotation. `blockType` is denormalized onto the
    // resident by the app's own allResidents memo and defaults to 'EM' there, but default again
    // here rather than assuming — this function is also reachable from tests and from stub snapshot
    // rosters that never went through that memo.
    for (const bt of blockTypes) {
      const members = list.filter(r => isEm(r) && (r.blockType || 'EM') === bt.id);
      pushNonEmpty(out, { id: `ROT_${bt.id}`, label: bt.label, ...ROTATION_EM_STYLE }, members);
    }
    // Then off-service residents, whose category IS their rotation — reuse the category entry so
    // their banner keeps the exact colour they already have everywhere else in the app.
    for (const cat of categories) {
      const members = list.filter(r => !isEm(r) && r.category === cat.id);
      pushNonEmpty(out, cat, members);
    }
    // An EM resident carrying a blockType absent from BLOCK_TYPES_EM would fall through both loops
    // above and vanish. Catch them rather than lose a row (same reasoning as PGY_OTHER).
    const placed = new Set(out.flatMap(g => g.members.map(r => r.id)));
    pushNonEmpty(out, { id: 'ROT_OTHER', label: 'Other rotation', ...ROTATION_EM_STYLE },
      list.filter(r => !placed.has(r.id)));
    return out;
  }

  // 'category' (default) — unchanged behavior, kept as the fallback for any unrecognized mode so a
  // stale persisted pref can never render an empty grid.
  for (const cat of categories) {
    pushNonEmpty(out, cat, list.filter(r => r.category === cat.id));
  }
  return out;
}
