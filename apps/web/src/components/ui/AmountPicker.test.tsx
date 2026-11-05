import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Paise } from '@theonetrust/contracts';
import { expectNoA11yViolations } from '../../test/a11y.ts';
import { renderUi } from '../../test/render-ui.tsx';
import { AmountPicker, type AmountPickerProps } from './AmountPicker.tsx';
import { parseRupees } from './amount.ts';
import type { UiLang } from './ui-strings.ts';

describe('parseRupees', () => {
  it.each([
    ['1', 1],
    ['500', 500],
    [' 2,500 ', 2500],
    ['1,00,000', 100000],
    ['₹750', 750],
    ['0500', 500],
  ])('accepts %j as ₹%i', (raw, rupees) => {
    expect(parseRupees(raw)).toEqual({ ok: true, rupees });
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['12.50', 'format'],
    ['-5', 'format'],
    ['1e3', 'format'],
    ['abc', 'format'],
    ['௫௦௦', 'format'],
    ['99999999999999999999', 'format'],
    ['0', 'min'],
  ] as const)('rejects %j (%s)', (raw, reason) => {
    expect(parseRupees(raw)).toEqual({ ok: false, reason });
  });

  it('applies custom min and max', () => {
    expect(parseRupees('499', 500)).toEqual({ ok: false, reason: 'min' });
    expect(parseRupees('500', 500)).toEqual({ ok: true, rupees: 500 });
    expect(parseRupees('15001', 1, 15000)).toEqual({ ok: false, reason: 'max' });
    expect(parseRupees('15000', 1, 15000)).toEqual({ ok: true, rupees: 15000 });
  });
});

function Harness({
  onChange = vi.fn(),
  initial = null,
  lang: _lang,
  ...props
}: Partial<AmountPickerProps> & { initial?: Paise | null; lang?: UiLang }) {
  const [value, setValue] = useState<Paise | null>(initial);
  return (
    <>
      <AmountPicker
        legend="Amount"
        presetsRupees={[500, 1000, 2500]}
        {...props}
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange(v);
        }}
      />
      <output data-testid="value">{value === null ? 'none' : String(value)}</output>
    </>
  );
}

describe('AmountPicker', () => {
  it('shows presets formatted as INR and emits integer paise', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderUi(<Harness onChange={onChange} />);
    expect(screen.getByRole('group', { name: 'Amount' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: '₹1,000' }));
    expect(onChange).toHaveBeenLastCalledWith(100000);
    expect(screen.getByTestId('value')).toHaveTextContent('100000');
  });

  it('arrow keys move between presets', async () => {
    const user = userEvent.setup();
    renderUi(<Harness />);
    await user.click(screen.getByRole('radio', { name: '₹500' }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: '₹1,000' })).toBeChecked();
    expect(screen.getByTestId('value')).toHaveTextContent('100000');
  });

  it('other amount: valid whole rupees become paise', async () => {
    const user = userEvent.setup();
    renderUi(<Harness />);
    await user.click(screen.getByRole('radio', { name: 'Other amount (₹)' }));
    const input = screen.getByRole('textbox', { name: 'Other amount (₹)' });
    expect(input).toHaveAttribute('inputmode', 'numeric');
    await user.type(input, '1,234');
    expect(screen.getByTestId('value')).toHaveTextContent('123400');
    await user.tab();
    expect(screen.queryByText(/whole rupee/)).not.toBeInTheDocument();
  });

  it('other amount: invalid input clears the value and shows an error after blur', async () => {
    const user = userEvent.setup();
    renderUi(<Harness />);
    await user.click(screen.getByRole('radio', { name: 'Other amount (₹)' }));
    const input = screen.getByRole('textbox', { name: 'Other amount (₹)' });
    await user.type(input, '12.5');
    expect(screen.getByTestId('value')).toHaveTextContent('none');
    expect(screen.queryByText(/whole rupee/)).not.toBeInTheDocument();
    await user.tab();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Error: Enter a whole rupee amount of ₹1 or more.');
  });

  it('switching back to a preset clears the custom error', async () => {
    const user = userEvent.setup();
    renderUi(<Harness />);
    await user.click(screen.getByRole('radio', { name: 'Other amount (₹)' }));
    await user.type(screen.getByRole('textbox'), '0');
    await user.tab();
    expect(screen.getByText(/whole rupee/)).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: '₹500' }));
    expect(screen.queryByText(/whole rupee/)).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByTestId('value')).toHaveTextContent('50000');
  });

  it('empty other amount is only an error when required', async () => {
    const user = userEvent.setup();
    const { unmount } = renderUi(<Harness />);
    await user.click(screen.getByRole('radio', { name: 'Other amount (₹)' }));
    await user.click(screen.getByRole('textbox'));
    await user.tab();
    expect(screen.queryByText(/whole rupee/)).not.toBeInTheDocument();
    unmount();
    renderUi(<Harness required />);
    await user.click(screen.getByRole('radio', { name: 'Other amount (₹)' }));
    await user.click(screen.getByRole('textbox'));
    await user.tab();
    expect(screen.getByText(/whole rupee/)).toBeInTheDocument();
  });

  it('enforces a maximum with its own message', async () => {
    const user = userEvent.setup();
    renderUi(<Harness maxRupees={15000} maxMessage="Up to ₹15,000 by UPI AutoPay." />);
    await user.click(screen.getByRole('radio', { name: 'Other amount (₹)' }));
    await user.type(screen.getByRole('textbox'), '20000');
    await user.tab();
    expect(screen.getByText('Up to ₹15,000 by UPI AutoPay.')).toBeInTheDocument();
    expect(screen.getByTestId('value')).toHaveTextContent('none');
  });

  it('starts in custom mode for a non-preset value and keeps it', () => {
    renderUi(<Harness initial={77700 as Paise} />);
    expect(screen.getByRole('radio', { name: 'Other amount (₹)' })).toBeChecked();
    expect(screen.getByRole('textbox')).toHaveValue('777');
  });

  it('starts on the matching preset for a preset value', () => {
    renderUi(<Harness initial={250000 as Paise} />);
    expect(screen.getByRole('radio', { name: '₹2,500' })).toBeChecked();
  });

  it('shows a caller error (e.g. from the server)', () => {
    renderUi(<Harness error="Amount could not be accepted." />);
    expect(screen.getByRole('group', { name: 'Amount' })).toHaveAccessibleDescription(
      'Error: Amount could not be accepted.',
    );
  });

  it('works in Tamil', async () => {
    const user = userEvent.setup();
    renderUi(<Harness legend="தொகை" />, 'ta');
    await user.click(screen.getByRole('radio', { name: 'வேறு தொகை (₹)' }));
    await user.type(screen.getByRole('textbox'), 'abc');
    await user.tab();
    expect(
      screen.getByText('₹1 அல்லது அதற்கு மேல், முழு ரூபாயாகத் தொகையை எழுதுங்கள்.'),
    ).toBeInTheDocument();
  });

  it('has no axe violations (preset and custom with error)', async () => {
    const user = userEvent.setup();
    const { container } = renderUi(<Harness hint="Choose or type an amount" />);
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('radio', { name: 'Other amount (₹)' }));
    await user.type(screen.getByRole('textbox'), 'x');
    await user.tab();
    await expectNoA11yViolations(container);
  });
});
