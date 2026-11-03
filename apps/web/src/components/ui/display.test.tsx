import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '../../test/a11y.ts';
import { renderUi } from '../../test/render-ui.tsx';
import { Button } from './Button.tsx';
import { BentoGrid, BentoTile, Card } from './Card.tsx';
import { DataTable, type Column } from './DataTable.tsx';
import { LanguageSwitch } from './LanguageSwitch.tsx';
import { StateBlock } from './StateBlock.tsx';
import { StatusPill } from './StatusPill.tsx';
import { Stepper } from './Stepper.tsx';

describe('Card and BentoTile', () => {
  it('Card renders the chosen element with a light surface', () => {
    renderUi(
      <Card as="article" aria-label="Card" elevation="flat">
        Body
      </Card>,
    );
    const card = screen.getByRole('article', { name: 'Card' });
    expect(card).toHaveClass('ui-card', 'surface', 'ui-card--flat');
  });

  it('Card defaults to a raised div', () => {
    renderUi(<Card data-testid="c">Body</Card>);
    expect(screen.getByTestId('c').tagName).toBe('DIV');
    expect(screen.getByTestId('c')).toHaveClass('ui-card--raised');
  });

  it('BentoTile: heading level, wide span, inverse tone and action', async () => {
    const { container } = renderUi(
      <BentoGrid>
        <BentoTile
          title="Education"
          headingLevel={2}
          span={2}
          tone="inverse"
          action={<Button>Learn more</Button>}
        >
          <p>Support for school costs.</p>
        </BentoTile>
        <BentoTile title="கல்வி" lang="ta" />
      </BentoGrid>,
    );
    const tile = screen.getByRole('heading', { level: 2, name: 'Education' }).closest('article')!;
    expect(tile).toHaveClass('surface-inverse', 'ui-bento-tile--wide');
    expect(within(tile).getByRole('button', { name: 'Learn more' })).toBeInTheDocument();
    const tamil = screen.getByRole('heading', { level: 3, name: 'கல்வி' }).closest('article')!;
    expect(tamil).toHaveClass('surface');
    expect(tamil.querySelector('.ui-bento-tile__body')).toBeNull();
    await expectNoA11yViolations(container);
  });
});

