import { Link } from 'react-router';
import { homePath } from '../../i18n/lang.ts';
import { useLang, useMessages } from '../../i18n/use-lang.ts';

/** Not-found page in the visitor's language (English at the root, Tamil under /ta/). */
export function NotFoundPage() {
  const lang = useLang();
  const t = useMessages();
  return (
    <div className="page">
      <title>{`${t.notFoundTitle} · Theonetrust.in`}</title>
      <meta name="robots" content="noindex" />
      <h1>{t.notFoundTitle}</h1>
      <p>{t.notFoundBody}</p>
      <Link to={homePath(lang)}>{t.goHome}</Link>
    </div>
  );
}
