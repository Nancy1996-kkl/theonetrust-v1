import { useEffect, useState, type FormEvent } from 'react';
import type { AdminSection, ContentPreview, SectionContent } from '@theonetrust/contracts';
import { Button } from '../components/ui/Button.tsx';
import { DataTable, type Column } from '../components/ui/DataTable.tsx';
import { StatusPill } from '../components/ui/StatusPill.tsx';
import { TextField } from '../components/ui/TextField.tsx';
import { AreaField } from './AreaField.tsx';
import { useAdmin } from './admin-context.ts';
import { cmsErrorText, reasonOk } from './cms-format.ts';
import { CMS_STRINGS, type CmsStrings } from './cms-strings.ts';

type Lang = 'ta' | 'en';
type Kind = AdminSection['kind'];
type Fields = Record<string, string>;
interface Editing {
  key: string;
  kind: Kind;
  ta: Fields;
  en: Fields;
  consent: string;
}

const FIELDS: Record<Kind, string[]> = {
  text: ['text'],
  faq: ['question', 'answer'],
  story: ['title', 'body'],
};
const LONG = new Set(['text', 'answer', 'body']);

function fieldLabel(c: CmsStrings, field: string): string {
  const labels: Record<string, string> = {
    text: c.contentText,
    question: c.contentQuestion,
    answer: c.contentAnswer,
    title: c.contentStoryTitle,
    body: c.contentStoryBody,
  };
  return labels[field] ?? field;
}

const kindLabel = (c: CmsStrings, kind: Kind) =>
  kind === 'text' ? c.kindText : kind === 'faq' ? c.kindFaq : c.kindStory;

/** The current draft, else the published version, as plain strings for the form. */
function fieldsOf(section: AdminSection | undefined, lang: Lang): SectionContent {
  return section?.draft[lang]?.content ?? section?.published[lang]?.content ?? {};
}

/**
 * `/admin/content` (#36): page text, FAQ and stories in both languages. Saving makes a draft;
 * only "Publish" puts it on the site (both languages together). A preview shows the drafts.
 */
