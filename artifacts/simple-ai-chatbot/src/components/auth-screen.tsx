import { FormEvent, useState } from 'react';
import { ArrowRight, CircleAlert, LockKeyhole } from 'lucide-react';
import { useSupabaseAuth } from '@/auth/supabase-auth';

function BrandMark() {
  return (
    <div className="brand-mark auth-brand-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

export function AuthScreen() {
  const { client, error: initializationError } = useSupabaseAuth();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!client || pending) return;

    setPending(true);
    setError('');
    setNotice('');

    try {
      if (mode === 'sign-up') {
        const redirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).toString();
        const { data, error: signUpError } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: redirectTo },
        });

        if (signUpError) throw signUpError;
        if (!data.session) {
          setNotice('Check your email for a confirmation link, then come back to sign in.');
        }
      } else {
        const { error: signInError } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Sign-in failed. Please try again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand">
          <BrandMark />
          <span className="brand-name">morrow</span>
        </div>

        <div className="auth-intro">
          <span className="auth-eyebrow"><LockKeyhole size={12} /> YOUR PRIVATE SPACE</span>
          <h1 id="auth-title">
            {client ? (mode === 'sign-in' ? 'Welcome back.' : 'A little room, just for you.') : 'Connect your space.'}
          </h1>
          <p>
            {client
              ? 'Sign in to keep your conversations saved and private.'
              : 'Supabase is needed to sign in and save conversations.'}
          </p>
        </div>

        {!client ? (
          <div className="auth-message auth-error" role="alert">
            <CircleAlert size={16} />
            <span>{initializationError ?? 'Supabase is not configured for this app.'}</span>
          </div>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              disabled={pending}
            />

            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              required
              minLength={mode === 'sign-up' ? 8 : undefined}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={mode === 'sign-up' ? 'At least 8 characters' : 'Your password'}
              disabled={pending}
            />

            {error && (
              <div className="auth-message auth-error" role="alert">
                <CircleAlert size={16} />
                <span>{error}</span>
              </div>
            )}
            {notice && <p className="auth-message auth-notice" role="status">{notice}</p>}

            <button className="auth-submit" type="submit" disabled={pending}>
              <span>
                {pending
                  ? 'One moment…'
                  : mode === 'sign-in'
                    ? 'Sign in'
                    : 'Create account'}
              </span>
              {!pending && <ArrowRight size={16} />}
            </button>
          </form>
        )}

        {client && (
          <p className="auth-switch">
            {mode === 'sign-in' ? 'New to Morrow?' : 'Already have an account?'}{' '}
            <button
              type="button"
              onClick={() => {
                setMode((current) => current === 'sign-in' ? 'sign-up' : 'sign-in');
                setError('');
                setNotice('');
              }}
              disabled={pending}
            >
              {mode === 'sign-in' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        )}
      </section>
    </main>
  );
}
