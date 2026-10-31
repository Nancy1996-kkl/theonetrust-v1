import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '../../test/a11y.ts';
import { renderUi } from '../../test/render-ui.tsx';
import { Button } from './Button.tsx';
import { Dialog, type DialogProps } from './Dialog.tsx';
import { focusableIn } from './focus.ts';
import { TextField } from './TextField.tsx';

function Harness(props: Partial<DialogProps> & { withInitialFocus?: boolean; empty?: boolean }) {
  const { withInitialFocus, empty, ...rest } = props;
  const [open, setOpen] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <p>Page content</p>
      <Button onClick={() => setOpen(true)}>Open help</Button>
      <Dialog
        title="Get help"
        description="Tell us how to reach you."
        dismissible
        {...rest}
        {...(withInitialFocus ? { initialFocusRef: emailRef } : {})}
        open={open}
        onClose={() => {
          setOpen(false);
          rest.onClose?.();
        }}
        footer={empty ? undefined : <Button onClick={() => setOpen(false)}>Done</Button>}
      >
        {!empty && (
          <>
            <TextField label="Name" />
            <TextField label="Email" ref={emailRef} />
          </>
        )}
      </Dialog>
    </>
  );
}

async function openDialog() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Open help' }));
  return user;
}

describe('Dialog', () => {
  it('is closed by default and opens as a named, described modal', async () => {
    renderUi(<Harness />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await openDialog();
    const dialog = screen.getByRole('dialog', { name: 'Get help' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Tell us how to reach you.');
  });

  it('moves focus to the first focusable element on open', async () => {
    renderUi(<Harness />);
    await openDialog();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });

  it('honours initialFocusRef', async () => {
    renderUi(<Harness withInitialFocus />);
    await openDialog();
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveFocus();
  });

  it('traps Tab and Shift+Tab inside the dialog', async () => {
    renderUi(<Harness />);
    const user = await openDialog();
    const close = screen.getByRole('button', { name: 'Close' });
    const done = screen.getByRole('button', { name: 'Done' });
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(done).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
  });

  it('Esc closes and focus returns to the opener', async () => {
    renderUi(<Harness />);
    const user = await openDialog();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open help' })).toHaveFocus();
  });

  it('close button and backdrop close it', async () => {
    renderUi(<Harness />);
    let user = await openDialog();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    user = await openDialog();
    await user.click(screen.getByTestId('dialog-backdrop'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('non-dismissible (payment in progress): Esc, backdrop and close button are disabled', async () => {
    const onClose = vi.fn();
    renderUi(<Harness dismissible={false} onClose={onClose} />);
    const user = await openDialog();
    await user.keyboard('{Escape}');
    await user.click(screen.getByTestId('dialog-backdrop'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('makes the page behind inert and locks scroll, then restores both', async () => {
    const { container } = renderUi(<Harness />);
    const appRoot = container;
    const user = await openDialog();
    expect(appRoot).toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('hidden');
    await user.keyboard('{Escape}');
    expect(appRoot).not.toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('');
  });

  it('does not un-inert elements that were already inert', async () => {
    const outside = document.createElement('div');
    outside.setAttribute('inert', '');
    document.body.append(outside);
    renderUi(<Harness />);
    const user = await openDialog();
    await user.keyboard('{Escape}');
    expect(outside).toHaveAttribute('inert');
    outside.remove();
  });

  it('with nothing focusable, focus stays on the dialog itself', async () => {
    renderUi(<Harness empty dismissible={false} />);
    const user = await openDialog();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveFocus();
    await user.tab();
    expect(dialog).toHaveFocus();
  });

  it('pulls focus back in if it escaped', async () => {
    renderUi(<Harness />);
    const user = await openDialog();
    const stray = document.createElement('button');
    document.body.append(stray);
    act(() => stray.focus());
    await user.tab();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    stray.remove();
  });

  it('panel variant renders the same accessible dialog', async () => {
    renderUi(<Harness variant="panel" />);
    await openDialog();
    expect(screen.getByRole('dialog')).toHaveClass('ui-dialog--panel');
  });

  it('close label is Tamil in Tamil', async () => {
    renderUi(<Harness title="உதவி பெறுங்கள்" />, 'ta');
    await openDialog();
    expect(screen.getByRole('button', { name: 'மூடு' })).toBeInTheDocument();
  });

  it('has no axe violations when open', async () => {
    renderUi(<Harness />);
    await openDialog();
    await expectNoA11yViolations(screen.getByRole('dialog'));
  });
});

describe('focusableIn', () => {
  it('skips disabled, hidden, negative tabindex and inert elements', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <a href="#a">a</a><a>no href</a>
      <button>b</button><button disabled>x</button>
      <input type="hidden" /><input />
      <span tabindex="0">s</span><span tabindex="-1">n</span>
      <div inert><button>inert</button></div>
      <button hidden>hidden</button>`;
    expect(focusableIn(root).map((el) => el.textContent || el.tagName)).toEqual([
      'a',
      'b',
      'INPUT',
      's',
    ]);
  });
});
