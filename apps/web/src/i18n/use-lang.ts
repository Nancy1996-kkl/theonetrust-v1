import { useContext } from 'react';
import { UiLangContext, type UiLang } from '../components/ui/ui-strings.ts';
import { MESSAGES, type Messages } from './messages.ts';

/** Current page language (provided by the shell from the URL). */
export function useLang(): UiLang {
  return useContext(UiLangContext);
}

/** Interface text in the current language. */
export function useMessages(): Messages {
  return MESSAGES[useLang()];
}
