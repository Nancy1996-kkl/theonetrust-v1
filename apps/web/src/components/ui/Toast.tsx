import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StatusIcon } from './icons.tsx';
import {
  DEFAULT_TOAST_MS,
  ToastContext,
  type ToastInput,
  type ToastItem,
  type ToastTone,
} from './toast-context.ts';
import { useUiStrings, type UiStrings } from './ui-strings.ts';

function prefix(tone: ToastTone, strings: UiStrings): string {
  return {
    info: strings.infoPrefix,
    success: strings.successPrefix,
    warning: strings.warningPrefix,
    error: strings.errorPrefix,
  }[tone];
}

/**
 * Toasts plus their live regions. Both regions are rendered (empty) from the first paint so
 * screen readers register them before any message arrives — a region inserted together with
 * its text is often not announced. Errors use the assertive region; everything else polite.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const strings = useUiStrings();
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const show = useCallback((input: ToastInput) => {
    const id = nextId.current++;
    const tone = input.tone ?? 'info';
    const durationMs =
      tone === 'error'
        ? null
        : input.durationMs === undefined
          ? DEFAULT_TOAST_MS
          : input.durationMs;
    setItems((current) => [...current, { id, tone, message: input.message, durationMs }]);
    return id;
  }, []);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);
  const polite = items.filter((item) => item.tone !== 'error');
  const assertive = items.filter((item) => item.tone === 'error');

  return (
    <ToastContext.Provider value={api}>
      {children}
      <section className="ui-toasts" aria-label={strings.notifications}>
        <div role="status" aria-live="polite" className="ui-toasts__region">
          {polite.map((item) => (
            <Toast key={item.id} item={item} onDismiss={dismiss} />
          ))}
        </div>
        <div role="alert" aria-live="assertive" className="ui-toasts__region">
          {assertive.map((item) => (
            <Toast key={item.id} item={item} onDismiss={dismiss} />
          ))}
        </div>
      </section>
    </ToastContext.Provider>
  );
}

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const strings = useUiStrings();
  const [paused, setPaused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Pause auto-dismiss while the pointer or keyboard focus is on the toast (WCAG 2.2.1).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pause = () => setPaused(true);
    const resume = (event: Event) => {
      const next = (event as FocusEvent).relatedTarget;
      if (next instanceof Node && el.contains(next)) return;
      setPaused(false);
    };
    el.addEventListener('pointerenter', pause);
    el.addEventListener('pointerleave', resume);
    el.addEventListener('focusin', pause);
    el.addEventListener('focusout', resume);
    return () => {
      el.removeEventListener('pointerenter', pause);
      el.removeEventListener('pointerleave', resume);
      el.removeEventListener('focusin', pause);
      el.removeEventListener('focusout', resume);
    };
  }, []);

  useEffect(() => {
    if (item.durationMs === null || paused) return;
    const timer = window.setTimeout(() => onDismiss(item.id), item.durationMs);
    return () => window.clearTimeout(timer);
  }, [item.durationMs, item.id, onDismiss, paused]);

  return (
    <div
      className={`ui-toast ui-toast--${item.tone}`}
      data-tone={item.tone}
      data-paused={paused || undefined}
      ref={ref}
    >
      <StatusIcon tone={item.tone} />
      <p className="ui-toast__message">
        <span className="visually-hidden">{prefix(item.tone, strings)}</span> {item.message}
      </p>
      <button type="button" className="ui-toast__dismiss" onClick={() => onDismiss(item.id)}>
        <span aria-hidden="true">×</span>
        <span className="visually-hidden">{strings.dismiss}</span>
      </button>
    </div>
  );
}

export interface LiveRegionProps {
  /** Current message; changing it is announced. Keep the component mounted and swap text. */
  message: ReactNode;
  politeness?: 'polite' | 'assertive';
  /** Render visually hidden (screen readers only). */
  hidden?: boolean;
  className?: string;
}

/** A persistent live region for inline status updates (e.g. "3 results", "Saved"). */
export function LiveRegion({
  message,
  politeness = 'polite',
  hidden = true,
  className,
}: LiveRegionProps) {
  return (
    <div
      role={politeness === 'assertive' ? 'alert' : 'status'}
      aria-live={politeness}
      aria-atomic="true"
      className={[hidden && 'visually-hidden', className].filter(Boolean).join(' ') || undefined}
    >
      {message}
    </div>
  );
}
