import { Checkbox } from '../components/ui/Checkbox.tsx';
import { TextField } from '../components/ui/TextField.tsx';
import { useLang } from '../i18n/use-lang.ts';
import { DONATE_MESSAGES } from './donate-messages.ts';

interface TaxValue {
  taxOptIn: boolean;
  pan: string;
  address: string;
  oldRegimeAck: boolean;
}

/**
 * Tax-benefit opt-in (#34). Rendered ONLY when the server reports the trust's approval as
 * confirmed, valid and switched on — otherwise no PAN field exists anywhere on the site.
 * Explains the old-regime condition and why PAN and address are needed before asking.
 */
export function TaxOptInFields({
  value,
  errors,
  onChange,
}: {
  value: TaxValue;
  errors: Partial<Record<'pan' | 'address' | 'ack', true>>;
  onChange: (patch: Partial<TaxValue>) => void;
}) {
  const t = DONATE_MESSAGES[useLang()];
  return (
    <div className="donate__tax">
      <Checkbox
        label={t.taxOpt}
        hint={t.taxExplain}
        checked={value.taxOptIn}
        onChange={(e) => onChange({ taxOptIn: e.target.checked })}
      />
      {value.taxOptIn && (
        <>
          <TextField
            label={t.pan}
            required
            autoComplete="off"
            maxLength={12}
            value={value.pan}
            onChange={(e) => onChange({ pan: e.target.value })}
            error={errors.pan ? t.panError : undefined}
          />
          <TextField
            label={t.address}
            required
            autoComplete="street-address"
            maxLength={300}
            value={value.address}
            onChange={(e) => onChange({ address: e.target.value })}
            error={errors.address ? t.addressError : undefined}
          />
          <Checkbox
            label={t.taxAck}
            checked={value.oldRegimeAck}
            onChange={(e) => onChange({ oldRegimeAck: e.target.checked })}
            error={errors.ack ? t.taxAckError : undefined}
          />
        </>
      )}
    </div>
  );
}
