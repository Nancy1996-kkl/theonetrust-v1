import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type {
  AdminDocument,
  AdminMetric,
  AdminProgramme,
  AdminSection,
  AdminSessionResponse,
  AdminTrustSettings,
} from '@theonetrust/contracts';
import { expectNoA11yViolations } from '../test/a11y.ts';
import { AdminLayout } from './AdminLayout.tsx';
import { AdminNav } from './AdminNav.tsx';
import { ContentPage } from './ContentPage.tsx';
import { DocumentsPage } from './DocumentsPage.tsx';
import { MetricsPage } from './MetricsPage.tsx';
import { ProgrammesPage } from './ProgrammesPage.tsx';
import { RequireAdmin } from './RequireAdmin.tsx';
import { SiteSettingsPage } from './SiteSettingsPage.tsx';
import { AdminApiError, createAdminApi, type AdminApi } from './api.ts';
import { bytesFor, cmsErrorText, fileToBase64, rupeesToPaise, statusLabel } from './cms-format.ts';
import { CMS_STRINGS } from './cms-strings.ts';
import { ADMIN_STRINGS } from './strings.ts';

const c = CMS_STRINGS.en;
const REASON = 'Owner checked this';
const ACTIVE: AdminSessionResponse = {
  stage: 'ACTIVE',
  user: { email: 'o@example.org', role: 'OWNER', locale: 'en' },
  csrfToken: 'c',
};

