import { formatInr, type Paise, type ReceiptMethod } from '@theonetrust/contracts';

/**
 * Email templates (#30), Tamil and English. Pure functions of an allow-listed context: they can
 * only print what the worker passes in, and the worker never passes card numbers, PAN, phone,
 * address or the donor's email address. Owner emails carry both languages; donor emails use the
 * donor's language.
 */
export type TemplateId = 'owner_donation_paid' | 'donor_donation_paid' | 'owner_help_request_new';
export type Lang = 'en' | 'ta';

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export interface DonationPaidContext {
  reference: string;
  amountPaise: number;
  programme: { en: string; ta: string } | null;
  method: ReceiptMethod;
  /** The gateway's payment ID or the bank reference the owner recorded. Never card data. */
  paymentReference: string | null;
  receiptNumber: string | null;
  receiptUrl: string | null;
  donorName: string;
  /** Owner email and sheet only — never shown on public pages or in URLs. */
  donorEmail: string | null;
  donorPhone: string | null;
  /** Part of monthly giving (a subscription charge) rather than a one-time gift. */
  monthly: boolean;
  /** When the donation was verified as paid (ISO); null if unknown. */
  paidAt: string | null;
  trustName: string;
  dashboardUrl: string;
}

export interface HelpRequestContext {
  reference: string;
  kind: 'FULL' | 'CALLBACK';
  dashboardUrl: string;
}

const METHOD: Record<Lang, Record<ReceiptMethod, string>> = {
  en: {
    upi: 'UPI',
    card: 'Card',
    netbanking: 'Netbanking',
    wallet: 'Wallet',
    bank_transfer: 'Bank transfer',
    other: 'Online payment',
  },
  ta: {
    upi: 'UPI',
    card: 'கார்டு',
    netbanking: 'நெட்பேங்கிங்',
    wallet: 'வாலட்',
    bank_transfer: 'வங்கிப் பரிமாற்றம்',
    other: 'இணையம் வழியாகப் பணம் செலுத்துதல்',
  },
};

