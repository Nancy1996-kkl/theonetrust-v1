import { createRequire } from 'node:module';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import {
  formatInr,
  type Paise,
  type ReceiptMethod,
  type ReceiptView,
} from '@theonetrust/contracts';

/**
 * Donation acknowledgement PDF, template `ack-v1` (#29, UX brief §8). Rendered on demand from
 * the public view only, so it can never contain more than the page does: no PAN, phone, email
 * or address. Wording is "acknowledgement"; no tax form, GST or tax benefit is mentioned, and
 * approval details appear only when the trust has switched them on and they are valid.
 */
export type ReceiptLang = 'en' | 'ta';

const require = createRequire(import.meta.url);
const FONTS = {
  regular:
    require.resolve('@expo-google-fonts/noto-sans-tamil/400Regular/NotoSansTamil_400Regular.ttf'),
  bold: require.resolve('@expo-google-fonts/noto-sans-tamil/700Bold/NotoSansTamil_700Bold.ttf'),
};

/**
 * Brand palette, kept equal to apps/web/src/styles/tokens.css (green theme): primary, ink, slate,
 * accent, error. receipts.test.ts checks they match the web tokens.
 */
export const COLOUR = {
  primary: '#1d6b3f',
  text: '#1b2b22',
  muted: '#5c6e63',
  rule: '#c8edd2',
  alert: '#b42318',
};

const SITE_NAME = 'Theonetrust.in';

export const RECEIPT_STRINGS = {
  en: {
    title: 'Donation acknowledgement',
    intro: 'The trust acknowledges with thanks the donation below.',
    receiptNumber: 'Receipt number',
    reference: 'Donation reference',
    from: 'Received from',
    date: 'Date',
    amount: 'Amount',
    method: 'Payment method',
    purpose: 'Purpose',
    generalFund: 'General fund — used where the need is greatest',
    approval: 'Approval reference {reference}, valid until {date}.',
    note: 'This acknowledgement confirms that the trust received your donation. It is not a tax certificate.',
    scan: 'Scan to verify this acknowledgement',
    refunded: 'Withdrawn: this donation was refunded.',
    replaced: 'Replaced by a corrected acknowledgement. Scan the code for the current one.',
    footer: 'Template {version} · Generated from the trust’s records',
    methods: {
      upi: 'UPI',
      card: 'Card',
      netbanking: 'Netbanking',
      wallet: 'Wallet',
      bank_transfer: 'Bank transfer',
      other: 'Online payment',
    } satisfies Record<ReceiptMethod, string>,
  },
  ta: {
    title: 'நன்கொடை ஒப்புகை',
    intro: 'கீழே உள்ள நன்கொடையை அறக்கட்டளை நன்றியுடன் பெற்றுக்கொண்டது.',
    receiptNumber: 'ரசீது எண்',
    reference: 'நன்கொடை குறிப்பு எண்',
    from: 'கொடுத்தவர்',
    date: 'தேதி',
    amount: 'தொகை',
    method: 'பணம் செலுத்திய முறை',
    purpose: 'நோக்கம்',
    generalFund: 'பொது நிதி — அதிகம் தேவைப்படும் இடத்தில் பயன்படும்',
    approval: 'ஒப்புதல் எண் {reference}, {date} வரை செல்லும்.',
    note: 'அறக்கட்டளைக்கு உங்கள் நன்கொடை வந்து சேர்ந்தது என்பதற்கு இந்த ஒப்புகையே சான்று. இது வரிச் சான்றிதழ் இல்லை.',
    scan: 'இந்த ஒப்புகை உண்மையானதா என்று பார்க்க ஸ்கேன் செய்யுங்கள்',
    refunded: 'திருப்பித் தரப்பட்டது: இந்த நன்கொடைப் பணம் திரும்ப அனுப்பப்பட்டது.',
    replaced:
      'இதற்குத் திருத்திய புதிய ஒப்புகை உள்ளது. அதைப் பார்க்க இந்தக் குறியீட்டை ஸ்கேன் செய்யுங்கள்.',
    footer: 'படிவம் {version} · அறக்கட்டளையின் பதிவுகளிலிருந்து தயாரிக்கப்பட்டது',
    methods: {
      upi: 'UPI',
      card: 'கார்டு',
      netbanking: 'நெட்பேங்கிங்',
      wallet: 'வாலட்',
      bank_transfer: 'வங்கிப் பரிமாற்றம்',
      other: 'இணையம் வழியாகப் பணம் செலுத்துதல்',
    } satisfies Record<ReceiptMethod, string>,
  },
} as const;

const fill = (text: string, values: Record<string, string>) =>
  text.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '');

