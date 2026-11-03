import { LANGUAGE_NAMES, useUiStrings, type UiLang } from './ui-strings.ts';

export interface LanguageSwitchProps {
  current: UiLang;
  /** Called with the other language. The app shell (#11) maps it to the /ta/ route and keeps state. */
  onChange: (lang: UiLang) => void;
  className?: string;
}

/**
 * Two-option language toggle. Buttons with aria-pressed (not colour) show the current
 * language; pressing the current one does nothing.
 */
export function LanguageSwitch({ current, onChange, className }: LanguageSwitchProps) {
  const strings = useUiStrings();
  return (
    <div
      role="group"
      aria-label={strings.languageSwitch}
      className={['ui-lang', className].filter(Boolean).join(' ')}
    >
      {(Object.keys(LANGUAGE_NAMES) as UiLang[]).map((lang) => {
        const active = lang === current;
        return (
          <button
            key={lang}
            type="button"
            lang={lang}
            className="ui-lang__option"
            aria-pressed={active}
            onClick={() => {
              if (!active) onChange(lang);
            }}
          >
            {LANGUAGE_NAMES[lang]}
          </button>
        );
      })}
    </div>
  );
}
