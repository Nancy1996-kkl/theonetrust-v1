/** Shared UI primitives (issue #10). Usage notes: docs/design/components.md. */
export { AmountPicker, type AmountPickerProps } from './AmountPicker.tsx';
export { parseRupees, type AmountParse } from './amount.ts';
export { Button, type ButtonProps, type ButtonVariant } from './Button.tsx';
export { BentoGrid, BentoTile, Card, type BentoTileProps, type CardProps } from './Card.tsx';
export { Checkbox, type CheckboxProps } from './Checkbox.tsx';
export { DataTable, type Column, type DataTableProps } from './DataTable.tsx';
export { Dialog, type DialogProps } from './Dialog.tsx';
export { StatusIcon, Spinner, type StatusTone } from './icons.tsx';
export { LanguageSwitch, type LanguageSwitchProps } from './LanguageSwitch.tsx';
export {
  RadioCardGroup,
  type RadioCardGroupProps,
  type RadioCardOption,
} from './RadioCardGroup.tsx';
export { SelectField, type SelectFieldProps, type SelectOption } from './SelectField.tsx';
export { StateBlock, type BlockState, type StateBlockProps } from './StateBlock.tsx';
export { StatusPill, type StatusPillProps } from './StatusPill.tsx';
export { Stepper, type StepperProps } from './Stepper.tsx';
export { TextField, type TextFieldProps } from './TextField.tsx';
export { TextLink, type TextLinkProps } from './TextLink.tsx';
export { LiveRegion, ToastProvider, type LiveRegionProps } from './Toast.tsx';
export { DEFAULT_TOAST_MS, useToast, type ToastInput, type ToastTone } from './toast-context.ts';
export {
  LANGUAGE_NAMES,
  UI_STRINGS,
  UiLangContext,
  useUiStrings,
  type UiLang,
  type UiStrings,
} from './ui-strings.ts';
