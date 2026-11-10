import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RouteObject } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HelpRequest } from '@theonetrust/contracts';
import { HELP_REFERENCE_PATTERN } from '@theonetrust/contracts';
import { expectNoA11yViolations } from '../test/a11y.ts';
import { renderRoute } from '../test/render.tsx';
import { routes as appRoutes } from '../app/routes.tsx';
import {
  HelpClientContext,
  createMockHelpClient,
  mockReference,
  selectHelpClient,
  unavailableHelpClient,
  type HelpClient,
  type HelpSubmitResult,
} from './help-client.ts';
import {
  CALL_TIME_LABELS,
  HELP_FOR_LABELS,
  HELP_KIND_LABELS,
  HELP_MESSAGES,
} from './help-messages.ts';

afterEach(() => {
  document.documentElement.lang = 'en';
});

const en = HELP_MESSAGES.en;
const ta = HELP_MESSAGES.ta;

function fakeClient(results: HelpSubmitResult[], acceptsRequests = true) {
  const submit = vi.fn<(r: HelpRequest) => Promise<HelpSubmitResult>>();
  for (const r of results) submit.mockResolvedValueOnce(r);
  const client: HelpClient = { acceptsRequests, submit };
  return { client, submit };
}

function renderWith(client: HelpClient, path = '/#get-help') {
  // Wrap the real route table so the layout (and its panel) sees the injected client.
  const wrapped: RouteObject[] = appRoutes.map((route) => ({
    ...route,
    element: (
      <HelpClientContext.Provider value={client}>{route.element}</HelpClientContext.Provider>
    ),
  }));
  return renderRoute(path, wrapped);
}

const dialog = () => screen.getByRole('dialog', { name: /Get Help|உதவி பெற/ });

async function walkToContact(user: ReturnType<typeof userEvent.setup>, helpFor = 'self' as const) {
  await user.click(screen.getByRole('button', { name: en.fillForm }));
  await user.click(screen.getByRole('radio', { name: HELP_FOR_LABELS[helpFor].en }));
  await user.click(screen.getByRole('button', { name: en.continue }));
  await user.click(screen.getByRole('checkbox', { name: HELP_KIND_LABELS.education.en }));
  await user.click(screen.getByRole('button', { name: en.continue }));
  await user.type(screen.getByRole('textbox', { name: en.descLabel }), 'School fees');
  await user.click(screen.getByRole('button', { name: en.continue }));
}

