import { inflate, scrimRects, SPOTLIGHT_PAD } from './tourGeometry';

/** Numbers are fine in React inline styles — `px` is appended automatically. */
function rectToStyle(r) {
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

// Retheme of Epic's `bg-ink-900/45` scrim onto this app's plain Tailwind palette (no custom
// design-token layer here) — same opacity, same intent.
const SCRIM_CLASS = 'absolute bg-black/45 pointer-events-auto cursor-default';

/**
 * Purely presentational — takes a rect as a prop, never measures anything
 * itself. Always renders the wrapper div (even with nothing to show): that's
 * the test seam, and it guarantees the walkthrough can never trap the viewer
 * behind an opaque scrim with no way out.
 *
 * Ported verbatim (structure/logic) from Epic Demo's
 * src/components/common/TourSpotlight.tsx; only the Tailwind classes and the
 * ring's pulse animation (Tailwind's built-in `animate-pulse` in place of
 * Epic's custom `animate-tour-ring` keyframe, which this app doesn't define)
 * were retheme.
 */
export function TourSpotlight({ targetKey, status, rect, muted, onScrimClick }) {
  const showHole = !muted && rect !== null;
  const rects = showHole && rect ? scrimRects(rect, { width: window.innerWidth, height: window.innerHeight }) : null;

  return (
    <div
      data-tour-spotlight=""
      data-tour-target={targetKey}
      data-tour-state={muted ? 'muted' : status}
      data-tour-measured={rect ? 'true' : 'false'}
      className="fixed inset-0 z-30 pointer-events-none"
    >
      {rects && rect && (
        <>
          <div
            data-tour-scrim="top"
            aria-hidden="true"
            className={SCRIM_CLASS}
            style={rectToStyle(rects.top)}
            onClick={onScrimClick}
          />
          <div
            data-tour-scrim="bottom"
            aria-hidden="true"
            className={SCRIM_CLASS}
            style={rectToStyle(rects.bottom)}
            onClick={onScrimClick}
          />
          <div
            data-tour-scrim="left"
            aria-hidden="true"
            className={SCRIM_CLASS}
            style={rectToStyle(rects.left)}
            onClick={onScrimClick}
          />
          <div
            data-tour-scrim="right"
            aria-hidden="true"
            className={SCRIM_CLASS}
            style={rectToStyle(rects.right)}
            onClick={onScrimClick}
          />
          <div
            data-tour-ring=""
            aria-hidden="true"
            className="absolute z-10 rounded-sm pointer-events-none outline-2 outline-primary outline-offset-2 animate-pulse"
            style={rectToStyle(inflate(rect, SPOTLIGHT_PAD))}
          />
        </>
      )}
    </div>
  );
}