export const EMAIL_STRINGS = {
  en: {
    ownerPaidSubject: 'Donation received: {amount} ({reference})',
    ownerPaidLead: 'A donation was verified and recorded as paid.',
    reference: 'Donation reference',
    amount: 'Amount',
    purpose: 'Purpose',
    generalFund: 'General fund',
    method: 'Payment method',
    paymentReference: 'Payment reference',
    receipt: 'Acknowledgement',
    noReceipt: 'Not requested (or below the acknowledgement minimum)',
    donor: 'Donor',
    donorEmailLabel: 'Donor email',
    donorPhoneLabel: 'Donor mobile',
    notGiven: 'Not given',
    kind: 'Type',
    oneTime: 'One-time',
    monthlyKind: 'Monthly',
    paidOn: 'Paid on (IST)',
    openDashboard: 'Open the dashboard',
    donorSubject: 'Thank you — your donation to {trust} was received',
    donorGreeting: 'Dear {name},',
    donorLead: 'Thank you. Your donation of {amount} was received and verified.',
    donorReceipt: 'Your donation acknowledgement ({number}): {url}',
    donorKeep: 'Keep this link private — anyone with it can see the acknowledgement.',
    donorNote: 'This email is an acknowledgement of your donation. It is not a tax certificate.',
    donorWhy: 'You are receiving this because you gave your email address with your donation.',
    helpSubject: 'New help request {reference}',
    helpLead: 'A new help request arrived. Details are in the dashboard only.',
    helpReference: 'Request reference',
    helpKind: 'Type',
    helpFull: 'Full request',
    helpCallback: 'Call-back request',
  },
  ta: {
    ownerPaidSubject: 'நன்கொடை வந்தது: {amount} ({reference})',
    ownerPaidLead: 'ஒரு நன்கொடைப் பணம் வந்தது சரிபார்க்கப்பட்டு, கணக்கில் பதிவாகிவிட்டது.',
    reference: 'நன்கொடை குறிப்பு எண்',
    amount: 'தொகை',
    purpose: 'நோக்கம்',
    generalFund: 'பொது நிதி',
    method: 'பணம் செலுத்திய முறை',
    paymentReference: 'பணம் செலுத்திய குறிப்பு எண்',
    receipt: 'ஒப்புகை',
    noReceipt: 'கேட்கவில்லை (அல்லது ஒப்புகைக்கான குறைந்த தொகையைவிடக் குறைவு)',
    donor: 'நன்கொடையாளர்',
    donorEmailLabel: 'நன்கொடையாளர் மின்னஞ்சல்',
    donorPhoneLabel: 'நன்கொடையாளர் கைபேசி',
    notGiven: 'கொடுக்கவில்லை',
    kind: 'வகை',
    oneTime: 'ஒருமுறை',
    monthlyKind: 'மாதந்தோறும்',
    paidOn: 'பணம் வந்த நேரம் (இந்திய நேரம்)',
    openDashboard: 'நிர்வாகப் பக்கத்தைத் திற',
    donorSubject: 'நன்றி — {trust}-க்கு உங்கள் நன்கொடை வந்து சேர்ந்தது',
    donorGreeting: 'அன்புள்ள {name},',
    donorLead: 'நன்றி. நீங்கள் கொடுத்த {amount} வந்து சேர்ந்தது; அதை நாங்கள் சரிபார்த்துவிட்டோம்.',
    donorReceipt: 'உங்கள் நன்கொடை ஒப்புகை ({number}): {url}',
    donorKeep:
      'இந்த இணைப்பை யாருக்கும் கொடுக்காதீர்கள் — இது யாரிடம் இருந்தாலும் ஒப்புகையைப் பார்க்க முடியும்.',
    donorNote: 'இந்த மின்னஞ்சல் உங்கள் நன்கொடைக்கான ஒப்புகை. இது வரிச் சான்றிதழ் இல்லை.',
    donorWhy: 'நன்கொடை கொடுக்கும்போது உங்கள் மின்னஞ்சலைக் கொடுத்ததால் இது உங்களுக்கு வந்துள்ளது.',
    helpSubject: 'புதிய உதவிக் கோரிக்கை {reference}',
    helpLead:
      'புதிய உதவிக் கோரிக்கை வந்துள்ளது. விவரங்களை நிர்வாகப் பக்கத்தில் மட்டும் பார்க்கலாம்.',
    helpReference: 'கோரிக்கை குறிப்பு எண்',
    helpKind: 'வகை',
    helpFull: 'முழுக் கோரிக்கை',
    helpCallback: 'திரும்ப அழைக்கும் கோரிக்கை',
  },
} as const;

const fill = (text: string, values: Record<string, string>) =>
  text.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '');

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const money = (paise: number, lang: Lang) =>
  formatInr(paise as Paise, lang === 'ta' ? 'ta-IN' : 'en-IN');

type Row = [string, string];

/** "2026-11-09 14:05" in India time — what the owner and the sheet read. */
export function istDateTime(iso: string): string {
  return new Date(new Date(iso).getTime() + 330 * 60_000)
    .toISOString()
    .slice(0, 16)
    .replace('T', ' ');
}

/** The payment method in words, for the owner's sheet. */
export const methodLabel = (method: ReceiptMethod, lang: Lang = 'en') => METHOD[lang][method];

function block(lead: string, rows: Row[], link?: { label: string; url: string }) {
  const text = [
    lead,
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(link ? ['', `${link.label}: ${link.url}`] : []),
  ];
  const html = [
    `<p>${escapeHtml(lead)}</p>`,
    `<table role="presentation" cellpadding="4">${rows
      .map(
        ([k, v]) => `<tr><td>${escapeHtml(k)}</td><td><strong>${escapeHtml(v)}</strong></td></tr>`,
      )
      .join('')}</table>`,
    ...(link ? [`<p><a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a></p>`] : []),
  ];
  return { text: text.join('\n'), html: html.join('\n') };
}

function wrapHtml(lang: Lang | 'en ta', body: string): string {
  return `<!doctype html><html lang="${lang === 'ta' ? 'ta' : 'en'}"><body style="font-family:sans-serif;line-height:1.5">${body}</body></html>`;
}

