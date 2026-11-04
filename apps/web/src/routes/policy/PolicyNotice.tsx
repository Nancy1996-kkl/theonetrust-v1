import { Link } from 'react-router';
import { POLICIES, POLICY_UI } from '../../content/policies.ts';
import { localizedPath } from '../../i18n/lang.ts';
import { useLang } from '../../i18n/use-lang.ts';

/**
 * "By continuing you agree to our Terms and Privacy policy · Refund policy" — placed under every
 * donation and help-request form (issue #14). #15 (Get Help) and #24 (Donate panel) reuse it.
 */
export function PolicyNotice({ refund = true }: { refund?: boolean }) {
  const lang = useLang();
  const link = (id: keyof typeof POLICIES) => (
    <Link to={localizedPath(POLICIES[id].path, lang)}>{POLICIES[id].title[lang]}</Link>
  );
  return (
    <p className="policy-notice">
      {POLICY_UI.formNotice[lang]} {link('terms')} {POLICY_UI.and[lang]} {link('privacy')}
      {refund && (
        <>
          {' · '}
          {link('refund')}
        </>
      )}
    </p>
  );
}
