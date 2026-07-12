import { useState } from 'react';

export const TOUR_STORAGE_KEY = 'devsurface-tour-done';

interface TourStep {
  title: string;
  body: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: 'Welcome to DevSurface 👋',
    body: 'This dashboard turns a code project into buttons and plain English. Nothing here talks to the internet — everything runs on your computer. This tour takes about a minute.'
  },
  {
    title: 'Overview: the big picture',
    body: 'The Overview page shows what the project is, whether it is healthy, and the scripts you can run. Green means good; anything that needs attention shows a badge in the sidebar.'
  },
  {
    title: 'Onboarding: your setup checklist',
    body: 'The Onboarding page tracks how ready the project is on this machine, step by step, with a button for each step. When it says 100%, you are good to go.'
  },
  {
    title: 'Scripts: run things with one click',
    body: 'Every script has a plain-English explanation and a Run button. Logs stream live on the Logs page. You can always stop anything with the Stop button — nothing is permanent.'
  },
  {
    title: 'Learn: your built-in translator',
    body: 'The Learn page explains the project in plain English, walks you through the first run, translates scary error messages, and has a 100-term jargon dictionary.'
  },
  {
    title: 'Notes: your personal scratchpad',
    body: 'Keep notes and checklists per project on the Notes page. They live only on this computer and never end up in git.'
  },
  {
    title: 'Stuck? Get help fast',
    body: 'The Toolbox page has a one-click “help bundle” — a single file you can send to a teammate that contains everything they need to help you (and none of your secrets).'
  }
];

export function markTourDone(): void {
  try {
    window.localStorage.setItem(TOUR_STORAGE_KEY, '1');
  } catch {
    // Storage unavailable — the tour will show again next time.
  }
}

export function isTourDone(): boolean {
  try {
    return window.localStorage.getItem(TOUR_STORAGE_KEY) === '1';
  } catch {
    return true;
  }
}

/** First-run guided tour: seven short cards, skippable at any point. */
export function TourOverlay({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const current = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;

  function finish(): void {
    markTourDone();
    onClose();
  }

  return (
    <div className="drawer-backdrop" role="presentation">
      <div className="shortcuts-modal tour-modal" role="dialog" aria-label="Welcome tour">
        <header>
          <h2>{current.title}</h2>
          <span className="learn-muted">
            {step + 1} / {TOUR_STEPS.length}
          </span>
        </header>
        <p className="tour-body">{current.body}</p>
        <div className="tour-dots" aria-hidden="true">
          {TOUR_STEPS.map((_, index) => (
            <i className={index === step ? 'active' : ''} key={index} />
          ))}
        </div>
        <footer className="tour-actions">
          <button className="minor-button" onClick={finish} type="button">
            Skip tour
          </button>
          <span>
            {step > 0 ? (
              <button className="minor-button" onClick={() => setStep(step - 1)} type="button">
                Back
              </button>
            ) : null}
            <button
              className="utility-button"
              onClick={() => (isLast ? finish() : setStep(step + 1))}
              type="button"
            >
              {isLast ? 'Start using DevSurface' : 'Next'}
            </button>
          </span>
        </footer>
      </div>
    </div>
  );
}
