import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { UiLangContext, type UiLang } from '../components/ui/ui-strings.ts';

/** Renders a primitive inside a router and a language context, wrapped in lang="…". */
export function renderUi(ui: ReactElement, lang: UiLang = 'en'): RenderResult {
  return render(
    <MemoryRouter>
      <UiLangContext.Provider value={lang}>
        <div lang={lang}>{ui}</div>
      </UiLangContext.Provider>
    </MemoryRouter>,
  );
}
