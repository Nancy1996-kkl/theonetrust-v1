import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '../../test/a11y.ts';
import { consoleGuard } from '../../test/console-guard.ts';
import { renderUi } from '../../test/render-ui.tsx';
import { LiveRegion, ToastProvider } from './Toast.tsx';
import { DEFAULT_TOAST_MS, useToast, type ToastInput } from './toast-context.ts';

const holder: { api?: ReturnType<typeof useToast> } = {};
function Capture() {
  const toast = useToast();
  useEffect(() => {
    holder.api = toast;
  }, [toast]);
  return null;
}

function setup(lang: 'en' | 'ta' = 'en') {
  return renderUi(
    <ToastProvider>
      <Capture />
    </ToastProvider>,
    lang,
  );
}

function show(input: ToastInput): number {
  let id = 0;
  act(() => {
    id = holder.api!.show(input);
  });
  return id;
}

describe('ToastProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders empty polite and assertive regions before any toast', () => {
    setup();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
    expect(screen.getByRole('region', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('success goes to the polite region with a spoken prefix and an icon', () => {
    setup();
    show({ tone: 'success', message: 'Saved' });
    expect(screen.getByRole('status')).toHaveTextContent('Success: Saved');
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
    expect(screen.getByRole('status').querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('defaults to info tone', () => {
    setup();
    show({ message: 'Heads up' });
    expect(screen.getByRole('status')).toHaveTextContent('Information: Heads up');
  });

  it('errors go to the assertive region and never auto-dismiss', () => {
    setup();
    show({ tone: 'error', message: 'Payment not confirmed', durationMs: 10 });
    expect(screen.getByRole('alert')).toHaveTextContent('Error: Payment not confirmed');
    act(() => vi.advanceTimersByTime(DEFAULT_TOAST_MS * 10));
    expect(screen.getByRole('alert')).toHaveTextContent('Payment not confirmed');
  });

  it('auto-dismisses non-errors after the duration', () => {
    setup();
    show({ tone: 'warning', message: 'Check your email' });
    act(() => vi.advanceTimersByTime(DEFAULT_TOAST_MS - 1));
    expect(screen.getByRole('status')).toHaveTextContent('Warning: Check your email');
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('a null duration keeps the toast', () => {
    setup();
    show({ message: 'Stays', durationMs: null });
    act(() => vi.advanceTimersByTime(DEFAULT_TOAST_MS * 5));
    expect(screen.getByRole('status')).toHaveTextContent('Stays');
  });

  it('pauses while hovered or focused, resumes after', () => {
    setup();
    show({ message: 'Paused', durationMs: 1000 });
    const toast = screen.getByText('Paused').closest('.ui-toast')!;
    fireEvent.pointerEnter(toast);
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByRole('status')).toHaveTextContent('Paused');
    fireEvent.pointerLeave(toast);
    fireEvent.focusIn(toast);
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByRole('status')).toHaveTextContent('Paused');
    // Focus moving within the toast keeps it paused.
    fireEvent.focusOut(toast, { relatedTarget: screen.getByRole('button', { name: 'Dismiss' }) });
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByRole('status')).toHaveTextContent('Paused');
    fireEvent.focusOut(toast, { relatedTarget: null });
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('dismiss button and api.dismiss remove only that toast', () => {
    setup();
    const first = show({ message: 'One' });
    show({ message: 'Two' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[1]!);
    expect(screen.getByRole('status')).toHaveTextContent('One');
    expect(screen.getByRole('status')).not.toHaveTextContent('Two');
    act(() => holder.api!.dismiss(first));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('speaks Tamil prefixes and labels in Tamil', () => {
    setup('ta');
    show({ tone: 'error', message: 'பணம் உறுதிசெய்யப்படவில்லை' });
    expect(screen.getByRole('alert')).toHaveTextContent('பிழை: பணம் உறுதிசெய்யப்படவில்லை');
    expect(screen.getByRole('button', { name: 'நீக்கு' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'அறிவிப்புகள்' })).toBeInTheDocument();
  });

  it('has no axe violations with toasts showing', async () => {
    vi.useRealTimers();
    const { container } = setup();
    show({ tone: 'success', message: 'Saved' });
    show({ tone: 'error', message: 'Failed' });
    await expectNoA11yViolations(container);
  });
});

describe('useToast outside a provider', () => {
  it('throws a clear error', () => {
    consoleGuard.allow(/useToast must be used inside <ToastProvider>/);
    consoleGuard.allow(/The above error occurred/);
    expect(() => render(<Capture />)).toThrow('useToast must be used inside <ToastProvider>');
  });
});

describe('LiveRegion', () => {
  it('is a polite, atomic, visually hidden status by default and announces changes', () => {
    const { rerender } = render(<LiveRegion message="" />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('aria-atomic', 'true');
    expect(region).toHaveClass('visually-hidden');
    rerender(<LiveRegion message="3 results" />);
    expect(screen.getByRole('status')).toBe(region);
    expect(region).toHaveTextContent('3 results');
  });

  it('assertive and visible variants', () => {
    render(<LiveRegion message="Failed" politeness="assertive" hidden={false} className="x" />);
    const region = screen.getByRole('alert');
    expect(region).toHaveAttribute('aria-live', 'assertive');
    expect(region).toHaveClass('x');
    expect(region).not.toHaveClass('visually-hidden');
  });

  it('visible with no class has no class attribute', () => {
    render(<LiveRegion message="Hi" hidden={false} />);
    expect(screen.getByRole('status')).not.toHaveAttribute('class');
  });
});