function renderAt(path: string, api: Partial<AdminApi>) {
  const adminApi = {
    session: vi.fn(async () => ACTIVE),
    logout: vi.fn(),
    updatePreferences: vi.fn(),
    ...api,
  } as unknown as AdminApi;
  const router = createMemoryRouter(
    [
      {
        path: '/admin',
        element: <AdminLayout api={adminApi} />,
        children: [
          {
            element: <RequireAdmin />,
            children: [
              {
                element: <AdminNav />,
                children: [
                  { path: 'programmes', element: <ProgrammesPage /> },
                  { path: 'content', element: <ContentPage /> },
                  { path: 'metrics', element: <MetricsPage /> },
                  { path: 'transparency', element: <DocumentsPage /> },
                  { path: 'settings', element: <SiteSettingsPage /> },
                ],
              },
            ],
          },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

const PROG: AdminProgramme = {
  id: 'p1',
  slug: 'education',
  titleTa: 'கல்வி',
  titleEn: 'Education',
  descriptionTa: null,
  descriptionEn: null,
  designation: 'RESTRICTED',
  active: true,
  sortOrder: 0,
  donations: 2,
};

describe('content management strings (#36)', () => {
  it('has every key in both languages', () => {
    expect(Object.keys(CMS_STRINGS.ta).sort()).toEqual(Object.keys(CMS_STRINGS.en).sort());
    for (const value of Object.values(CMS_STRINGS.ta)) expect(value.trim()).not.toBe('');
  });

  it('formats errors, sizes, statuses and rupees', async () => {
    const t = ADMIN_STRINGS.en;
    expect(cmsErrorText(t, c, new AdminApiError('CONFLICT'))).toBe(c.conflict);
    expect(cmsErrorText(t, c, new AdminApiError('VALIDATION_ERROR'))).toBe(c.invalid);
    expect(cmsErrorText(t, c, new AdminApiError('UNSUPPORTED_MEDIA_TYPE'))).toBe(c.docWrongType);
    expect(cmsErrorText(t, c, new Error('x'))).toBe(t.errorGeneric);
    expect(bytesFor('en')(10_485_760)).toBe('10 MB');
    expect(bytesFor('en')(100)).toBe('1 KB');
    expect(bytesFor('ta')(2048)).toContain('KB');
    expect(statusLabel(c, 'ARCHIVED')).toBe(c.statusArchived);
    expect(rupeesToPaise('500')).toBe(50_000);
    expect(rupeesToPaise('5.5')).toBeNull();
    expect(await fileToBase64(new Blob(['%PDF-']))).toBe(btoa('%PDF-'));
  });
});

describe('programmes page (#36)', () => {
  it('lists, creates with a reason, pauses, and shows delete only when unused', async () => {
    const user = userEvent.setup();
    const programmes = vi.fn(async () => ({
      items: [
        PROG,
        {
          ...PROG,
          id: 'p2',
          slug: 'food',
          titleEn: 'Food',
          donations: 0,
          active: false,
          designation: 'GENERAL' as const,
        },
      ],
    }));
    const createProgramme = vi.fn(async () => PROG);
    const updateProgramme = vi.fn(async () => PROG);
    const deleteProgramme = vi
      .fn()
      .mockRejectedValueOnce(new AdminApiError('CONFLICT'))
      .mockResolvedValue({ deleted: true });
    const { container } = renderAt('/admin/programmes', {
      programmes,
      createProgramme,
      updateProgramme,
      deleteProgramme,
    });
    expect(await screen.findByRole('rowheader', { name: 'Education' })).toBeVisible();
    expect(screen.getByText(c.progRestricted)).toBeVisible();
    expect(screen.queryByRole('button', { name: `${c.delete} education` })).toBeNull();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: c.progNew }));
    const form = screen.getByRole('form', { name: c.progNew });
    await user.type(within(form).getByLabelText(c.progSlug), 'health');
    await user.type(within(form).getByLabelText(c.progTitleTa), 'சுகாதாரம்');
    await user.type(within(form).getByLabelText(c.progTitleEn), 'Health');
    await user.type(within(form).getByLabelText(c.progDescEn), 'Clinic visits.');
    await user.selectOptions(within(form).getByLabelText(c.progDesignation), 'RESTRICTED');
    await user.clear(within(form).getByLabelText(c.progOrder));
    await user.type(within(form).getByLabelText(c.progOrder), '2');
    await user.click(within(form).getByLabelText(c.progActive));
    await user.click(within(form).getByRole('button', { name: c.save }));
    expect(screen.getByText(c.reasonError)).toBeVisible();
    await user.type(screen.getByLabelText(c.reason), REASON);
    await user.click(within(form).getByRole('button', { name: c.save }));
    expect(createProgramme).toHaveBeenCalledWith({
      slug: 'health',
      titleTa: 'சுகாதாரம்',
      titleEn: 'Health',
      descriptionTa: null,
      descriptionEn: 'Clinic visits.',
      designation: 'RESTRICTED',
      active: true,
      sortOrder: 2,
      reason: REASON,
    });
    expect(await screen.findByText(c.saved)).toBeVisible();

    await user.type(screen.getByLabelText(c.reason), REASON);
    await user.click(screen.getByRole('button', { name: `${c.progPause} education` }));
    expect(updateProgramme).toHaveBeenCalledWith('p1', { active: false, reason: REASON });

    await user.type(screen.getByLabelText(c.reason), REASON);
    await user.click(await screen.findByRole('button', { name: `${c.delete} food` }));
    expect(await screen.findByText(c.conflict)).toBeVisible();
    await user.click(screen.getByRole('button', { name: `${c.delete} food` }));
    expect(deleteProgramme).toHaveBeenLastCalledWith('p2', REASON);

    await user.click(await screen.findByRole('button', { name: `${c.edit} education` }));
    const edit = screen.getByRole('form', { name: c.edit });
    expect(within(edit).getByLabelText(c.progTitleEn)).toHaveValue('Education');
    await user.type(screen.getByLabelText(c.reason), REASON);
    await user.click(within(edit).getByRole('button', { name: c.save }));
    expect(updateProgramme).toHaveBeenLastCalledWith(
      'p1',
      expect.objectContaining({ slug: 'education', reason: REASON }),
    );
    await user.click(await screen.findByRole('button', { name: `${c.progActivate} food` }));
  });

  it('a load error is shown; cancel closes the form', async () => {
    const user = userEvent.setup();
    renderAt('/admin/programmes', {
      programmes: vi.fn().mockRejectedValue(new AdminApiError('NETWORK_ERROR')),
    });
    expect(await screen.findByRole('alert')).toBeVisible();
    await user.click(screen.getByRole('button', { name: c.progNew }));
    await user.click(screen.getByRole('button', { name: c.cancel }));
    expect(screen.queryByRole('form')).toBeNull();
  });
});

const SECTIONS: AdminSection[] = [
  {
    key: 'hero.headline',
    kind: 'text',
    draft: {
      ta: { version: 2, status: 'DRAFT', content: { text: 'புதிய' }, updatedAt: '' },
      en: { version: 2, status: 'DRAFT', content: { text: 'New' }, updatedAt: '' },
    },
    published: {
      ta: { version: 1, status: 'PUBLISHED', content: { text: 'பழைய' }, updatedAt: '' },
      en: { version: 1, status: 'PUBLISHED', content: { text: 'Old' }, updatedAt: '' },
    },
  },
  {
    key: 'faq.tax',
    kind: 'faq',
    draft: { ta: null, en: null },
    published: {
      ta: null,
      en: {
        version: 1,
        status: 'PUBLISHED',
        content: { question: 'Q', answer: 'A', order: 1 },
        updatedAt: '',
      },
    },
  },
  {
    key: 'about.intro',
    kind: 'text',
    draft: { ta: null, en: null },
    published: { ta: null, en: null },
  },
];

describe('content page (#36)', () => {
  it('edits both languages as a draft, publishes, unpublishes and previews', async () => {
    const user = userEvent.setup();
    const saveSectionDraft = vi.fn(async () => SECTIONS[0] as AdminSection);
    const publishSection = vi.fn(async () => SECTIONS[0] as AdminSection);
    const unpublishSection = vi.fn(async () => SECTIONS[1] as AdminSection);
    const contentPreview = vi.fn(async (locale: 'ta' | 'en') => ({
      locale,
      texts: { 'hero.headline': 'New' },
      faqs: [{ id: 'tax', question: 'Q?', answer: 'A.' }],
      stories: [{ id: 's', title: 'A story', body: 'Body' }],
    }));
    const { container } = renderAt('/admin/content', {
      contentSections: vi.fn(async () => ({ items: SECTIONS })),
      saveSectionDraft,
      publishSection,
      unpublishSection,
      contentPreview,
    });
    expect(await screen.findByRole('rowheader', { name: 'hero.headline' })).toBeVisible();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: `${c.edit} hero.headline` }));
    const form = screen.getByRole('form', { name: `${c.kindText}: hero.headline` });
    const en = within(form).getByLabelText(`${c.contentText} (${c.inEnglish})`);
    expect(en).toHaveValue('New');
    await user.clear(en);
    await user.type(en, 'Newer');
    await user.type(screen.getByLabelText(c.reason), REASON);
    await user.click(within(form).getByRole('button', { name: c.contentSaveDraft }));
    expect(saveSectionDraft).toHaveBeenCalledWith('hero.headline', {
      ta: { text: 'புதிய' },
      en: { text: 'Newer' },
      reason: REASON,
    });
    // The form stays open after saving a draft.
    expect(await screen.findByText(c.saved)).toBeVisible();
    await user.click(within(form).getByRole('button', { name: c.cancel }));

    await user.type(screen.getByLabelText(c.reason), REASON);
    await user.click(screen.getByRole('button', { name: `${c.publish} hero.headline` }));
    expect(publishSection).toHaveBeenCalledWith('hero.headline', REASON);
    await user.type(screen.getByLabelText(c.reason), REASON);
    await user.click(await screen.findByRole('button', { name: `${c.unpublish} faq.tax` }));
    expect(unpublishSection).toHaveBeenCalledWith('faq.tax', REASON);

    await user.click(screen.getByRole('button', { name: `${c.contentPreview}: ${c.inTamil}` }));
    expect(contentPreview).toHaveBeenCalledWith('ta');
    expect(await screen.findByText('A story')).toBeVisible();
    expect(screen.getByText('Q?')).toBeVisible();
  });

  it('adds a FAQ (with order) and a story (with consent date); bad names and errors', async () => {
    const user = userEvent.setup();
    const saveSectionDraft = vi
      .fn()
      .mockRejectedValueOnce(new AdminApiError('VALIDATION_ERROR'))
      .mockResolvedValue(SECTIONS[1] as AdminSection);
    renderAt('/admin/content', {
      contentSections: vi.fn(async () => ({ items: SECTIONS })),
      saveSectionDraft,
      contentPreview: vi.fn().mockRejectedValue(new AdminApiError('NETWORK_ERROR')),
    });
    await screen.findByRole('rowheader', { name: 'faq.tax' });
    await user.type(screen.getByLabelText(c.contentNewId), 'Bad Name');
    await user.click(screen.getByRole('button', { name: c.contentNewFaq }));
    expect(screen.getByRole('alert')).toHaveTextContent(c.invalid);
    await user.clear(screen.getByLabelText(c.contentNewId));
    await user.type(screen.getByLabelText(c.contentNewId), 'refunds');
    await user.click(screen.getByRole('button', { name: c.contentNewFaq }));
    const faq = screen.getByRole('form', { name: `${c.kindFaq}: faq.refunds` });
    for (const [l, word] of [
      [c.inTamil, 'த'],
      [c.inEnglish, 'E'],
    ] as const) {
      await user.type(within(faq).getByLabelText(`${c.contentQuestion} (${l})`), `${word}?`);
      await user.type(within(faq).getByLabelText(`${c.contentAnswer} (${l})`), `${word}.`);
      await user.type(within(faq).getByLabelText(`${c.contentOrder} (${l})`), '3');
    }
    await user.type(screen.getByLabelText(c.reason), REASON);
    await user.click(within(faq).getByRole('button', { name: c.contentSaveDraft }));
    expect(await screen.findByText(c.invalid)).toBeVisible();
    await user.click(within(faq).getByRole('button', { name: c.contentSaveDraft }));
    expect(saveSectionDraft).toHaveBeenLastCalledWith('faq.refunds', {
      ta: { question: 'த?', answer: 'த.', order: 3 },
      en: { question: 'E?', answer: 'E.', order: 3 },
      reason: REASON,
    });

    await user.type(screen.getByLabelText(c.contentNewId), 'library');
    await user.click(screen.getByRole('button', { name: c.contentNewStory }));
    const story = screen.getByRole('form', { name: `${c.kindStory}: story.library` });
    expect(within(story).getByText(c.contentConsentNote)).toBeVisible();
    await user.type(within(story).getByLabelText(`${c.contentStoryTitle} (${c.inEnglish})`), 'T');
    await user.type(within(story).getByLabelText(`${c.contentStoryBody} (${c.inEnglish})`), 'B');
    await user.type(within(story).getByLabelText(c.contentConsent), '2026-10-01');
    await user.type(screen.getByLabelText(c.reason), REASON);
    await user.click(within(story).getByRole('button', { name: c.contentSaveDraft }));
    expect(saveSectionDraft).toHaveBeenLastCalledWith('story.library', {
      ta: { title: '', body: '', consentRecordedOn: '2026-10-01' },
      en: { title: 'T', body: 'B', consentRecordedOn: '2026-10-01' },
      reason: REASON,
    });
    await user.click(screen.getByRole('button', { name: `${c.contentPreview}: ${c.inEnglish}` }));
    expect(await screen.findByText(ADMIN_STRINGS.en.errorNetwork)).toBeVisible();
  });

  it('shows a load error', async () => {
    renderAt('/admin/content', {
      contentSections: vi.fn().mockRejectedValue(new AdminApiError('SERVICE_UNAVAILABLE')),
    });
    expect(await screen.findByText(ADMIN_STRINGS.en.errorUnavailable)).toBeVisible();
  });
});

