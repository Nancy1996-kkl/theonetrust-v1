import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '../../test/a11y.ts';
import { Button } from './Button.tsx';
import { TextLink } from './TextLink.tsx';
import { renderUi } from '../../test/render-ui.tsx';

describe('Button', () => {
  it.each(['primary', 'donate', 'secondary', 'ghost'] as const)(
    'renders the %s variant as a native button (type=button by default)',
    (variant) => {
      renderUi(<Button variant={variant}>Donate now</Button>);
      const button = screen.getByRole('button', { name: 'Donate now' });
      expect(button).toHaveAttribute('type', 'button');
      expect(button).toHaveClass(`ui-button--${variant}`);
    },
  );

  it('is operable with Enter and Space', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderUi(<Button onClick={onClick}>Continue</Button>);
    await user.tab();
    expect(screen.getByRole('button')).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('does not fire when disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderUi(
      <Button disabled onClick={onClick}>
        Pay
      </Button>,
    );
    await user.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('loading: stays focusable, announces busy, ignores repeat clicks', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderUi(
      <Button loading onClick={onClick}>
        Pay
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    expect(button).toHaveAccessibleName('Pay Loading…');
    await user.click(button);
    await user.keyboard('{Enter}');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('loading label follows the language (Tamil) and can be overridden', () => {
    const { unmount } = renderUi(<Button loading>செலுத்து</Button>, 'ta');
    expect(screen.getByRole('button')).toHaveAccessibleName('செலுத்து கொஞ்சம் பொறுங்கள்…');
    unmount();
    renderUi(
      <Button loading loadingLabel="Saving…">
        Save
      </Button>,
    );
    expect(screen.getByRole('button')).toHaveAccessibleName('Save Saving…');
  });

  it('submit type is passed through for forms', () => {
    renderUi(<Button type="submit">Send</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('has no axe violations in any state', async () => {
    const { container } = renderUi(
      <>
        <Button>Default</Button>
        <Button disabled>Disabled</Button>
        <Button loading>Loading</Button>
        <Button variant="donate" fullWidth>
          நன்கொடை அளியுங்கள்
        </Button>
      </>,
    );
    await expectNoA11yViolations(container);
  });
});

describe('TextLink', () => {
  it('uses the router for internal paths', () => {
    renderUi(<TextLink to="/privacy">Privacy</TextLink>);
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
  });

  it.each(['https://example.org/report.pdf', 'mailto:help@example.org', 'tel:+910000000000'])(
    'renders %s as a plain anchor',
    (href) => {
      renderUi(<TextLink to={href}>Link</TextLink>);
      expect(screen.getByRole('link')).toHaveAttribute('href', href);
    },
  );

  it('new tab: safe rel and an announced hint', () => {
    renderUi(
      <TextLink to="https://example.org" newTab newTabLabel="(opens in a new tab)">
        Report
      </TextLink>,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAccessibleName('Report (opens in a new tab)');
  });

  it('does not open a new tab by default', () => {
    renderUi(<TextLink to="https://example.org">Report</TextLink>);
    expect(screen.getByRole('link')).not.toHaveAttribute('target');
  });
});
