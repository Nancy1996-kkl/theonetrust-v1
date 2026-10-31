import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '../../test/a11y.ts';
import { Checkbox } from './Checkbox.tsx';
import { RadioCardGroup } from './RadioCardGroup.tsx';
import { SelectField } from './SelectField.tsx';
import { TextField } from './TextField.tsx';
import { renderUi } from '../../test/render-ui.tsx';

describe('TextField', () => {
  it('ties label, hint and error to the input', () => {
    renderUi(
      <TextField label="Name" hint="As you want it on the receipt" error="Enter your name" />,
    );
    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(input).toHaveAccessibleDescription(
      'As you want it on the receipt Error: Enter your name',
    );
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('default state: no aria-invalid and no description', () => {
    renderUi(<TextField label="Name" />);
    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
  });

  it('marks required and optional in words', () => {
    renderUi(
      <>
        <TextField label="Email" required />
        <TextField label="Phone" showOptional />
      </>,
    );
    expect(screen.getByRole('textbox', { name: 'Email (required)' })).toBeRequired();
    expect(screen.getByRole('textbox', { name: 'Phone (optional)' })).not.toBeRequired();
  });

  it('marks required in Tamil', () => {
    renderUi(<TextField label="பெயர்" required />, 'ta');
    expect(screen.getByRole('textbox', { name: 'பெயர் (கட்டாயம்)' })).toBeRequired();
  });

  it('keeps a caller-supplied id', () => {
    renderUi(<TextField id="donor-name" label="Name" hint="Hint" />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('id', 'donor-name');
    expect(input).toHaveAttribute('aria-describedby', 'donor-name-hint');
  });

  it('accepts typing and is disabled when asked', async () => {
    const user = userEvent.setup();
    renderUi(
      <>
        <TextField label="Name" />
        <TextField label="Locked" disabled />
      </>,
    );
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'அன்பு');
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('அன்பு');
    expect(screen.getByRole('textbox', { name: 'Locked' })).toBeDisabled();
  });

  it('has no axe violations (valid and invalid)', async () => {
    const { container } = renderUi(
      <>
        <TextField label="Name" hint="Hint" />
        <TextField label="Email" error="Enter a valid email" type="email" />
      </>,
    );
    await expectNoA11yViolations(container);
  });
});

describe('SelectField', () => {
  const options = [
    { value: 'education', label: 'Education' },
    { value: 'medical', label: 'Medical access' },
    { value: 'closed', label: 'Closed', disabled: true },
  ];

  it('renders a labelled native select with a placeholder', () => {
    renderUi(<SelectField label="Cause" options={options} placeholder="Choose one" />);
    const select = screen.getByRole('combobox', { name: 'Cause' });
    expect(select).toHaveValue('');
    expect(screen.getAllByRole('option')).toHaveLength(4);
    expect(screen.getByRole('option', { name: 'Closed' })).toBeDisabled();
  });

  it('selects with the keyboard/user and reports change', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderUi(<SelectField label="Cause" options={options} onChange={onChange} />);
    await user.selectOptions(screen.getByRole('combobox'), 'medical');
    expect(screen.getByRole('combobox')).toHaveValue('medical');
    expect(onChange).toHaveBeenCalled();
  });

  it('shows an error state', async () => {
    const { container } = renderUi(
      <SelectField label="Cause" options={options} error="Choose a cause" required />,
    );
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('combobox')).toHaveAccessibleDescription('Error: Choose a cause');
    await expectNoA11yViolations(container);
  });

  it('handles an empty options list', () => {
    renderUi(<SelectField label="Cause" options={[]} />);
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });
});

describe('Checkbox', () => {
  it('toggles with click and Space, label and hint attached', async () => {
    const user = userEvent.setup();
    renderUi(<Checkbox label="Send me updates" hint="About once a month" />);
    const box = screen.getByRole('checkbox', { name: 'Send me updates' });
    expect(box).toHaveAccessibleDescription('About once a month');
    await user.click(screen.getByText('Send me updates'));
    expect(box).toBeChecked();
    await user.keyboard(' ');
    expect(box).not.toBeChecked();
  });

  it('error and disabled states', async () => {
    const { container } = renderUi(
      <>
        <Checkbox label="I agree" error="Please agree to continue" />
        <Checkbox label="Locked" disabled />
      </>,
    );
    expect(screen.getByRole('checkbox', { name: 'I agree' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByRole('checkbox', { name: 'Locked' })).toBeDisabled();
    await expectNoA11yViolations(container);
  });
});

describe('RadioCardGroup', () => {
  const options = [
    { value: 'general', label: 'Where most needed', description: 'The trust decides' },
    { value: 'education', label: 'Education' },
    { value: 'medical', label: 'Medical', disabled: true },
  ];

  function Controlled({ onChange = vi.fn() }: { onChange?: (v: string) => void }) {
    const [value, setValue] = useState<string | null>(null);
    return (
      <RadioCardGroup
        legend="Choose a cause"
        name="cause"
        options={options}
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange(v);
        }}
      />
    );
  }

  it('is a named group of radios with descriptions', () => {
    renderUi(<Controlled />);
    expect(screen.getByRole('group', { name: 'Choose a cause' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Where most needed' })).toHaveAccessibleDescription(
      'The trust decides',
    );
  });

  it('selects by click and moves with arrow keys, skipping disabled options', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderUi(<Controlled onChange={onChange} />);
    await user.click(screen.getByText('Where most needed'));
    expect(screen.getByRole('radio', { name: 'Where most needed' })).toBeChecked();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: 'Education' })).toBeChecked();
    expect(onChange).toHaveBeenLastCalledWith('education');
    expect(screen.getByRole('radio', { name: 'Medical' })).toBeDisabled();
  });

  it('shows a group error', async () => {
    const { container } = renderUi(
      <RadioCardGroup
        legend="Cause"
        name="cause"
        options={options}
        value={null}
        onChange={vi.fn()}
        error="Choose a cause"
        required
      />,
    );
    expect(screen.getByRole('group', { name: 'Cause (required)' })).toHaveAccessibleDescription(
      'Error: Choose a cause',
    );
    await expectNoA11yViolations(container);
  });
});
