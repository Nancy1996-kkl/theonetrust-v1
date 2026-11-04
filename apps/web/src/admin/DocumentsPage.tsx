import { useEffect, useState, type FormEvent } from 'react';
import {
  DOCUMENT_FILE_TYPES,
  type AdminDocument,
  type AdminDocumentList,
  type DocumentFileType,
} from '@theonetrust/contracts';
import { Button } from '../components/ui/Button.tsx';
import { DataTable, type Column } from '../components/ui/DataTable.tsx';
import { SelectField } from '../components/ui/SelectField.tsx';
import { StatusPill } from '../components/ui/StatusPill.tsx';
import { TextField } from '../components/ui/TextField.tsx';
import { useAdmin } from './admin-context.ts';
import {
  bytesFor,
  cmsErrorText,
  fileToBase64,
  reasonOk,
  statusLabel,
  statusTone,
} from './cms-format.ts';
import { CMS_STRINGS } from './cms-strings.ts';
import { AdminApiError } from './api.ts';
import { fillText } from './ledger-strings.ts';

const isAllowed = (type: string): type is DocumentFileType =>
  (DOCUMENT_FILE_TYPES as readonly string[]).includes(type);

/**
 * `/admin/transparency` (#36): transparency documents. The browser checks type and size first for
 * a quick answer; the server checks again from the file's bytes. Private until published.
 */
export function DocumentsPage() {
  const { api, t, lang } = useAdmin();
  const c = CMS_STRINGS[lang];
  const size = bytesFor(lang);
  const [data, setData] = useState<AdminDocumentList | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState({ title: '', locale: lang as 'ta' | 'en', period: '' });
  const [fileError, setFileError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .documents()
      .then((r) => !cancelled && setData(r))
      .catch((e: unknown) => !cancelled && setError(cmsErrorText(t, c, e)));
    return () => {
      cancelled = true;
    };
  }, [api, t, c, attempt]);

  const tooLarge = (max: number) => fillText(c.docTooLarge, { size: size(max) });

  async function run(change: (reason: string) => Promise<unknown>) {
    if (!reasonOk(reason)) return setReasonError(true);
    setReasonError(false);
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      await change(reason.trim());
      setMessage(c.saved);
      setReason('');
      setAttempt((n) => n + 1);
      return true;
    } catch (e) {
      setError(
        e instanceof AdminApiError && e.code === 'PAYLOAD_TOO_LARGE' && data
          ? tooLarge(data.maxBytes)
          : cmsErrorText(t, c, e),
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  function choose(chosen: File | null) {
    setFile(chosen);
    setFileError(
      !chosen || !data
        ? null
        : !isAllowed(chosen.type)
          ? c.docWrongType
          : chosen.size > data.maxBytes
            ? tooLarge(data.maxBytes)
            : null,
    );
  }

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file) return setFileError(c.docChoose);
    if (fileError || !isAllowed(file.type)) return;
    const fileType = file.type;
    const ok = await run(async (r) =>
      api.uploadDocument({
        title: meta.title.trim(),
        locale: meta.locale,
        periodLabel: meta.period.trim() || null,
        fileName: file.name,
        fileType,
        dataBase64: await fileToBase64(file),
        reason: r,
      }),
    );
    if (ok) {
      setFile(null);
      setMeta({ title: '', locale: meta.locale, period: '' });
    }
  }

  const columns: Column<AdminDocument>[] = [
    { key: 'title', header: c.docName, rowHeader: true, cell: (d) => d.title },
    {
      key: 'lang',
      header: c.docLanguage,
      cell: (d) => (d.locale === 'ta' ? c.inTamil : c.inEnglish),
    },
    { key: 'period', header: c.docPeriod, cell: (d) => d.periodLabel ?? '—' },
    { key: 'size', header: c.docSize, align: 'end', cell: (d) => size(d.fileSize) },
    {
      key: 'status',
      header: c.colStatus,
      cell: (d) => (
        <span className="admin-email__status">
          <StatusPill tone={statusTone(d.status)}>{statusLabel(c, d.status)}</StatusPill>
          {d.publicUrl && (
            <a href={d.publicUrl} target="_blank" rel="noreferrer">
              {c.docOpen} <span className="visually-hidden">{d.title}</span>
            </a>
          )}
        </span>
      ),
    },
    {
      key: 'actions',
      header: c.colActions,
      cell: (d) => (
        <span className="admin-filters__actions">
          {d.status === 'PUBLISHED' ? (
            <Button
              variant="secondary"
              onClick={() => void run((r) => api.unpublishDocument(d.id, r))}
            >
              {c.unpublish} <span className="visually-hidden">{d.title}</span>
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={() => void run((r) => api.publishDocument(d.id, r))}
              >
                {c.publish} <span className="visually-hidden">{d.title}</span>
              </Button>
              <Button
                variant="secondary"
                onClick={() => void run((r) => api.deleteDocument(d.id, r))}
              >
                {c.delete} <span className="visually-hidden">{d.title}</span>
              </Button>
            </>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="admin-page">
      <h1>{c.docTitle}</h1>
      <p>{c.docIntro}</p>
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
      {data && !data.uploadsEnabled && <p className="admin-muted">{c.docOff}</p>}
      {data?.uploadsEnabled && (
        <form className="admin-form admin-decision" onSubmit={upload} aria-labelledby="doc-upload">
          <h2 id="doc-upload">{c.docUpload}</h2>
          <TextField
            label={c.docFile}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            hint={fillText(c.docFileHint, { size: size(data.maxBytes) })}
            error={fileError ?? undefined}
            onChange={(e) => choose(e.target.files?.[0] ?? null)}
          />
          <TextField
            label={c.docName}
            maxLength={200}
            value={meta.title}
            onChange={(e) => setMeta({ ...meta, title: e.target.value })}
          />
          <SelectField
            label={c.docLanguage}
            value={meta.locale}
            onChange={(e) => setMeta({ ...meta, locale: e.target.value as 'ta' | 'en' })}
            options={[
              { value: 'ta', label: c.inTamil },
              { value: 'en', label: c.inEnglish },
            ]}
          />
          <TextField
            label={c.docPeriod}
            maxLength={80}
            value={meta.period}
            onChange={(e) => setMeta({ ...meta, period: e.target.value })}
          />
          <Button type="submit" loading={busy}>
            {c.docUpload}
          </Button>
        </form>
      )}
      {data && (
        <DataTable
          caption={c.docCaption}
          columns={columns}
          rows={data.items}
          rowKey={(d) => d.id}
          empty={<p>{c.nothing}</p>}
        />
      )}
    </div>
  );
}