describe('messages and adapters', () => {
  it('Tamil and English have the same keys, non-empty, Tamil script', () => {
    expect(Object.keys(ta).sort()).toEqual(Object.keys(en).sort());
    for (const [key, text] of Object.entries(ta)) {
      expect(text.trim(), key).not.toBe('');
      expect(text, key).toMatch(/[஀-௿]/);
    }
    for (const labels of [HELP_FOR_LABELS, HELP_KIND_LABELS, CALL_TIME_LABELS]) {
      for (const label of Object.values(labels)) expect(label.ta).toMatch(/[஀-௿]/);
    }
  });

  it('mock references match the contract format and avoid I and O', () => {
    for (let i = 0; i < 50; i += 1) expect(mockReference()).toMatch(HELP_REFERENCE_PATTERN);
    expect(mockReference(() => 0)).toBe('HLP-0000');
    expect(mockReference(() => 0.9999)).toBe('HLP-ZZZZ');
  });

  it('the live default never pretends to accept requests', async () => {
    expect(selectHelpClient({})).toBe(unavailableHelpClient);
    expect(selectHelpClient({ VITE_HELP_ADAPTER: 'unavailable', DEV: true })).toBe(
      unavailableHelpClient,
    );
    expect(selectHelpClient({ VITE_HELP_ADAPTER: 'mock' }).acceptsRequests).toBe(true);
    expect(selectHelpClient({ DEV: true }).acceptsRequests).toBe(true);
    await expect(unavailableHelpClient.submit({} as HelpRequest)).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  it('mock client resolves with a reference after a delay', async () => {
    vi.useFakeTimers();
    const promise = createMockHelpClient(100).submit({} as HelpRequest);
    vi.advanceTimersByTime(100);
    await expect(promise).resolves.toMatchObject({ ok: true });
    vi.useRealTimers();
  });
});

describe('opening and closing', () => {
  it('is closed without #get-help and opens from the header link', async () => {
    const user = userEvent.setup();
    const { client } = fakeClient([]);
    renderWith(client, '/');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(within(screen.getByRole('banner')).getByRole('link', { name: 'Get Help' }));
    expect(dialog()).toBeVisible();
    expect(screen.getByRole('heading', { name: en.startTitle })).toHaveFocus();
    // Client, Nov 2026: a centred pop-up, not a side panel.
    expect(dialog()).toHaveClass('ui-dialog--modal');
  });

  it('closes with Esc and stays on the same page', async () => {
    const user = userEvent.setup();
    const { client } = fakeClient([]);
    renderWith(client);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeVisible();
  });

  it('start screen offers the form, call me back, WhatsApp, phone, hours and the no-guarantee note', () => {
    const { client } = fakeClient([]);
    renderWith(client);
    const d = dialog();
    expect(within(d).getByRole('button', { name: en.fillForm })).toBeVisible();
    expect(within(d).getByRole('button', { name: en.callMeBack })).toBeVisible();
    expect(within(d).getByRole('link', { name: en.whatsapp })).toHaveAttribute(
      'href',
      'https://wa.me/919600516999',
    );
    expect(within(d).getByRole('link', { name: /\+91 96005 16999/ })).toHaveAttribute(
      'href',
      'tel:+919600516999',
    );
    expect(d).toHaveTextContent('Every day, 8 AM – 10 PM');
    expect(d).toHaveTextContent(en.noGuarantee);
  });

  it('when requests are not open yet (live default): no form, only human channels', () => {
    renderWith(unavailableHelpClient);
    const d = dialog();
    expect(within(d).getByRole('heading', { name: en.closedTitle })).toBeVisible();
    expect(within(d).queryByRole('button', { name: en.fillForm })).not.toBeInTheDocument();
    expect(within(d).getByRole('link', { name: en.whatsapp })).toBeVisible();
  });
});

describe('wizard', () => {
  it('full journey for myself: validation, 5 steps, success with reference', async () => {
    const user = userEvent.setup();
    const { client, submit } = fakeClient([{ ok: true, reference: 'HLP-7Q2K' }]);
    renderWith(client);
    await user.click(screen.getByRole('button', { name: en.fillForm }));
    expect(screen.getByText('Step 1 of 5')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: en.continue }));
    expect(screen.getByText(en.whoError)).toBeVisible();
    await user.click(screen.getByRole('radio', { name: HELP_FOR_LABELS.self.en }));
    expect(screen.queryByText(en.whoError)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: en.continue }));

    expect(screen.getByRole('heading', { name: en.kindTitle })).toHaveFocus();
    expect(dialog()).toHaveTextContent('call 112 now');
    await user.click(screen.getByRole('button', { name: en.continue }));
    expect(screen.getByText(en.kindError)).toBeVisible();
    await user.click(screen.getByRole('checkbox', { name: HELP_KIND_LABELS.food.en }));
    await user.click(screen.getByRole('checkbox', { name: HELP_KIND_LABELS.health.en }));
    await user.click(screen.getByRole('button', { name: en.continue }));

    const description = screen.getByRole('textbox', { name: en.descLabel });
    expect(description).toHaveAttribute('maxlength', '500');
    await user.type(description, 'Need rice');
    expect(screen.getByText('9 / 500 characters')).toBeInTheDocument();
    expect(dialog()).toHaveTextContent('Aadhaar');
    await user.click(screen.getByRole('button', { name: en.continue }));

    expect(
      screen.queryByRole('textbox', { name: /Their name or village/ }),
    ).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: /Your mobile/ }), '12345');
    await user.click(screen.getByRole('button', { name: en.continue }));
    expect(screen.getByRole('textbox', { name: /Your mobile/ })).toHaveAccessibleDescription(
      `${en.mobileHint} Error: ${en.mobileError}`,
    );
    await user.clear(screen.getByRole('textbox', { name: /Your mobile/ }));
    await user.type(screen.getByRole('textbox', { name: /Your mobile/ }), '98765 43210');
    await user.click(screen.getByRole('radio', { name: CALL_TIME_LABELS.evening.en }));
    await user.click(screen.getByRole('button', { name: en.continue }));

    expect(screen.queryByRole('checkbox', { name: en.consentOther })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: en.send }));
    expect(screen.getByText(en.consentContactError)).toBeVisible();
    expect(submit).not.toHaveBeenCalled();
    await user.click(screen.getByRole('checkbox', { name: en.consentContact }));
    expect(within(dialog()).getByRole('link', { name: 'Privacy policy' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    await user.click(screen.getByRole('button', { name: en.send }));

    await waitFor(() => expect(screen.getByRole('heading', { name: en.sentTitle })).toHaveFocus());
    expect(dialog()).toHaveTextContent('HLP-7Q2K');
    expect(submit).toHaveBeenCalledWith({
      mode: 'wizard',
      helpFor: 'self',
      kinds: ['food', 'health'],
      description: 'Need rice',
      phone: '+919876543210',
      personNameOrVillage: '',
      callLanguage: 'en',
      bestTime: 'evening',
      consentContact: true,
      consentThirdParty: false,
      pageLanguage: 'en',
      website: '',
    });

    await user.click(screen.getByRole('button', { name: en.backToPage }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('third-party mode: optional name or village and the extra consent', async () => {
    const user = userEvent.setup();
    const { client, submit } = fakeClient([{ ok: true, reference: 'HLP-AAAA' }]);
    renderWith(client);
    await walkToContact(user, 'on_behalf' as never);
    await user.type(screen.getByRole('textbox', { name: /Your mobile/ }), '9876543210');
    const person = screen.getByRole('textbox', { name: /Their name or village/ });
    expect(person).toHaveAccessibleName('Their name or village (optional)');
    await user.type(person, 'Walajabad');
    await user.click(screen.getByRole('button', { name: en.continue }));
    await user.click(screen.getByRole('checkbox', { name: en.consentContact }));
    await user.click(screen.getByRole('button', { name: en.send }));
    expect(screen.getByText(en.consentOtherError)).toBeVisible();
    await user.click(screen.getByRole('checkbox', { name: en.consentOther }));
    await user.click(screen.getByRole('button', { name: en.send }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls[0]![0]).toMatchObject({
      helpFor: 'on_behalf',
      personNameOrVillage: 'Walajabad',
      consentThirdParty: true,
    });
  });

  it('"I don’t know how to explain" alone skips the description step, and Back returns past it', async () => {
    const user = userEvent.setup();
    const { client } = fakeClient([]);
    renderWith(client);
    await user.click(screen.getByRole('button', { name: en.fillForm }));
    await user.click(screen.getByRole('radio', { name: HELP_FOR_LABELS.someone.en }));
    await user.click(screen.getByRole('button', { name: en.continue }));
    await user.click(screen.getByRole('checkbox', { name: HELP_KIND_LABELS.unsure.en }));
    await user.click(screen.getByRole('button', { name: en.continue }));
    expect(screen.getByRole('heading', { name: en.contactTitle })).toBeVisible();
    await user.click(screen.getByRole('button', { name: en.back }));
    expect(screen.getByRole('heading', { name: en.kindTitle })).toBeVisible();
    // Unticking a tile works too.
    await user.click(screen.getByRole('checkbox', { name: HELP_KIND_LABELS.unsure.en }));
    expect(screen.getByRole('checkbox', { name: HELP_KIND_LABELS.unsure.en })).not.toBeChecked();
  });

  it('Skip clears the description and moves on; Back from step 1 returns to the start', async () => {
    const user = userEvent.setup();
    const { client, submit } = fakeClient([{ ok: true, reference: 'HLP-BBBB' }]);
    renderWith(client);
    await user.click(screen.getByRole('button', { name: en.fillForm }));
    await user.click(screen.getByRole('button', { name: en.back }));
    expect(screen.getByRole('heading', { name: en.startTitle })).toBeVisible();
    await user.click(screen.getByRole('button', { name: en.fillForm }));
    await user.click(screen.getByRole('radio', { name: HELP_FOR_LABELS.self.en }));
    await user.click(screen.getByRole('button', { name: en.continue }));
    await user.click(screen.getByRole('checkbox', { name: HELP_KIND_LABELS.other.en }));
    await user.click(screen.getByRole('button', { name: en.continue }));
    await user.type(screen.getByRole('textbox', { name: en.descLabel }), 'typed then skipped');
    await user.click(screen.getByRole('button', { name: en.skip }));
    await user.type(screen.getByRole('textbox', { name: /Your mobile/ }), '9876543210');
    await user.click(screen.getByRole('button', { name: en.continue }));
    await user.click(screen.getByRole('checkbox', { name: en.consentContact }));
    await user.click(screen.getByRole('button', { name: en.send }));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit.mock.calls[0]![0]).toMatchObject({ description: '' });
  });

  it('a network error keeps every answer and Try again resends', async () => {
    const user = userEvent.setup();
    const { client, submit } = fakeClient([
      { ok: false, reason: 'network' },
      { ok: true, reference: 'HLP-CCCC' },
    ]);
    renderWith(client);
    await walkToContact(user);
    await user.type(screen.getByRole('textbox', { name: /Your mobile/ }), '9876543210');
    await user.click(screen.getByRole('button', { name: en.continue }));
    await user.click(screen.getByRole('checkbox', { name: en.consentContact }));
    await user.click(screen.getByRole('button', { name: en.send }));
    expect(await screen.findByRole('heading', { name: en.netTitle })).toHaveFocus();
    expect(within(dialog()).getByRole('alert')).toHaveTextContent(en.netText);
    expect(within(dialog()).getByRole('link', { name: en.whatsapp })).toBeVisible();
    await user.click(screen.getByRole('button', { name: en.tryAgain }));
    expect(await screen.findByText('HLP-CCCC')).toBeVisible();
    expect(submit.mock.calls[1]![0]).toEqual(submit.mock.calls[0]![0]);
  });

  it('Back from an error returns to the last screen with answers kept', async () => {
    const user = userEvent.setup();
    const { client } = fakeClient([{ ok: false, reason: 'invalid' }]);
    renderWith(client);
    await walkToContact(user);
    await user.type(screen.getByRole('textbox', { name: /Your mobile/ }), '9876543210');
    await user.click(screen.getByRole('button', { name: en.continue }));
    await user.click(screen.getByRole('checkbox', { name: en.consentContact }));
    await user.click(screen.getByRole('button', { name: en.send }));
    expect(await screen.findByRole('heading', { name: en.invalidTitle })).toBeVisible();
    expect(screen.queryByRole('button', { name: en.tryAgain })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: en.back }));
    expect(screen.getByRole('checkbox', { name: en.consentContact })).toBeChecked();
    await user.click(screen.getByRole('button', { name: en.back }));
    expect(screen.getByRole('textbox', { name: /Your mobile/ })).toHaveValue('9876543210');
  });

  it('too many attempts: polite wait message and human channels', async () => {
    const user = userEvent.setup();
    const { client } = fakeClient([{ ok: false, reason: 'rate_limited' }]);
    renderWith(client);
    await user.click(screen.getByRole('button', { name: en.callMeBack }));
    await user.type(screen.getByRole('textbox', { name: /Your mobile/ }), '9876543210');
    await user.click(screen.getByRole('checkbox', { name: en.consentContact }));
    await user.click(screen.getByRole('button', { name: en.callMe }));
    expect(await screen.findByRole('heading', { name: en.waitTitle })).toBeVisible();
    expect(within(dialog()).getByRole('link', { name: en.whatsapp })).toBeVisible();
  });

  it('a thrown error is treated as a network error', async () => {
    const user = userEvent.setup();
    const client: HelpClient = {
      acceptsRequests: true,
      submit: vi.fn().mockRejectedValue(new Error('offline')),
    };
    renderWith(client);
    await user.click(screen.getByRole('button', { name: en.callMeBack }));
    await user.type(screen.getByRole('textbox', { name: /Your mobile/ }), '9876543210');
    await user.click(screen.getByRole('checkbox', { name: en.consentContact }));
    await user.click(screen.getByRole('button', { name: en.callMe }));
    expect(await screen.findByRole('heading', { name: en.netTitle })).toBeVisible();
  });

  it('while sending: button busy and the panel cannot be dismissed', async () => {
    const user = userEvent.setup();
    let resolve: (r: HelpSubmitResult) => void = () => {};
    const client: HelpClient = {
      acceptsRequests: true,
      submit: () => new Promise((r) => (resolve = r)),
    };
    renderWith(client);
    await user.click(screen.getByRole('button', { name: en.callMeBack }));
    await user.type(screen.getByRole('textbox', { name: /Your mobile/ }), '9876543210');
    await user.click(screen.getByRole('checkbox', { name: en.consentContact }));
    await user.click(screen.getByRole('button', { name: en.callMe }));
    expect(screen.getByRole('button', { name: /Call me back/ })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(dialog()).toBeVisible();
    resolve({ ok: true, reference: 'HLP-DDDD' });
    expect(await screen.findByText('HLP-DDDD')).toBeVisible();
  });

  it('honeypot is hidden from people and assistive tech', () => {
    const { client } = fakeClient([]);
    renderWith(client);
    // Start screen has no form; open call-back to render the trap.
    screen.getByRole('button', { name: en.callMeBack }).click();
    return waitFor(() => {
      const trap = document.querySelector('input[name="website"]')!;
      expect(trap).toHaveAttribute('tabindex', '-1');
      expect(trap.closest('[aria-hidden="true"]')).not.toBeNull();
    });
  });
});

describe('call me back', () => {
  it('one field + consent; sends only phone, consent and language', async () => {
    const user = userEvent.setup();
    const { client, submit } = fakeClient([{ ok: true, reference: 'HLP-EEEE' }]);
    renderWith(client, '/ta/#get-help');
    await user.click(screen.getByRole('button', { name: ta.callMeBack }));
    expect(screen.getByRole('heading', { name: ta.cbTitle })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: ta.callMe }));
    expect(screen.getByText(ta.mobileError)).toBeVisible();
    expect(screen.getByText(ta.consentContactError)).toBeVisible();
    await user.type(
      screen.getByRole('textbox', { name: new RegExp(ta.yourMobile) }),
      '+91 98765 43210',
    );
    await user.click(screen.getByRole('checkbox', { name: ta.consentContact }));
    await user.click(screen.getByRole('button', { name: ta.callMe }));
    expect(await screen.findByText('HLP-EEEE')).toBeVisible();
    expect(submit).toHaveBeenCalledWith({
      mode: 'callback',
      phone: '+919876543210',
      consentContact: true,
      pageLanguage: 'ta',
      website: '',
    });
  });

  it('Back returns to the start', async () => {
    const user = userEvent.setup();
    const { client } = fakeClient([]);
    renderWith(client);
    await user.click(screen.getByRole('button', { name: en.callMeBack }));
    await user.click(screen.getByRole('button', { name: en.back }));
    expect(screen.getByRole('heading', { name: en.startTitle })).toBeVisible();
  });
});