export function formatReceiptDate(iso: string, lang: ReceiptLang): string {
  return new Intl.DateTimeFormat(lang === 'ta' ? 'ta-IN' : 'en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

/** The labelled rows, in order — shared by the PDF and its tests. */
export function receiptRows(view: ReceiptView, lang: ReceiptLang): [string, string][] {
  const t = RECEIPT_STRINGS[lang];
  return [
    [t.receiptNumber, view.receiptNumber],
    [t.reference, view.donationReference],
    [t.from, view.donorName],
    [t.date, formatReceiptDate(view.issuedAt, lang)],
    [t.amount, formatInr(view.amountPaise as Paise, lang === 'ta' ? 'ta-IN' : 'en-IN')],
    [t.method, t.methods[view.method]],
    [t.purpose, view.purpose ? view.purpose[lang] : t.generalFund],
  ];
}

export async function renderReceiptPdf(
  view: ReceiptView,
  lang: ReceiptLang,
  verifyUrl: string,
): Promise<Buffer> {
  const t = RECEIPT_STRINGS[lang];
  const qr = await QRCode.toBuffer(verifyUrl, { errorCorrectionLevel: 'M', margin: 1, width: 300 });
  const doc = new PDFDocument({
    size: 'A4',
    margin: 56,
    font: FONTS.regular,
    info: {
      Title: `${t.title} ${view.receiptNumber}`,
      Author: view.trust.legalName ?? SITE_NAME,
      Subject: t.title,
      CreationDate: new Date(view.issuedAt),
    },
    lang: lang === 'ta' ? 'ta-IN' : 'en-IN',
  });
  doc.registerFont('regular', FONTS.regular);
  doc.registerFont('bold', FONTS.bold);
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;

  doc
    .font('bold')
    .fontSize(18)
    .fillColor(COLOUR.primary)
    .text(view.trust.legalName ?? SITE_NAME);
  if (view.trust.registration) {
    doc.font('regular').fontSize(10).fillColor(COLOUR.muted).text(view.trust.registration);
  }
  doc.moveDown(0.5);
  doc
    .moveTo(left, doc.y)
    .lineTo(left + width, doc.y)
    .lineWidth(1.5)
    .strokeColor(COLOUR.rule)
    .stroke();
  doc.moveDown(1);
  doc.font('bold').fontSize(20).fillColor(COLOUR.primary).text(t.title);
  doc.moveDown(0.3);

  if (view.state !== 'VALID') {
    doc
      .font('bold')
      .fontSize(12)
      .fillColor(COLOUR.alert)
      .text(view.state === 'REFUNDED' ? t.refunded : t.replaced);
    doc.moveDown(0.3);
  }
  doc.font('regular').fontSize(11).fillColor(COLOUR.text).text(t.intro);
  doc.moveDown(1);

  const labelWidth = 170;
  for (const [label, value] of receiptRows(view, lang)) {
    const y = doc.y;
    doc
      .font('regular')
      .fontSize(10)
      .fillColor(COLOUR.muted)
      .text(label, left, y, {
        width: labelWidth - 12,
      });
    const afterLabel = doc.y;
    doc
      .font('bold')
      .fontSize(12)
      .fillColor(COLOUR.text)
      .text(value, left + labelWidth, y, { width: width - labelWidth });
    doc.y = Math.max(afterLabel, doc.y) + 8;
  }

  if (view.approval) {
    doc.moveDown(0.5);
    doc
      .font('regular')
      .fontSize(10)
      .fillColor(COLOUR.text)
      .text(
        fill(t.approval, {
          reference: view.approval.reference,
          date: formatReceiptDate(`${view.approval.validUntil}T12:00:00Z`, lang),
        }),
        left,
        doc.y,
        { width },
      );
  }

  doc.moveDown(1);
  const qrSize = 110;
  const qrTop = doc.y;
  doc.image(qr, left, qrTop, { width: qrSize, height: qrSize });
  doc
    .font('regular')
    .fontSize(10)
    .fillColor(COLOUR.muted)
    .text(t.scan, left + qrSize + 16, qrTop + 8, { width: width - qrSize - 16 });
  doc.y = qrTop + qrSize + 20;
  doc.font('regular').fontSize(10).fillColor(COLOUR.text).text(t.note, left, doc.y, { width });

  doc
    .font('regular')
    .fontSize(8)
    .fillColor(COLOUR.muted)
    .text(
      fill(t.footer, { version: view.templateVersion }),
      left,
      doc.page.height - doc.page.margins.bottom - 12,
      { width, lineBreak: false },
    );
  doc.end();
  return done;
}
