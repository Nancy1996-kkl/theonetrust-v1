import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { focusableIn } from './focus.ts';
import { useUiStrings } from './ui-strings.ts';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Short sentence read with the title (aria-describedby). */
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons row at the bottom. */
  footer?: ReactNode;
  /** Element to focus first; defaults to the first focusable element in the dialog. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Set false while a payment or save is in progress so Esc / backdrop cannot interrupt it. */
  dismissible?: boolean;
  /** `panel` slides in from the side on wide screens (Donate / Get Help); `modal` is centred. */
  variant?: 'modal' | 'panel';
}

/**
 * Accessible modal dialog / side panel.
 * - Focus moves inside on open, Tab and Shift+Tab are trapped, and focus returns to the
 *   element that opened it on close.
 * - Esc and the backdrop close it unless `dismissible` is false.
 * - The rest of the page is made inert and the body stops scrolling while it is open.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  initialFocusRef,
  dismissible = true,
  variant = 'modal',
}: DialogProps) {
  const strings = useUiStrings();
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);

  useEffect(() => {
    onCloseRef.current = onClose;
    dismissibleRef.current = dismissible;
  });

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const portalRoot = panel?.closest<HTMLElement>('.ui-dialog-root') ?? null;

    // Make everything else inert (screen readers and pointer), remembering what we changed.
    const madeInert: HTMLElement[] = [];
    for (const sibling of document.body.children) {
      if (
        sibling instanceof HTMLElement &&
        sibling !== portalRoot &&
        !sibling.hasAttribute('inert')
      ) {
        sibling.setAttribute('inert', '');
        madeInert.push(sibling);
      }
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const first = initialFocusRef?.current ?? (panel ? focusableIn(panel)[0] : undefined);
    (first ?? panel)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (dismissibleRef.current) {
          event.stopPropagation();
          onCloseRef.current();
        }
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const items = focusableIn(panel);
      const firstItem = items.at(0);
      const lastItem = items.at(-1);
      if (!firstItem || !lastItem) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const active = document.activeElement;
      if (event.shiftKey && (active === firstItem || active === panel)) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && active === lastItem) {
        event.preventDefault();
        firstItem.focus();
      } else if (!panel.contains(active)) {
        event.preventDefault();
        firstItem.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      for (const el of madeInert) el.removeAttribute('inert');
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, [open, initialFocusRef]);

  if (!open) return null;

  return createPortal(
    <div className={`ui-dialog-root ui-dialog-root--${variant}`}>
      <div
        className="ui-dialog__backdrop"
        aria-hidden="true"
        data-testid="dialog-backdrop"
        onClick={() => {
          if (dismissible) onClose();
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`ui-dialog surface ui-dialog--${variant}`}
      >
        <div className="ui-dialog__header">
          <h2 id={titleId} className="ui-dialog__title">
            {title}
          </h2>
          {dismissible && (
            <button type="button" className="ui-dialog__close" onClick={onClose}>
              <span aria-hidden="true">×</span>
              <span className="visually-hidden">{strings.close}</span>
            </button>
          )}
        </div>
        {description && (
          <p id={descId} className="ui-dialog__description">
            {description}
          </p>
        )}
        <div className="ui-dialog__body">{children}</div>
        {footer && <div className="ui-dialog__footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
