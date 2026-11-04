import {
  UPI_AUTOPAY_MAX_PAISE,
  formatInr,
  monthlyStartDate,
  type Paise,
} from '@theonetrust/contracts';
import { Checkbox } from '../components/ui/Checkbox.tsx';
import { useLang } from '../i18n/use-lang.ts';
import { DONATE_MESSAGES } from './donate-messages.ts';

const fill = (text: string, values: Record<string, string>) =>
  text.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '');

/**
 * Monthly giving consent (#32): amount, frequency, start date, how to pay and how to cancel —
 * shown before the donor agrees. The start date follows the same rule as the API (never the
 * 29th–31st). Above ₹15,000 it explains UPI AutoPay is not available and warns about PhonePe/BHIM.
 */
export function MonthlyConsent({
  amountPaise,
  checked,
  error,
  onChange,
  now = new Date(),
}: {
  amountPaise: number;
  checked: boolean;
  error: boolean;
  onChange: (value: boolean) => void;
  now?: Date;
}) {
  const lang = useLang();
  const t = DONATE_MESSAGES[lang];
  const locale = lang === 'ta' ? 'ta-IN' : 'en-IN';
  const amount = formatInr(amountPaise as Paise, locale);
  const start = monthlyStartDate(now);
  const startText = start
    ? fill(t.consentStartOn, {
        date: new Intl.DateTimeFormat(locale, {
          timeZone: 'Asia/Kolkata',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }).format(new Date(`${start}T12:00:00+05:30`)),
      })
    : t.consentStartNow;
  const large = amountPaise > UPI_AUTOPAY_MAX_PAISE;
  return (
    <section className="donate__consent" aria-labelledby="monthly-consent">
      <h4 id="monthly-consent">{t.consentTitle}</h4>
      <ul>
        <li>{fill(t.consentAmount, { amount })}</li>
        <li>{startText}</li>
        <li>{large ? t.consentMethodMandate : t.consentMethodUpi}</li>
        {large && <li>{t.consentPsp}</li>}
        <li>{t.consentCancel}</li>
      </ul>
      <Checkbox
        label={fill(t.consentAgree, { amount })}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        error={error ? t.mandateError : undefined}
      />
    </section>
  );
}