const METRIC: AdminMetric = {
  id: 'm1',
  labelTa: 'மாணவர்கள்',
  labelEn: 'Students',
  value: '120',
  valueFormat: 'count',
  sourceTa: 'பதிவேடு',
  sourceEn: 'Register',
  periodTa: '2025-26',
  periodEn: '2025-26',
  asOf: '2026-03-31',
  evidenceUrl: null,
  status: 'DRAFT',
  approvedAt: null,
  sortOrder: 0,
};

describe('metrics page (#36)', () => {
  it('creates, edits, publishes (only when complete), unpublishes and deletes', async () => {
    const user = userEvent.setup();
    const createMetric = vi.fn(async () => METRIC);
    const updateMetric = vi.fn(async () => METRIC);
    const publishMetric = vi.fn(async () => METRIC);
    const unpublishMetric = vi.fn(async () => METRIC);
    const deleteMetric = vi.fn(async () => ({ deleted: true as const }));
    const { container } = renderAt('/admin/metrics', {
      metrics: vi.fn(async () => ({
        items: [
          METRIC,
          { ...METRIC, id: 'm2', labelEn: 'Meals', sourceTa: null, asOf: null },
          { ...METRIC, id: 'm3', labelEn: 'Families', status: 'PUBLISHED' as const },
        ],
      })),
      createMetric,
      updateMetric,
      publishMetric,
      unpublishMetric,
      deleteMetric,
    });
    expect(await screen.findByRole('rowheader', { name: 'Students' })).toBeVisible();
    await expectNoA11yViolations(container);

    await user.type(screen.getByLabelText(c.reason), REASON);
    await user.click(screen.getByRole('button', { name: `${c.publish} Meals` }));
    expect(screen.getByRole('alert')).toHaveTextContent(c.metricMissing);
    expect(publishMetric).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: `${c.publish} Students` }));
    expect(publishMetric).toHaveBeenCalledWith('m1', REASON);
    await user.type(screen.getByLabelText(c.reason), REASON);
    await user.click(await screen.findByRole('button', { name: `${c.unpublish} Families` }));
    expect(unpublishMetric).toHaveBeenCalledWith('m3', REASON);
    await user.type(screen.getByLabelText(c.reason), REASON);
    await user.click(await screen.findByRole('button', { name: `${c.delete} Meals` }));
    expect(deleteMetric).toHaveBeenCalledWith('m2', REASON);

    await user.click(await screen.findByRole('button', { name: c.metricNew }));
    const form = screen.getByRole('form', { name: c.metricNew });
    await user.type(within(form).getByLabelText(c.metricLabelTa), 'உணவு');
    await user.type(within(form).getByLabelText(c.metricLabelEn), 'Meals served');
    await user.type(within(form).getByLabelText(c.metricValue), '5000');
    await user.selectOptions(within(form).getByLabelText(c.metricFormat), 'inr_paise');
    await user.type(within(form).getByLabelText(c.metricAsOf), '2026-03-31');
    await user.type(within(form).getByLabelText(c.metricEvidence), 'https://example.org/r.pdf');
    await user.type(screen.getByLabelText(c.reason), REASON);
    await user.click(within(form).getByRole('button', { name: c.save }));
    expect(createMetric).toHaveBeenCalledWith({
      labelTa: 'உணவு',
      labelEn: 'Meals served',
      sourceTa: null,
      sourceEn: null,
      periodTa: null,
      periodEn: null,
      value: '5000',
      valueFormat: 'inr_paise',
      asOf: '2026-03-31',
      evidenceUrl: 'https://example.org/r.pdf',
      reason: REASON,
    });

    await user.click(await screen.findByRole('button', { name: `${c.edit} Students` }));
    const edit = screen.getByRole('form', { name: c.edit });
    expect(within(edit).getByLabelText(c.metricSourceEn)).toHaveValue('Register');
    await user.type(screen.getByLabelText(c.reason), REASON);
    await user.click(within(edit).getByRole('button', { name: c.save }));
    expect(updateMetric).toHaveBeenCalledWith('m1', expect.objectContaining({ value: '120' }));
    await user.click(await screen.findByRole('button', { name: c.metricNew }));
    await user.click(screen.getByRole('button', { name: c.cancel }));
  });

  it('shows a load error and a save error', async () => {
    const user = userEvent.setup();
    renderAt('/admin/metrics', {
      metrics: vi.fn(async () => ({ items: [] })),
      createMetric: vi.fn().mockRejectedValue(new AdminApiError('VALIDATION_ERROR')),
    });
    expect(await screen.findByText(c.nothing)).toBeVisible();
    await user.click(screen.getByRole('button', { name: c.metricNew }));
    await user.type(screen.getByLabelText(c.reason), REASON);
    await user.click(screen.getByRole('button', { name: c.save }));
    expect(await screen.findByText(c.invalid)).toBeVisible();
  });

  it('a failed load shows an alert', async () => {
    renderAt('/admin/metrics', { metrics: vi.fn().mockRejectedValue(new Error('x')) });
    expect(await screen.findByRole('alert')).toBeVisible();
  });
});

