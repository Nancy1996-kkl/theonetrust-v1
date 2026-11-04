import { randomBytes } from 'node:crypto';

/** Same alphabet the web form expects (HELP_REFERENCE_PATTERN): no I or O. */
const ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function newHelpReference(bytes: (n: number) => Buffer = randomBytes): string {
  let code = '';
  // Rejection sampling: 34 symbols, accept bytes below 238 (= 7 × 34) for an even spread.
  while (code.length < 6) {
    for (const byte of bytes(12)) {
      if (byte < 238 && code.length < 6) code += ALPHABET[byte % ALPHABET.length];
    }
  }
  return `HLP-${code}`;
}
