import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import type { AdminSessionStage, MfaSetupResponse } from '@theonetrust/contracts';
import { Button } from '../components/ui/Button.tsx';
import { Checkbox } from '../components/ui/Checkbox.tsx';
import { StateBlock } from '../components/ui/StateBlock.tsx';
import { TextField } from '../components/ui/TextField.tsx';
import { errorText, groupKey, useAdmin } from './admin-context.ts';
import { AdminApiError } from './api.ts';

type Step = 'password' | 'setup' | 'verify' | 'recovery-codes';

function resumeStep(stage: AdminSessionStage | undefined): Step | null {
  if (stage === 'MFA_SETUP') return 'setup';
  if (stage === 'MFA_VERIFY') return 'verify';
  if (stage === 'SIGNED_OUT') return 'password';
  return null;
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="admin-form__error" role="alert">
      {message}
    </p>
  );
}

/**
 * `/admin/login`: password → authenticator code. On the first sign-in the owner must enrol an
 * authenticator app and save recovery codes before reaching the dashboard (no way to skip).
 */
export function AdminLoginPage() {
  const { api, t, session, setSession } = useAdmin();
  const navigate = useNavigate();
  const [chosenStep, setStep] = useState<Step | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [setup, setSetup] = useState<MfaSetupResponse | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Until the owner acts, resume where the server says this browser is.
  const step: Step | null = chosenStep ?? resumeStep(session?.stage);

  // Fetch the setup key once when the setup step opens.
  useEffect(() => {
    if (step !== 'setup' || setup) return;
    let cancelled = false;
    api
      .mfaSetup()
      .then((s) => !cancelled && setSetup(s))
      .catch((e: unknown) => !cancelled && fail(e));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fail is stable in behaviour
  }, [step, setup, api]);

  // Move focus to the new heading on every step change (screen readers hear where they are).
  useEffect(() => {
    if (step && step !== 'password') headingRef.current?.focus();
  }, [step]);

  function fail(e: unknown) {
    const err = e instanceof AdminApiError ? e : new AdminApiError('INTERNAL_ERROR');
    setError(errorText(t, err));
    if (['UNAUTHORIZED', 'CONFLICT', 'MFA_REQUIRED'].includes(err.code)) {
      // The half-signed-in session ended (expired or locked): start again from the password.
      setSession({ stage: 'SIGNED_OUT' });
      setStep('password');
      setSetup(null);
      setCode('');
    }
  }

  async function run(action: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  function onPassword(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setFieldError(t.errorRequired);
      return;
    }
    setFieldError(null);
    void run(async () => {
      const next = await api.login(email.trim(), password);
      setPassword('');
      setSession(next);
      setStep(next.stage === 'MFA_SETUP' ? 'setup' : 'verify');
    });
  }

  function codeIsValid(value: string): boolean {
    const ok = useRecovery ? value.trim().length >= 10 : /^\d{6}$/.test(value.trim());
    setFieldError(ok ? null : useRecovery ? t.errorRequired : t.errorCodeFormat);
    return ok;
  }

  function onEnable(event: FormEvent) {
    event.preventDefault();
    if (!codeIsValid(code)) return;
    void run(async () => {
      const result = await api.mfaEnable(code.trim());
      setCode('');
      setRecoveryCodes(result.recoveryCodes);
      setSession({ stage: result.stage, ...(result.user && { user: result.user }) });
      setStep('recovery-codes');
    });
  }

  function onVerify(event: FormEvent) {
    event.preventDefault();
    if (!codeIsValid(code)) return;
    void run(async () => {
      const next = await api.mfaVerify(code.trim());
      setSession(next);
      navigate('/admin', { replace: true });
    });
  }

  if (session?.stage === 'ACTIVE' && step !== 'recovery-codes') {
    return <Navigate to="/admin" replace />;
  }
  if (step === null) return <StateBlock state="loading" title={t.loading} headingLevel={2} />;

  return (
    <div className="admin-login">
      {step === 'password' && (
        <form className="admin-form" onSubmit={onPassword} noValidate>
          <h1>{t.signInTitle}</h1>
          <p>{t.signInIntro}</p>
          <FormError message={error} />
          <TextField
            label={t.email}
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldError && !email.trim() ? fieldError : undefined}
          />
          <TextField
            label={t.password}
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldError && !password ? fieldError : undefined}
          />
          <Button type="submit" loading={busy} loadingLabel={t.signingIn} fullWidth>
            {t.signIn}
          </Button>
        </form>
      )}

      {step === 'setup' && (
        <form className="admin-form" onSubmit={onEnable} noValidate>
          <h1 ref={headingRef} tabIndex={-1}>
            {t.setupTitle}
          </h1>
          <p>{t.setupIntro}</p>
          <FormError message={error} />
          <ol className="admin-steps">
            <li>{t.setupStep1}</li>
            <li>
              {t.setupStep2}
              {setup ? (
                <>
                  <code className="admin-key" aria-label={t.setupKeyLabel}>
                    {groupKey(setup.secret)}
                  </code>
                  <a href={setup.otpauthUri}>{t.setupOpenApp}</a>
                </>
              ) : (
                <StateBlock state="loading" title={t.loading} headingLevel={2} />
              )}
            </li>
            <li>{t.setupStep3}</li>
          </ol>
          <TextField
            label={t.code}
            hint={t.codeHint}
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            error={fieldError ?? undefined}
          />
          <Button type="submit" loading={busy} loadingLabel={t.checking} fullWidth>
            {t.continue}
          </Button>
        </form>
      )}

      {step === 'verify' && (
        <form className="admin-form" onSubmit={onVerify} noValidate>
          <h1 ref={headingRef} tabIndex={-1}>
            {t.verifyTitle}
          </h1>
          <p>{t.verifyIntro}</p>
          <FormError message={error} />
          <TextField
            key={useRecovery ? 'recovery' : 'totp'}
            label={useRecovery ? t.recoveryCode : t.code}
            hint={useRecovery ? t.recoveryHint : t.codeHint}
            name="code"
            {...(useRecovery
              ? { autoComplete: 'off', maxLength: 11 }
              : { inputMode: 'numeric' as const, autoComplete: 'one-time-code', maxLength: 6 })}
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            error={fieldError ?? undefined}
          />
          <Button type="submit" loading={busy} loadingLabel={t.checking} fullWidth>
            {t.continue}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setUseRecovery((v) => !v);
              setCode('');
              setFieldError(null);
            }}
          >
            {useRecovery ? t.useApp : t.useRecovery}
          </Button>
        </form>
      )}

      {step === 'recovery-codes' && (
        <div className="admin-form">
          <h1 ref={headingRef} tabIndex={-1}>
            {t.recoveryTitle}
          </h1>
          <p>{t.recoveryIntro}</p>
          <ul className="admin-codes" aria-label={t.recoveryListLabel}>
            {recoveryCodes.map((c) => (
              <li key={c}>
                <code>{c}</code>
              </li>
            ))}
          </ul>
          <Checkbox
            label={t.recoverySaved}
            checked={saved}
            onChange={(e) => setSaved(e.target.checked)}
            error={fieldError ?? undefined}
          />
          <Button
            fullWidth
            onClick={() => {
              if (!saved) {
                setFieldError(t.errorRequired);
                return;
              }
              navigate('/admin', { replace: true });
            }}
          >
            {t.goToDashboard}
          </Button>
        </div>
      )}
    </div>
  );
}
