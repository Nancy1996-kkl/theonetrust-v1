import { StateBlock } from '../components/ui/StateBlock.tsx';
import { useAdmin } from './admin-context.ts';

/** Placeholder overview: real figures arrive with #31 — nothing is invented here. */
export function AdminHomePage() {
  const { t } = useAdmin();
  return (
    <div className="admin-page">
      <h1>{t.overviewTitle}</h1>
      <StateBlock state="empty" title={t.overviewEmptyTitle} headingLevel={2}>
        {t.overviewEmpty}
      </StateBlock>
    </div>
  );
}
