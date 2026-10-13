import { useState } from 'react';
import { useSeo } from '../lib/seo';
import { useI18n } from '../i18n';
import { useAuth } from '../lib/auth';

type Step = 'email' | 'code';

export default function Account() {
  const { t, prefix, lang } = useI18n();
  const { ready, user, configured, signInWithOtp, verifyOtp, signOut } = useAuth();

  useSeo({
    title: t.account.title,
    canonicalPath: `${prefix}/account`,
    noindex: true, // アカウントページは検索対象外
    lang,
  });

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailLooksValid) { setError(t.account.invalidEmail); return; }
    setBusy(true);
    setError('');
    try {
      await signInWithOtp(email.trim());
      setStep('code');
    } catch {
      setError(t.account.errorSend);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await verifyOtp(email.trim(), code.trim());
      // 成功すると onAuthStateChange 経由で user が入り、下のログイン済みビューへ切り替わる
    } catch {
      setError(t.account.errorVerify);
    } finally {
      setBusy(false);
    }
  };

  const backToEmail = () => {
    setStep('email');
    setCode('');
    setError('');
  };

  return (
    <div className="container account">
      <h1>{t.account.heading}</h1>

      {/* Supabase 未設定：導線は出さず、端末内保存である旨だけ伝える */}
      {!configured && <p className="account__note">{t.account.unavailable}</p>}

      {configured && !ready && <p className="account__note">…</p>}

      {configured && ready && user && (
        <div className="account__signed-in">
          <p className="account__whoami">{t.account.signedInAs(user.email ?? '')}</p>
          <p className="account__note account__note--ok">{t.account.syncedNote}</p>
          <button type="button" className="btn btn--secondary" onClick={() => void signOut()}>
            {t.account.signOut}
          </button>
          <p className="account__note">{t.account.signedOutNote}</p>
        </div>
      )}

      {configured && ready && !user && (
        <div className="account__form">
          <p className="account__intro">{t.account.intro}</p>

          {step === 'email' && (
            <form onSubmit={sendCode}>
              <label className="account__label" htmlFor="account-email">{t.account.emailLabel}</label>
              <input
                id="account-email"
                className="account__input"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                placeholder={t.account.emailPlaceholder}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />
              <button type="submit" className="btn btn--primary account__submit" disabled={busy}>
                {busy ? t.account.sending : t.account.sendCode}
              </button>
            </form>
          )}

          {step === 'code' && (
            <form onSubmit={verify}>
              <p className="account__sent">{t.account.codeSent(email.trim())}</p>
              <label className="account__label" htmlFor="account-code">{t.account.codeLabel}</label>
              <input
                id="account-code"
                className="account__input account__input--code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                placeholder={t.account.codePlaceholder}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                disabled={busy}
                autoFocus
              />
              <button type="submit" className="btn btn--primary account__submit" disabled={busy || code.length < 6}>
                {busy ? t.account.verifying : t.account.verify}
              </button>
              <button type="button" className="account__back" onClick={backToEmail} disabled={busy}>
                {t.account.back}
              </button>
            </form>
          )}

          {error && <p className="account__error" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