const DOC: AdminDocument = {
  id: 'd1',
  title: 'Annual report',
  locale: 'en',
  periodLabel: '2025-26',
  fileType: 'application/pdf',
  fileSize: 2048,
  status: 'DRAFT',
  approvedAt: null,
  uploadedAt: '2026-10-01T00:00:00Z',
  publicUrl: null,
};

describe('documents page (#36)', () => {
  it('checks type and size in the browser, uploads, publishes, unpublishes, deletes', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const uploadDocument = vi
      .fn()
      .mockRejectedValueOnce(new AdminApiError('PAYLOAD_TOO_LARGE'))
      .mockResolvedValue(DOC);
    const publishDocument = vi.fn(async () => DOC);
    const unpublishDocument = vi.fn(async () => DOC);
    const deleteDocument = vi.fn(async () => ({ deleted: true as const }));
    const { container } = renderAt('/admin/transparency', {
      documents: vi.fn(async () => ({
        items: [
          DOC,
          {
            ...DOC,
            id: 'd2',
            title: 'Audit',
            locale: 'ta' as const,
            periodLabel: null,
            status: 'PUBLISHED' as const,
            publicUrl: 'https://api.example.org/api/v1/documents/x.pdf',
          },
        ],
        maxBytes: 4096,
        uploadsEnabled: true,
      })),
      uploadDocument,
      publishDocument,
      unpublishDocument,
      deleteDocument,
    });
    expect(await screen.findByRole('rowheader', { name: 'Annual report' })).toBeVisible();
    expect(screen.getByRole('link', { name: `${c.docOpen} Audit` })).toHaveAttribute(
      'href',
      'https://api.example.org/api/v1/documents/x.pdf',
    );
    await expectNoA11yViolations(container);

    const form = screen.getByRole('form', { name: c.docUpload });
    await user.click(within(form).getByRole('button', { name: c.docUpload }));
    expect(screen.getByText(c.docChoose)).toBeVisible();
    const input = within(form).getByLabelText(c.docFile);
    await user.upload(input, new File(['MZ'], 'setup.exe', { type: 'application/x-msdownload' }));
    expect(screen.getByText(c.docWrongType)).toBeVisible();
    await user.click(within(form).getByRole('button', { name: c.docUpload }));
    expect(uploadDocument).not.toHaveBeenCalled();
    await user.upload(
      input,
      new File([new Uint8Array(5000)], 'big.pdf', { type: 'application/pdf' }),
    );
    expect(screen.getByText('The file is too large (limit 4 KB).')).toBeVisible();

    await user.upload(input, new File(['%PDF-1.7'], 'report.pdf', { type: 'application/pdf' }));
    await user.type(within(form).getByLabelText(c.docName), 'Report 2025-26');
    await user.selectOptions(within(form).getByLabelText(c.docLanguage), 'ta');
    await user.type(within(form).getByLabelText(c.docPeriod), '2025-26');
    await user.click(within(form).getByRole('button', { name: c.docUpload }));
    expect(screen.getByText(c.reasonError)).toBeVisible();
    await user.type(screen.getByLabelText(c.reason), REASON);
    await user.click(within(form).getByRole('button', { name: c.docUpload }));
    expect(await screen.findByText('The file is too large (limit 4 KB).')).toBeVisible();
    await user.click(within(form).getByRole('button', { name: c.docUpload }));
    expect(uploadDocument).toHaveBeenLastCalledWith({
      title: 'Report 2025-26',
      locale: 'ta',
      periodLabel: '2025-26',
      fileName: 'report.pdf',
      fileType: 'application/pdf',
      dataBase64: btoa('%PDF-1.7'),
      reason: REASON,
    });
    expect(await screen.findByText(c.saved)).toBeVisible();

    await user.type(screen.getByLabelText(c.reason), REASON);
    await user.click(screen.getByRole('button', { name: `${c.publish} Annual report` }));
    expect(publishDocument).toHaveBeenCalledWith('d1', REASON);
    await user.type(screen.getByLabelText(c.reason), REASON);
    await user.click(await screen.findByRole('button', { name: `${c.unpublish} Audit` }));
    expect(unpublishDocument).toHaveBeenCalledWith('d2', REASON);
    await user.type(screen.getByLabelText(c.reason), REASON);
    await user.click(await screen.findByRole('button', { name: `${c.delete} Annual report` }));
    expect(deleteDocument).toHaveBeenCalledWith('d1', REASON);
  });

  it('says when uploads are off; load error', async () => {
    renderAt('/admin/transparency', {
      documents: vi.fn(async () => ({ items: [], maxBytes: 1024, uploadsEnabled: false })),
    });
    expect(await screen.findByText(c.docOff)).toBeVisible();
    expect(screen.queryByRole('form', { name: c.docUpload })).toBeNull();
  });

  it('a failed load shows an alert', async () => {
    renderAt('/admin/transparency', { documents: vi.fn().mockRejectedValue(new Error('x')) });
    expect(await screen.findByRole('alert')).toBeVisible();
  });
});

