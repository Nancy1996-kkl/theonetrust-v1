import type { CookieSerializeOptions } from '@fastify/cookie';
import type { AuthKeys } from '../../security/crypto.ts';
import { hmacBase64Url } from '../../security/crypto.ts';

/**
 * `__Host-` prefix in production: the browser only accepts it with Secure, Path=/ and no Domain,
 * so no subdomain can set or overwrite it. Plain name on http://localhost for development.
 */
export function sessionCookieName(production: boolean): string {
  return production ? '__Host-tot_admin' : 'tot_admin';
}

export function sessionCookieOptions(
  production: boolean,
  maxAgeSeconds: number,
): CookieSerializeOptions {
  return {
    httpOnly: true,
    secure: production,
    sameSite: 'strict',
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

/** CSRF token bound to the session token: no storage, cannot be reused for another session. */
export function csrfTokenFor(keys: AuthKeys, sessionToken: string): string {
  return hmacBase64Url(keys.csrf, `csrf:${sessionToken}`);
}