function both(make: (lang: Lang) => { text: string; html: string }) {
  const en = make('en');
  const ta = make('ta');
  return {
    text: `${en.text}\n\n——\n\n${ta.text}`,
    html: wrapHtml('en ta', `${en.html}<hr>${`<div lang="ta">${ta.html}</div>`}`),
  };
}

export function renderOwnerDonationPaid(ctx: DonationPaidContext): RenderedEmail {
  const body = both((lang) => {
    const t = EMAIL_STRINGS[lang];
    return block(
      t.ownerPaidLead,
      [
        [t.reference, ctx.reference],
        [t.amount, money(ctx.amountPaise, lang)],
        [t.purpose, ctx.programme ? ctx.programme[lang] : t.generalFund],
        [t.method, METHOD[lang][ctx.method]],
        ...(ctx.paymentReference ? ([[t.paymentReference, ctx.paymentReference]] as Row[]) : []),
        [
          t.receipt,
          ctx.receiptNumber && ctx.receiptUrl
            ? `${ctx.receiptNumber} — ${ctx.receiptUrl}`
            : t.noReceipt,
        ],
        [t.donor, ctx.donorName],
        [t.donorEmailLabel, ctx.donorEmail ?? t.notGiven],
        [t.donorPhoneLabel, ctx.donorPhone ?? t.notGiven],
        [t.kind, ctx.monthly ? t.monthlyKind : t.oneTime],
        ...(ctx.paidAt ? ([[t.paidOn, istDateTime(ctx.paidAt)]] as Row[]) : []),
      ],
      { label: t.openDashboard, url: ctx.dashboardUrl },
    );
  });
  const values = { amount: money(ctx.amountPaise, 'en'), reference: ctx.reference };
  return {
    subject: `${fill(EMAIL_STRINGS.en.ownerPaidSubject, values)} / ${fill(EMAIL_STRINGS.ta.ownerPaidSubject, { ...values, amount: money(ctx.amountPaise, 'ta') })}`,
    ...body,
  };
}

export function renderDonorDonationPaid(ctx: DonationPaidContext, lang: Lang): RenderedEmail {
  const t = EMAIL_STRINGS[lang];
  const amount = money(ctx.amountPaise, lang);
  const receipt =
    ctx.receiptNumber && ctx.receiptUrl ? { number: ctx.receiptNumber, url: ctx.receiptUrl } : null;
  const text = [
    fill(t.donorGreeting, { name: ctx.donorName }),
    fill(t.donorLead, { amount }),
    ...(receipt ? [fill(t.donorReceipt, receipt), t.donorKeep] : []),
    t.donorNote,
    t.donorWhy,
  ];
  const link = receipt ? `<a href="${escapeHtml(receipt.url)}">${escapeHtml(receipt.url)}</a>` : '';
  const html = [
    escapeHtml(fill(t.donorGreeting, { name: ctx.donorName })),
    escapeHtml(fill(t.donorLead, { amount })),
    ...(receipt
      ? [
          escapeHtml(fill(t.donorReceipt, { number: receipt.number, url: '{url}' })).replace(
            '{url}',
            link,
          ),
          escapeHtml(t.donorKeep),
        ]
      : []),
    escapeHtml(t.donorNote),
    escapeHtml(t.donorWhy),
  ]
    .map((line) => `<p>${line}</p>`)
    .join('\n');
  return {
    subject: fill(t.donorSubject, { trust: ctx.trustName }),
    text: text.join('\n\n'),
    html: wrapHtml(lang, html),
  };
}

export function renderOwnerHelpRequest(ctx: HelpRequestContext): RenderedEmail {
  const body = both((lang) => {
    const t = EMAIL_STRINGS[lang];
    return block(
      t.helpLead,
      [
        [t.helpReference, ctx.reference],
        [t.helpKind, ctx.kind === 'CALLBACK' ? t.helpCallback : t.helpFull],
      ],
      { label: t.openDashboard, url: ctx.dashboardUrl },
    );
  });
  return {
    subject: `${fill(EMAIL_STRINGS.en.helpSubject, { reference: ctx.reference })} / ${fill(EMAIL_STRINGS.ta.helpSubject, { reference: ctx.reference })}`,
    ...body,
  };
}
