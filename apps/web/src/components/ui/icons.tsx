/**
 * Small decorative status icons. They are always aria-hidden: the meaning is carried by the
 * words next to them, so status is never communicated by colour or shape alone.
 */
export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

const PATHS: Record<StatusTone, string> = {
  neutral: 'M12 8v.01M12 11v5',
  info: 'M12 8v.01M12 11v5',
  success: 'M7 12.5l3.2 3.2L17 9',
  warning: 'M12 7.5v5.5M12 16.5v.01',
  error: 'M8.5 8.5l7 7M15.5 8.5l-7 7',
};

export function StatusIcon({ tone }: { tone: StatusTone }) {
  return (
    <svg
      className="ui-icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      focusable="false"
      data-tone={tone}
    >
      {tone === 'warning' ? (
        <path d="M12 3l9.5 17h-19z" fill="none" stroke="currentColor" strokeWidth="2" />
      ) : (
        <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2" />
      )}
      <path
        d={PATHS[tone]}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Spinner() {
  return (
    <svg
      className="ui-spinner"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray="42 100"
        strokeLinecap="round"
      />
    </svg>
  );
}