const SETTINGS: AdminTrustSettings = {
  legalName: null,
  registrationText: null,
  receiptMinPaise: 50_000,
  maxDonationPaise: 50_000_000,
  ownerEmail: 'server@example.org',
  ownerEmailSource: 'server',
  feeTable: null,
  payment: {
    mode: 'test',
    keyId: 'rzp_test_x',
    keySecretSet: true,
    webhookSecretSet: false,
    subscriptionsEnabled: false,
  },
};

describe('settings page (#36)', () => {
  it('shows status only for payments; saves the profile with a reason', async () => {
    const user = userEvent.setup();
    const updateTrustSettings = vi
      .fn()
      .mockRejectedValueOnce(new AdminApiError('VALIDATION_ERROR'))
      .mockResolvedValue({
        ...SETTINGS,
        legalName: 'Synthetic Trust',
        ownerEmail: 'owner@example.org',
        ownerEmailSource: 'settings' as const,
        feeTable: { version: 'v1' },
      });
    const { container } = renderAt('/admin/settings', {
      trustSettings: vi.fn(async () => SETTINGS),
      updateTrustSettings,
    });
    expect(await screen.findByText(c.payTest)).toBeVisible();
    expect(screen.getByText('rzp_test_x')).toBeVisible();
    expect(screen.getByText(c.paySet)).toBeVisible();
    expect(screen.getByText(c.payNotSet)).toBeVisible();
    expect(screen.getByText(c.payOff)).toBeVisible();
    expect(screen.getByText(/server@example.org/)).toBeVisible();
    await expectNoA11yViolations(container);

    await user.type(screen.getByLabelText(c.setLegalName), 'Synthetic Trust');
    await user.type(screen.getByLabelText(c.setOwnerEmail), 'owner@example.org');
    await user.type(screen.getByLabelText(c.setFeeTable), '{{"version":"v1"}');
    await user.click(screen.getByRole('button', { name: c.save }));
    expect(screen.getByText(c.reasonError)).toBeVisible();
    await user.type(screen.getByLabelText(c.reason), REASON);
    await user.click(screen.getByRole('button', { name: c.save }));
    expect(await screen.findByText(c.invalid)).toBeVisible();
    await user.click(screen.getByRole('button', { name: c.save }));
    expect(updateTrustSettings).toHaveBeenLastCalledWith({
      legalName: 'Synthetic Trust',
      registrationText: null,
      receiptMinPaise: 50_000,
      maxDonationPaise: 50_000_000,
      ownerEmail: 'owner@example.org',
      feeTable: { version: 'v1' },
      reason: REASON,
    });
    expect(await screen.findByText(c.saved)).toBeVisible();
    expect(screen.getByLabelText(c.setOwnerEmail)).toHaveValue('owner@example.org');
  });

  it('refuses bad JSON and bad amounts in the browser; live/none modes; load retry', async () => {
    const user = userEvent.setup();
    const trustSettings = vi
      .fn()
      .mockRejectedValueOnce(new AdminApiError('NETWORK_ERROR'))
      .mockResolvedValueOnce({
        ...SETTINGS,
        ownerEmail: null,
        ownerEmailSource: 'none' as const,
        payment: { ...SETTINGS.payment, mode: 'live' as const, subscriptionsEnabled: true },
      });
    const updateTrustSettings = vi.fn();
    renderAt('/admin/settings', { trustSettings, updateTrustSettings });
    await user.click(await screen.findByRole('button', { name: ADMIN_STRINGS.en.retry }));
    expect(await screen.findByText(c.payLive)).toBeVisible();
    expect(screen.getByText(c.setOwnerNone)).toBeVisible();
    expect(screen.getByText(c.payOn)).toBeVisible();
    await user.type(screen.getByLabelText(c.reason), REASON);
    await user.type(screen.getByLabelText(c.setFeeTable), 'not json');
    await user.click(screen.getByRole('button', { name: c.save }));
    expect(screen.getByText(c.setFeeInvalid)).toBeVisible();
    await user.clear(screen.getByLabelText(c.setFeeTable));
    await user.clear(screen.getByLabelText(c.setReceiptMin));
    await user.type(screen.getByLabelText(c.setReceiptMin), '10.5');
    await user.click(screen.getByRole('button', { name: c.save }));
    expect(screen.getByText(c.invalid)).toBeVisible();
    expect(updateTrustSettings).not.toHaveBeenCalled();
  });

  it('shows "not configured" for payments', async () => {
    renderAt('/admin/settings', {
      trustSettings: vi.fn(async () => ({
        ...SETTINGS,
        ownerEmailSource: 'settings' as const,
        feeTable: { version: 'v' },
        payment: { ...SETTINGS.payment, mode: 'not_configured' as const, keyId: null },
      })),
    });
    expect(await screen.findByText(c.payNone)).toBeVisible();
    expect(screen.getByLabelText(c.setFeeTable)).toHaveValue('{\n  "version": "v"\n}');
  });
});