describe('no sensitive-document fields', () => {
  it('the whole wizard has no file input and no Aadhaar/PAN/income/medical field', async () => {
    const user = userEvent.setup();
    const { client } = fakeClient([]);
    renderWith(client);
    await walkToContact(user, 'someone' as never);
    await user.type(screen.getByRole('textbox', { name: /Your mobile/ }), '9876543210');
    await user.click(screen.getByRole('button', { name: en.continue }));
    expect(document.querySelector('input[type="file"]')).toBeNull();
    const labels = [...document.querySelectorAll('label')].map((l) => l.textContent ?? '');
    for (const label of labels) {
      expect(label).not.toMatch(/aadhaar|pan\b|income|medical|document|photo|upload/i);
    }
  });
});

describe('accessibility', () => {
  it('start, a wizard step with errors and the sent screen have no axe violations', async () => {
    const user = userEvent.setup();
    const { client } = fakeClient([{ ok: true, reference: 'HLP-FFFF' }]);
    renderWith(client);
    await expectNoA11yViolations(dialog());
    await user.click(screen.getByRole('button', { name: en.fillForm }));
    await user.click(screen.getByRole('button', { name: en.continue }));
    await expectNoA11yViolations(dialog());
    await user.click(screen.getByRole('button', { name: en.back }));
    await user.click(screen.getByRole('button', { name: en.callMeBack }));
    await user.type(screen.getByRole('textbox', { name: /Your mobile/ }), '9876543210');
    await user.click(screen.getByRole('checkbox', { name: en.consentContact }));
    await user.click(screen.getByRole('button', { name: en.callMe }));
    await screen.findByText('HLP-FFFF');
    await expectNoA11yViolations(dialog());
  });
});
