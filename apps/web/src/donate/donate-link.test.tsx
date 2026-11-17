import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { UiLangContext } from '../components/ui/ui-strings.ts';
import { DonateLinkPanel } from './DonateLinkPanel.tsx';
import { DONATE_MESSAGES } from './donate-messages.ts';
import { donatePageUrl } from './donate-page-link.ts';

describe('donatePageUrl (Razorpay Payment Page mode)', () => {
  it('accepts https Razorpay Payment Page links', () => {
    expect(donatePageUrl('https://pages.razorpay.com/theonetrust')).toBe(
      'https://pages.razorpay.com/theonetrust',
    );
    expect(donatePageUrl(' https://rzp.io/rzp/abc123 ')).toBe('https://rzp.io/rzp/abc123');
  });

  it.each([
    [undefined],
    [''],
    ['not a url'],
    ['http://pages.razorpay.com/theonetrust'], // not https
    ['https://pages.razorpay.com.evil.example/x'], // look-alike host
    ['https://evil.example/pages.razorpay.com'], // wrong host
    ['https://user:pw@pages.razorpay.com/x'], // credentials
    ['https://pages.razorpay.com/'], // no page
    ['javascript:alert(1)'],
  ])('rejects %s', (raw) => {
    expect(donatePageUrl(raw)).toBeNull();
  });
});

describe('DonateLinkPanel', () => {
  const url = 'https://pages.razorpay.com/theonetrust';

  it('opens at #donate with a button to the Razorpay page (English)', () => {
    render(
      <MemoryRouter initialEntries={['/#donate']}>
        <DonateLinkPanel url={url} />
      </MemoryRouter>,
    );
    const link = screen.getByTestId('donate-page-link');
    expect(link).toHaveAttribute('href', url);
    expect(link).toHaveTextContent(DONATE_MESSAGES.en.linkContinue);
    expect(screen.getByText(DONATE_MESSAGES.en.linkReceipt)).toBeInTheDocument();
  });

  it('shows Tamil text on /ta/', () => {
    render(
      <UiLangContext.Provider value="ta">
        <MemoryRouter initialEntries={['/ta/#donate']}>
          <DonateLinkPanel url={url} />
        </MemoryRouter>
      </UiLangContext.Provider>,
    );
    expect(screen.getByTestId('donate-page-link')).toHaveTextContent(
      DONATE_MESSAGES.ta.linkContinue,
    );
  });

  it('stays closed without #donate', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <DonateLinkPanel url={url} />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('donate-page-link')).toBeNull();
  });
});
