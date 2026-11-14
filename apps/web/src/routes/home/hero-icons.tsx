/** Decorative hero icons. Always aria-hidden: the words beside them carry the meaning. */
const common = {
  className: 'landing-hero__icon',
  viewBox: '0 0 24 24',
  width: 20,
  height: 20,
  'aria-hidden': true,
  focusable: false,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export function HeartIcon() {
  return (
    <svg {...common} data-icon="heart">
      <path
        d="M12 20s-7-4.4-9.2-8.6C1.3 8.4 3 5 6.4 5c2 0 3.6 1.2 4.6 2.8C12 6.2 13.6 5 15.6 5 19 5 20.7 8.4 19.2 11.4 17 15.6 12 20 12 20z"
        fill="currentColor"
      />
    </svg>
  );
}

/** A plain chat bubble (not a brand logo) for the WhatsApp button. */
export function ChatIcon() {
  return (
    <svg {...common} data-icon="chat">
      <path d="M4 18.5 5.3 15A7.5 7.5 0 1 1 9 18.6L4 18.5z" />
      <path d="M9 11h.01M12 11h.01M15 11h.01" />
    </svg>
  );
}

/** A plain phone handset. */
export function PhoneIcon() {
  return (
    <svg {...common} data-icon="phone">
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
    </svg>
  );
}

/** A plain envelope. */
export function MailIcon() {
  return (
    <svg {...common} data-icon="mail">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

export function ArrowIcon() {
  return (
    <svg {...common} data-icon="arrow">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function PinIcon() {
  return (
    <svg {...common} data-icon="pin">
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg {...common} data-icon="pause">
      <path d="M9 6v12M15 6v12" />
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg {...common} data-icon="play">
      <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
    </svg>
  );
}

export function SealIcon() {
  return (
    <svg {...common} className="landing-facts__seal" data-icon="seal">
      <circle cx="12" cy="9" r="6" />
      <path d="M9.5 9l1.8 1.8L14.8 7.4M8.5 14l-1.5 7 5-2.5 5 2.5-1.5-7" />
    </svg>
  );
}
