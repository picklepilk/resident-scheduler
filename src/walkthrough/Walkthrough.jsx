import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Eye, EyeOff, X } from 'lucide-react';
import { CARD_H_FALLBACK, CARD_W, pickCardCorner } from './tourGeometry';
import { TourSpotlight } from './TourSpotlight';
import { useSpotlightTarget } from './useSpotlightTarget';

/** Static literal map, required so Tailwind's build-time class scanner sees every class name —
 *  never interpolate a corner string into a class name at runtime. Ported from Epic's DemoTour. */
const CORNER_CLASS = {
  'bottom-right': 'bottom-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'top-right': 'top-16 right-4',
  'top-left': 'top-16 left-4',
};

const WalkthroughContext = createContext(null);

export function useWalkthroughContext() {
  const ctx = useContext(WalkthroughContext);
  if (!ctx) throw new Error('useWalkthroughContext must be used inside a WalkthroughProvider');
  return ctx;
}

function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const onChange = () => setMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return mobile;
}

/**
 * React-state replacement for Epic's Zustand `tourStep` — `step` is the current index into
 * (already role-filtered) `steps`, or null when the walkthrough is closed. `onNavigate` is the
 * tab-SPA's active-tab setter (`setTab` in ResidentScheduler.jsx); a step's `route` (a tab id) is
 * applied on step entry.
 */
export function WalkthroughProvider({ steps, onNavigate, children }) {
  const [step, setStep] = useState(null);

  const start = () => setStep(0);
  const stop = () => setStep(null);
  const next = () => setStep(s => (s === null ? null : Math.min(s + 1, steps.length - 1)));
  const back = () => setStep(s => (s === null ? null : Math.max(s - 1, 0)));

  useEffect(() => {
    if (step === null) return;
    const s = steps[step];
    if (!s) return;
    if (s.route !== undefined) onNavigate?.(s.route);
    // No store mutation here (Epic's `apply`) — this walkthrough is narration only, never
    // touches app state (see docs/WALKTHROUGH.md).
  }, [step, steps, onNavigate]);

  return (
    <WalkthroughContext.Provider value={{ step, steps, start, stop, next, back }}>
      {children}
    </WalkthroughContext.Provider>
  );
}

/**
 * Floating guide card, corner-anchored (default bottom-right, repositioned to avoid covering the
 * spotlighted element) on desktop; a full-width bottom sheet under 640px. Auto-navigates each
 * step to the live tab it narrates; the app stays interactive behind it.
 *
 * z-index ladder: the scrim wrapper (`TourSpotlight`) is z-30, its ring z-10 (local to the
 * wrapper's own stacking context), this card is z-40, real modals in this app are z-50.
 *
 * Rendered through a portal to `document.body`: `position: fixed` breaks under any ancestor with
 * a `transform`/`filter` (the app shell has none today, but this stays correct if that changes).
 *
 * Deliberately no Escape key binding — the card is a narrator, not a modal; Exit lives on the
 * card itself.
 *
 * Ported from Epic Demo's src/components/common/DemoTour.tsx: `useNavigate()` → the tab setter
 * above, Tailwind tokens retheme to this app's plain palette, `epicNote` dropped, mobile bottom
 * sheet added.
 */
export function Walkthrough() {
  const { step, steps, stop, next, back } = useWalkthroughContext();
  const cardRef = useRef(null);
  const [spotlightMuted, setSpotlightMuted] = useState(false);
  const isMobile = useIsMobile();

  const current = step !== null ? steps[step] : null;

  // Every step starts unmuted — the escape hatch is a per-step choice, not a standing preference.
  useEffect(() => {
    setSpotlightMuted(false);
  }, [step]);

  const spotlight = useSpotlightTarget(current?.target, step ?? -1, step !== null);

  if (step === null || !current) return null;

  const corner = pickCardCorner(
    spotlight.rect,
    { width: CARD_W, height: cardRef.current?.offsetHeight || CARD_H_FALLBACK },
    { width: window.innerWidth, height: window.innerHeight },
  );

  const cardClass = isMobile
    ? 'fixed z-40 inset-x-0 bottom-0 w-full bg-white border-t border-gray-300 rounded-t-xl shadow-xl max-h-[80vh] overflow-y-auto'
    : `fixed z-40 w-[380px] bg-white border border-gray-300 rounded-lg shadow-xl ${CORNER_CLASS[corner]}`;

  return createPortal(
    <>
      <div
        ref={cardRef}
        role="dialog"
        aria-label="Walkthrough"
        data-tour-card-corner={isMobile ? 'bottom-sheet' : corner}
        className={cardClass}
      >
        <div className="flex items-center gap-2 px-3 h-9 border-b border-gray-200 bg-gray-800 text-white rounded-t-lg">
          <span className="shrink-0 whitespace-nowrap text-[10.5px] font-mono text-white/70">
            Step {step + 1} of {steps.length}
          </span>
          <div className="flex min-w-0 shrink gap-0.5 ml-1 overflow-hidden" aria-hidden="true">
            {steps.map((_, i) => (
              <span key={i} className={`w-1 h-1 shrink-0 rounded-full ${i === step ? 'bg-white' : 'bg-white/25'}`} />
            ))}
          </div>
          {current.target && (
            <button
              type="button"
              onClick={() => setSpotlightMuted(m => !m)}
              aria-label={spotlightMuted ? 'Restore the spotlight' : 'Explore freely — hide the spotlight'}
              aria-pressed={spotlightMuted}
              className="ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap text-[10.5px] text-white/70 hover:text-white"
            >
              {spotlightMuted ? <Eye size={13} /> : <EyeOff size={13} />}
              {spotlightMuted ? 'Spotlight' : 'Explore'}
            </button>
          )}
          <button
            type="button"
            onClick={stop}
            aria-label="Exit walkthrough"
            className={current.target ? 'shrink-0 text-white/70 hover:text-white' : 'ml-auto shrink-0 text-white/70 hover:text-white'}
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-3 space-y-2">
          <h3 className="text-[14px] font-semibold text-gray-800">{current.title}</h3>
          <p className="text-[13px] text-gray-600 leading-relaxed">{current.headline}</p>
          <ul className="space-y-1 pl-4 list-disc">
            {current.bullets.map((b, i) => (
              <li key={i} className="text-[12.5px] text-gray-600 leading-snug">
                {b}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center gap-2 px-3 pb-3">
          <button
            type="button"
            disabled={step === 0}
            onClick={back}
            className="flex items-center gap-1 px-2.5 h-7 rounded-md border border-gray-300 text-[12px] text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={13} /> Back
          </button>
          {step < steps.length - 1 ? (
            <button
              type="button"
              onClick={next}
              className="flex items-center gap-1 px-3 h-7 rounded-md bg-primary text-white text-[12px] font-medium hover:opacity-90 ml-auto"
            >
              Next <ChevronRight size={13} />
            </button>
          ) : (
            <button
              type="button"
              onClick={stop}
              className="px-3 h-7 rounded-md bg-primary text-white text-[12px] font-medium hover:opacity-90 ml-auto"
            >
              Finish
            </button>
          )}
        </div>
      </div>
      {current.target && (
        <TourSpotlight
          targetKey={current.target}
          status={spotlight.status}
          rect={spotlight.rect}
          muted={spotlightMuted}
          onScrimClick={() => setSpotlightMuted(true)}
        />
      )}
    </>,
    document.body,
  );
}
