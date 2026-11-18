/** Decorative payment-method icons (generic shapes, no brand logos). The words carry the meaning. */
const common = {
  className: 'donate-checkout__icon',
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

/** A phone with a QR square: UPI apps or QR. */
export function UpiIcon() {
  return (
    <svg {...common} data-icon="upi">
      <rect x="6" y="2" width="12" height="20" rx="2" />
      <path d="M9.5 7h2v2h-2zM12.5 10h2v2h-2zM9.5 13h2v2h-2zM11 18h2" />
    </svg>
  );
}

export function CardIcon() {
  return (
    <svg {...common} data-icon="card">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20M6 15h4" />
    </svg>
  );
}

export function BankIcon() {
  return (
    <svg {...common} data-icon="bank">
      <path d="M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg {...common} data-icon="lock">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function ShieldIcon() {
  return (
    <svg {...common} data-icon="shield">
      <path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function MailIcon() {
  return (
    <svg {...common} data-icon="mail">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}