describe('content management client (#36)', () => {
  it('calls the right endpoints with the right methods', async () => {
    const fetchImpl = vi.fn(
      async (_u: string | URL | Request, _i?: RequestInit) =>
        new Response('{}', { headers: { 'content-type': 'application/json' } }),
    );
    const api = createAdminApi('', fetchImpl);
    const r = 'reason';
    await api.programmes();
    await api.createProgramme({ reason: r });
    await api.updateProgramme('a/b', { reason: r });
    await api.deleteProgramme('a', r);
    await api.contentSections();
    await api.contentPreview('ta');
    await api.saveSectionDraft('faq.x', { ta: {}, en: {}, reason: r });
    await api.publishSection('faq.x', r);
    await api.unpublishSection('faq.x', r);
    await api.metrics();
    await api.createMetric({ reason: r });
    await api.updateMetric('m', { reason: r });
    await api.publishMetric('m', r);
    await api.unpublishMetric('m', r);
    await api.deleteMetric('m', r);
    await api.documents();
    await api.uploadDocument({
      title: 't',
      locale: 'en',
      fileName: 'a.pdf',
      fileType: 'application/pdf',
      dataBase64: 'JVBERi0=',
      reason: r,
    });
    await api.publishDocument('d', r);
    await api.unpublishDocument('d', r);
    await api.deleteDocument('d', r);
    await api.trustSettings();
    await api.updateTrustSettings({ reason: r });
    expect(fetchImpl.mock.calls.map((x) => `${x[1]?.method} ${String(x[0])}`)).toEqual([
      'GET /api/v1/admin/programmes',
      'POST /api/v1/admin/programmes',
      'PATCH /api/v1/admin/programmes/a%2Fb',
      'DELETE /api/v1/admin/programmes/a',
      'GET /api/v1/admin/content',
      'GET /api/v1/admin/content/preview?locale=ta',
      'PUT /api/v1/admin/content/faq.x',
      'POST /api/v1/admin/content/faq.x/publish',
      'POST /api/v1/admin/content/faq.x/unpublish',
      'GET /api/v1/admin/metrics',
      'POST /api/v1/admin/metrics',
      'PATCH /api/v1/admin/metrics/m',
      'POST /api/v1/admin/metrics/m/publish',
      'POST /api/v1/admin/metrics/m/unpublish',
      'DELETE /api/v1/admin/metrics/m',
      'GET /api/v1/admin/documents',
      'POST /api/v1/admin/documents',
      'POST /api/v1/admin/documents/d/publish',
      'POST /api/v1/admin/documents/d/unpublish',
      'DELETE /api/v1/admin/documents/d',
      'GET /api/v1/admin/settings',
      'PATCH /api/v1/admin/settings',
    ]);
  });
});
