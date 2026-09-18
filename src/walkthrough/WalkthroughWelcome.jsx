import { X } from 'lucide-react';
import { useWalkthroughContext } from './Walkthrough';
import { useWalkthroughSeen } from './useWalkthroughSeen';

/**
 * First-login welcome modal — trimmed from Epic Demo's WelcomeOverlay.tsx (which listed six
 * feature groups for a walkthrough-audience demo) down to: app name, a two-line purpose
 * statement, and Start walkthrough / Skip. Both buttons — and the backdrop/X — write the
 * seen-flag immediately (see useWalkthroughSeen); this app never re-prompts.
 */
export function WalkthroughWelcome({ session }) {
  const [seen, markSeen] = useWalkthroughSeen(session);
  const { start } = useWalkthroughContext();

  if (seen) return null;

  const close = () => markSeen();
  const startTour = () => {
    markSeen();
    start();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to the EM Residency Scheduler"
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-xl shadow-xl w-full max-w-md"
      >
        <div className="flex items-center gap-2 px-4 h-11 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-800">EM Residency Scheduler</h2>
          <button type="button" onClick={close} aria-label="Close" className="ml-auto text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-sm text-gray-600 leading-relaxed">
            Build and validate each month's resident schedule — rotations, coverage rules, jeopardy,
            and day-off requests all live here, then export straight to QGenda.
          </p>
          <p className="text-sm text-gray-600 leading-relaxed">
            A short guided tour points out where each of those lives before you dive in.
          </p>
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-200">
          <button
            type="button"
            onClick={startTour}
            className="px-3.5 h-9 rounded-md bg-primary text-white text-[13px] font-medium shadow-sm hover:opacity-90"
          >
            Start walkthrough
          </button>
          <button
            type="button"
            onClick={close}
            className="px-3 h-8 rounded-md border border-gray-300 text-[12.5px] text-gray-500 hover:bg-gray-50"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
