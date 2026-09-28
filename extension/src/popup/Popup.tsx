import { useEffect, useState, type FormEvent } from 'react';
import { sendMessage } from '../api/client';
import type { AuthStatus } from '../types/messages';

function Popup() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void sendMessage<AuthStatus>({ type: 'AUTH_STATUS' }).then((response) => {
      if (!active) return;
      setStatus(response.ok ? response.data : { loggedIn: false });
    });
    return () => {
      active = false;
    };
  }, []);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const response = await sendMessage<AuthStatus>({ type: 'AUTH_LOGIN', email, password });
    if (response.ok) {
      setStatus(response.data);
      setPassword('');
    } else {
      setError(response.error);
    }
    setBusy(false);
  };

  const handleLogout = async () => {
    await sendMessage<AuthStatus>({ type: 'AUTH_LOGOUT' });
    setStatus({ loggedIn: false });
  };

  if (!status) {
    return <main className="popup"><p className="muted">Loading…</p></main>;
  }

  if (status.loggedIn) {
    return (
      <main className="popup">
        <h1>Ensearch</h1>
        <p className="badge">Signed in</p>
        <p className="row"><span className="muted">Organization</span> {status.orgName || '—'}</p>
        <p className="row"><span className="muted">User</span> {status.email}</p>
        <p className="hint">
          On a Zoho Books invoice, type in an item field or press <kbd>Ctrl</kbd>+<kbd>K</kbd> to search.
        </p>
        <button type="button" className="secondary" onClick={handleLogout}>Sign out</button>
      </main>
    );
  }

  return (
    <main className="popup">
      <h1>Ensearch</h1>
      <form onSubmit={handleLogin}>
        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  );
}

export default Popup;