export function ContentPage() {
  const { api, t, lang } = useAdmin();
  const c = CMS_STRINGS[lang];
  const [items, setItems] = useState<AdminSection[] | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [preview, setPreview] = useState<ContentPreview | null>(null);
  const [newId, setNewId] = useState('');
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .contentSections()
      .then((r) => !cancelled && setItems(r.items))
      .catch((e: unknown) => !cancelled && setError(cmsErrorText(t, c, e)));
    return () => {
      cancelled = true;
    };
  }, [api, t, c, attempt]);

  async function run(change: (reason: string) => Promise<unknown>, keepEditing = false) {
    if (!reasonOk(reason)) return setReasonError(true);
    setReasonError(false);
    setError(null);
    setMessage(null);
    try {
      await change(reason.trim());
      setMessage(c.saved);
      setReason('');
      if (!keepEditing) setEditing(null);
      setPreview(null);
      setAttempt((n) => n + 1);
    } catch (e) {
      setError(cmsErrorText(t, c, e));
    }
  }

  function open(key: string, kind: Kind) {
    const section = items?.find((s) => s.key === key);
    const read = (l: Lang): Fields => {
      const content = fieldsOf(section, l);
      return Object.fromEntries(
        [...FIELDS[kind], 'order'].map((f) => [f, String(content[f] ?? '')]),
      );
    };
    const consent = String(fieldsOf(section, 'en').consentRecordedOn ?? '');
    setEditing({ key, kind, ta: read('ta'), en: read('en'), consent });
  }

  function addNew(kind: 'faq' | 'story') {
    const id = newId.trim().toLowerCase();
    if (!/^[a-z0-9_-]{1,40}$/.test(id)) return setError(c.invalid);
    setError(null);
    setNewId('');
    open(`${kind}.${id}`, kind);
  }

  function contentFor(e: Editing, l: Lang): SectionContent {
    const out: SectionContent = {};
    for (const f of FIELDS[e.kind]) out[f] = (e[l][f] ?? '').trim();
    if (e.kind === 'faq') out.order = Number(e[l].order) || 0;
    if (e.kind === 'story') out.consentRecordedOn = e.consent;
    return out;
  }

  function saveDraft(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const e = editing;
    void run(
      (r) =>
        api.saveSectionDraft(e.key, {
          ta: contentFor(e, 'ta'),
          en: contentFor(e, 'en'),
          reason: r,
        }),
      true,
    );
  }

  async function showPreview(l: Lang) {
    try {
      setPreview(await api.contentPreview(l));
    } catch (e) {
      setError(cmsErrorText(t, c, e));
    }
  }

  const state = (s: AdminSection) => (
    <span className="admin-email__status">
      {s.draft.en || s.draft.ta ? <StatusPill tone="warning">{c.contentDraft}</StatusPill> : null}
      {s.published.en || s.published.ta ? (
        <StatusPill tone="success">{c.contentPublished}</StatusPill>
      ) : (
        <StatusPill tone="neutral">{c.contentNone}</StatusPill>
      )}
    </span>
  );

  const columns: Column<AdminSection>[] = [
    { key: 'key', header: c.contentSection, rowHeader: true, cell: (s) => s.key },
    { key: 'kind', header: c.colStatus, cell: (s) => kindLabel(c, s.kind) },
    { key: 'state', header: c.contentPublished, cell: state },
    {
      key: 'actions',
      header: c.colActions,
      cell: (s) => (
        <span className="admin-filters__actions">
          <Button variant="secondary" onClick={() => open(s.key, s.kind)}>
            {c.edit} <span className="visually-hidden">{s.key}</span>
          </Button>
          {(s.draft.en || s.draft.ta) && (
            <Button
              variant="secondary"
              onClick={() => void run((r) => api.publishSection(s.key, r))}
            >
              {c.publish} <span className="visually-hidden">{s.key}</span>
            </Button>
          )}
          {(s.published.en || s.published.ta) && (
            <Button
              variant="secondary"
              onClick={() => void run((r) => api.unpublishSection(s.key, r))}
            >
              {c.unpublish} <span className="visually-hidden">{s.key}</span>
            </Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="admin-page">
      <h1>{c.contentTitle}</h1>
      <p>{c.contentIntro}</p>
      {error && (
        <p className="admin-form__error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <div className="admin-form">
        <TextField
          label={c.reason}
          maxLength={400}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={reasonError ? c.reasonError : undefined}
        />
      </div>

      {editing && (
        <form className="admin-form admin-decision" onSubmit={saveDraft} aria-labelledby="sec-form">
          <h2 id="sec-form">
            {kindLabel(c, editing.kind)}: {editing.key}
          </h2>
          <div className="admin-bilingual">
            {(['ta', 'en'] as const).map((l) => (
              <fieldset key={l} lang={l}>
                <legend>{l === 'ta' ? c.inTamil : c.inEnglish}</legend>
                {FIELDS[editing.kind].map((f) => {
                  const props = {
                    label: `${fieldLabel(c, f)} (${l === 'ta' ? c.inTamil : c.inEnglish})`,
                    value: editing[l][f] ?? '',
                    maxLength: f === 'body' ? 4000 : f === 'question' ? 300 : 2000,
                    onChange: (e: { target: { value: string } }) =>
                      setEditing({ ...editing, [l]: { ...editing[l], [f]: e.target.value } }),
                  };
                  return LONG.has(f) ? (
                    <AreaField key={f} {...props} />
                  ) : (
                    <TextField key={f} {...props} />
                  );
                })}
                {editing.kind === 'faq' && (
                  <TextField
                    label={`${c.contentOrder} (${l === 'ta' ? c.inTamil : c.inEnglish})`}
                    type="number"
                    min={0}
                    max={999}
                    value={editing[l].order ?? ''}
                    onChange={(e) =>
                      setEditing({ ...editing, [l]: { ...editing[l], order: e.target.value } })
                    }
                  />
                )}
              </fieldset>
            ))}
          </div>
          {editing.kind === 'story' && (
            <>
              <p className="admin-muted">{c.contentConsentNote}</p>
              <TextField
                label={c.contentConsent}
                type="date"
                value={editing.consent}
                onChange={(e) => setEditing({ ...editing, consent: e.target.value })}
              />
            </>
          )}
          <div className="admin-filters__actions">
            <Button type="submit">{c.contentSaveDraft}</Button>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {c.cancel}
            </Button>
          </div>
        </form>
      )}

      <div className="admin-form">
        <TextField
          label={c.contentNewId}
          maxLength={40}
          value={newId}
          onChange={(e) => setNewId(e.target.value)}
        />
        <div className="admin-filters__actions">
          <Button variant="secondary" onClick={() => addNew('faq')}>
            {c.contentNewFaq}
          </Button>
          <Button variant="secondary" onClick={() => addNew('story')}>
            {c.contentNewStory}
          </Button>
        </div>
      </div>

      {items && (
        <DataTable
          caption={c.contentCaption}
          columns={columns}
          rows={items}
          rowKey={(s) => s.key}
          empty={<p>{c.nothing}</p>}
        />
      )}

      <section aria-labelledby="sec-preview">
        <h2 id="sec-preview">{c.contentPreview}</h2>
        <p>{c.contentPreviewIntro}</p>
        <div className="admin-filters__actions">
          <Button variant="secondary" onClick={() => void showPreview('ta')}>
            {c.contentPreview}: {c.inTamil}
          </Button>
          <Button variant="secondary" onClick={() => void showPreview('en')}>
            {c.contentPreview}: {c.inEnglish}
          </Button>
        </div>
        {preview && (
          <div lang={preview.locale} className="admin-decision">
            <dl>
              {Object.entries(preview.texts).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            {preview.faqs.map((f) => (
              <details key={f.id}>
                <summary>{f.question}</summary>
                <p>{f.answer}</p>
              </details>
            ))}
            {preview.stories.map((s) => (
              <article key={s.id}>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
