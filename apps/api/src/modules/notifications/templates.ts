import { formatInr, type Paise, type ReceiptMethod } from '@theonetrust/contracts';

/**
 * Email templates (#30), Tamil and English. Pure functions of an allow-listed context: they can
 * only print what the worker passes in, and the worker never passes card numbers, PAN, phone,
 * address or the donor's email address. Owner emails carry both languages; donor emails use the
 * donor's language.
 */
export type TemplateId =
  | 'owner_donation_paid'
  | 'donor_donation_paid'
  | 'owner_help_request_new'
  | 'donor_subscription_started'
  | 'donor_subscription_problem';
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
  /** Razorpay payment ID or the bank reference the owner recorded. Never card data. */
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
    monthlySubject: 'Your monthly giving to {trust} is set up',
    monthlyLead: 'Thank you. Your monthly donation of {amount} is set up.',
    monthlyStart:
      'First donation: {date}. After that, on the same day each month until you cancel.',
    monthlyStartNow:
      'The first donation is taken now. After that, on the same day each month until you cancel.',
    monthlyManage: 'See or cancel your monthly giving at any time, without logging in: {url}',
    monthlyUpi: 'If you used UPI AutoPay, you can also pause or cancel it in your UPI app.',
    monthlyKeep: 'Keep this link private — anyone with it can cancel your monthly giving.',
    monthlyWhy: 'You are receiving this because you set up monthly giving.',
    problemSubject: 'Your monthly donation to {trust} could not be taken',
    problemRetry:
      'We could not take your monthly donation of {amount} this time. Your bank or UPI app may try again in the next few days — you do not need to do anything if your account has enough balance.',
    problemHalted:
      'Your monthly donation of {amount} is on hold: the last tries did not go through. Please check your UPI app or bank, or set up monthly giving again on our website.',
    problemNote:
      'No money was taken for the failed tries. To change the amount, cancel and set up a new monthly gift.',
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
    monthlySubject: '{trust}-க்கு உங்கள் மாதாந்திர நன்கொடை தொடங்கிவிட்டது',
    monthlyLead: 'நன்றி. மாதம் {amount} நன்கொடை தொடங்கிவிட்டது.',
    monthlyStart:
      'முதல் நன்கொடை: {date}. அதன் பிறகு, நீங்கள் நிறுத்தும் வரை ஒவ்வொரு மாதமும் அதே தேதியில்.',
    monthlyStartNow:
      'முதல் நன்கொடை இப்போதே எடுக்கப்படும். அதன் பிறகு, நீங்கள் நிறுத்தும் வரை ஒவ்வொரு மாதமும் அதே தேதியில்.',
    monthlyManage:
      'உங்கள் மாதாந்திர நன்கொடையை எப்போது வேண்டுமானாலும், கணக்கில் நுழையாமலே பார்க்கலாம் அல்லது ரத்து செய்யலாம்: {url}',
    monthlyUpi:
      'UPI AutoPay பயன்படுத்தியிருந்தால், உங்கள் UPI செயலியிலேயே நிறுத்தி வைக்கலாம் அல்லது ரத்து செய்யலாம்.',
    monthlyKeep:
      'இந்த இணைப்பை யாருக்கும் கொடுக்காதீர்கள் — இது யாரிடம் இருந்தாலும் உங்கள் மாதாந்திர நன்கொடையை ரத்து செய்ய முடியும்.',
    monthlyWhy: 'நீங்கள் மாதாந்திர நன்கொடை தொடங்கியதால் இது உங்களுக்கு வந்துள்ளது.',
    problemSubject: '{trust}-க்கான உங்கள் மாதாந்திர நன்கொடையை எடுக்க முடியவில்லை',
    problemRetry:
      'இந்த முறை உங்கள் {amount} மாதாந்திர நன்கொடையை எடுக்க முடியவில்லை. அடுத்த சில நாட்களில் உங்கள் வங்கி அல்லது UPI செயலி மறுபடி முயற்சி செய்யும் — கணக்கில் போதுமான பணம் இருந்தால் நீங்கள் எதுவும் செய்ய வேண்டாம்.',
    problemHalted:
      'உங்கள் {amount} மாதாந்திர நன்கொடை நின்றுவிட்டது: கடைசி சில முறை பணம் எடுக்க முடியவில்லை. உங்கள் UPI செயலியையோ வங்கியையோ பாருங்கள், அல்லது எங்கள் இணையதளத்தில் மாதாந்திர நன்கொடையை மறுபடி தொடங்குங்கள்.',
    problemNote:
      'தோல்வியடைந்த முறைகளுக்குப் பணம் எதுவும் எடுக்கவில்லை. தொகையை மாற்ற வேண்டுமென்றால், இதை ரத்து செய்துவிட்டு புதிதாகத் தொடங்குங்கள்.',
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

export interface SubscriptionStartedContext {
  donorName: string;
  amountPaise: number;
  /** IST date of the first charge, or null = now. */
  startDate: string | null;
  manageUrl: string;
  trustName: string;
}

export function renderDonorSubscriptionStarted(
  ctx: SubscriptionStartedContext,
  lang: Lang,
): RenderedEmail {
  const t = EMAIL_STRINGS[lang];
  const date = ctx.startDate
    ? new Intl.DateTimeFormat(lang === 'ta' ? 'ta-IN' : 'en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date(`${ctx.startDate}T12:00:00+05:30`))
    : null;
  const lines = [
    fill(t.donorGreeting, { name: ctx.donorName }),
    fill(t.monthlyLead, { amount: money(ctx.amountPaise, lang) }),
    date ? fill(t.monthlyStart, { date }) : t.monthlyStartNow,
    fill(t.monthlyManage, { url: '{url}' }),
    t.monthlyUpi,
    t.monthlyKeep,
    t.monthlyWhy,
  ];
  const link = `<a href="${escapeHtml(ctx.manageUrl)}">${escapeHtml(ctx.manageUrl)}</a>`;
  return {
    subject: fill(t.monthlySubject, { trust: ctx.trustName }),
    text: lines.map((line) => line.replace('{url}', ctx.manageUrl)).join('\n\n'),
    html: wrapHtml(
      lang,
      lines.map((line) => `<p>${escapeHtml(line).replace('{url}', link)}</p>`).join('\n'),
    ),
  };
}

export function renderDonorSubscriptionProblem(
  ctx: {
    donorName: string;
    amountPaise: number;
    halted: boolean;
    manageUrl: string | null;
    trustName: string;
  },
  lang: Lang,
): RenderedEmail {
  const t = EMAIL_STRINGS[lang];
  const amount = money(ctx.amountPaise, lang);
  const lines = [
    fill(t.donorGreeting, { name: ctx.donorName }),
    fill(ctx.halted ? t.problemHalted : t.problemRetry, { amount }),
    t.problemNote,
    ...(ctx.manageUrl ? [fill(t.monthlyManage, { url: '{url}' })] : []),
    t.monthlyWhy,
  ];
  const link = ctx.manageUrl
    ? `<a href="${escapeHtml(ctx.manageUrl)}">${escapeHtml(ctx.manageUrl)}</a>`
    : '';
  return {
    subject: fill(t.problemSubject, { trust: ctx.trustName }),
    text: lines.map((l) => l.replace('{url}', ctx.manageUrl ?? '')).join('\n\n'),
    html: wrapHtml(
      lang,
      lines.map((l) => `<p>${escapeHtml(l).replace('{url}', link)}</p>`).join('\n'),
    ),
  };
}