describe('StatusPill', () => {
  it.each(['neutral', 'info', 'success', 'warning', 'error'] as const)(
    '%s pill shows an icon and words',
    (tone) => {
      renderUi(<StatusPill tone={tone}>Paid</StatusPill>);
      const pill = screen.getByText('Paid').parentElement!;
      expect(pill).toHaveAttribute('data-tone', tone);
      expect(pill.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    },
  );

  it('plain badge has no icon', () => {
    renderUi(<StatusPill plain>12</StatusPill>);
    expect(screen.getByText('12').parentElement!.querySelector('svg')).toBeNull();
  });
});

describe('Stepper', () => {
  const steps = ['Amount', 'Your details', 'Pay', 'Acknowledgement'];

  it('marks completed, current and upcoming steps in words', () => {
    renderUi(<Stepper steps={steps} current={1} label="Donation progress" />);
    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Donation progress' });
    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Amount (completed)');
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[1]).toHaveTextContent('Your details (current step)');
    expect(items[2]).not.toHaveAttribute('aria-current');
  });

  it.each([
    [-3, 'Step 1 of 4'],
    [99, 'Step 4 of 4'],
    [1.7, 'Step 2 of 4'],
  ])('clamps current=%s', (current, text) => {
    renderUi(<Stepper steps={steps} current={current} label="Progress" />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('renders nothing broken with no steps', () => {
    renderUi(<Stepper steps={[]} current={0} label="Progress" />);
    expect(screen.queryByText(/Step/)).not.toBeInTheDocument();
  });

  it('Tamil counter', async () => {
    const { container } = renderUi(
      <Stepper steps={['தொகை', 'விவரங்கள்', 'செலுத்து']} current={2} label="முன்னேற்றம்" />,
      'ta',
    );
    expect(screen.getByText('படி 3 / 3')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

describe('StateBlock', () => {
  it.each([
    ['loading', 'status'],
    ['success', 'status'],
    ['error', 'alert'],
  ] as const)('%s uses role=%s', (state, role) => {
    renderUi(<StateBlock state={state} title="Title" />);
    expect(screen.getByRole(role)).toHaveAttribute('data-state', state);
  });

  it.each(['empty', 'no-results'] as const)('%s is not a live region', (state) => {
    renderUi(<StateBlock state={state} title="Nothing here" />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nothing here' })).toBeInTheDocument();
  });

  it('loading is busy', () => {
    renderUi(<StateBlock state="loading" title="Loading donations" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });

  it('error has a spoken prefix and a recovery action', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    const { container } = renderUi(
      <StateBlock
        state="error"
        title="Could not load"
        headingLevel={2}
        action={<Button onClick={retry}>Try again</Button>}
      >
        <p>Check your connection.</p>
      </StateBlock>,
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Error: Could not load');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });
});

interface Row {
  id: string;
  ref: string;
  amount: string;
  status: string;
}

const columns: Column<Row>[] = [
  { key: 'ref', header: 'Reference', cell: (r) => r.ref, rowHeader: true },
  { key: 'amount', header: 'Amount', cell: (r) => r.amount, align: 'end' },
  {
    key: 'status',
    header: 'Status',
    cell: (r) => <StatusPill tone="success">{r.status}</StatusPill>,
  },
];

describe('DataTable', () => {
  it('renders caption, column headers and row headers', async () => {
    const { container } = renderUi(
      <DataTable
        caption="Recent donations"
        columns={columns}
        rows={[
          { id: '1', ref: 'D-001', amount: '₹500', status: 'Paid' },
          { id: '2', ref: 'D-002', amount: '₹1,000', status: 'Paid' },
        ]}
        rowKey={(r) => r.id}
        empty="No donations"
      />,
    );
    const table = screen.getByRole('table', { name: 'Recent donations' });
    expect(within(table).getAllByRole('columnheader')).toHaveLength(3);
    expect(within(table).getByRole('rowheader', { name: 'D-001' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: '₹1,000' })).toHaveClass('ui-table__cell--end');
    await expectNoA11yViolations(container);
  });

  it('scroll region is keyboard focusable and named by the caption', async () => {
    const user = userEvent.setup();
    renderUi(
      <DataTable
        caption="Donations"
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        empty="None"
      />,
    );
    const region = screen.getByRole('region', { name: 'Donations' });
    await user.tab();
    expect(region).toHaveFocus();
    expect(region).toHaveAccessibleDescription('Scroll sideways to see all columns.');
  });

  it('shows the empty state across all columns', () => {
    renderUi(
      <DataTable
        caption="Donations"
        hideCaption
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        empty={<StateBlock state="empty" title="No donations yet" />}
      />,
    );
    const cell = screen.getByRole('cell');
    expect(cell).toHaveAttribute('colspan', '3');
    expect(within(cell).getByText('No donations yet')).toBeInTheDocument();
    expect(screen.getByText('Donations')).toHaveClass('visually-hidden');
  });

  it('tolerates zero columns', () => {
    renderUi(<DataTable caption="X" columns={[]} rows={[]} rowKey={() => 'k'} empty="Empty" />);
    expect(screen.getByRole('cell')).toHaveAttribute('colspan', '1');
  });
});

describe('LanguageSwitch', () => {
  it('shows both languages in their own script with the current one pressed', async () => {
    const { container } = renderUi(<LanguageSwitch current="en" onChange={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    const tamil = screen.getByRole('button', { name: 'தமிழ்' });
    expect(tamil).toHaveAttribute('aria-pressed', 'false');
    expect(tamil).toHaveAttribute('lang', 'ta');
    await expectNoA11yViolations(container);
  });

  it('switches with the keyboard; pressing the current language does nothing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderUi(<LanguageSwitch current="ta" onChange={onChange} />, 'ta');
    expect(screen.getByRole('group', { name: 'மொழி' })).toBeInTheDocument();
    await user.tab();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('en');
    await user.click(screen.getByRole('button', { name: 'தமிழ்' }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
