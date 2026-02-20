import React, { useEffect, useMemo, useState } from 'react';
import App from './App';
import { CLIENTS } from './constants/clients';
import { fetchAccessProfile, subscribeClientOverview, syncClientOverviews } from './services/cloudPortfolio';
import { auth } from './services/firebaseApp';
import { initializePortfolioStore, usePortfolioStore } from './store/portfolio';

const ADMIN_EMAILS = new Set(['jibiza90@gmail.com']);

type Role = 'admin' | 'client';

interface SessionState {
  loading: boolean;
  role: Role | null;
  clientId: string | null;
  email: string | null;
  error: string | null;
}

interface ClientOverview {
  clientId: string;
  clientName: string;
  currentBalance: number;
  cumulativeProfit: number;
  ytdReturnPct: number;
  updatedAt: number;
  rows: Array<{
    iso: string;
    increment: number | null;
    decrement: number | null;
    finalBalance: number | null;
    profit: number | null;
    cumulativeProfit: number | null;
  }>;
}

const formatEuro = (value: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(value);

const formatPct = (value: number) => `${(value * 100).toFixed(2)}%`;

const LoginCard = ({ onLogin, busy, error }: { onLogin: (email: string, password: string) => Promise<void>; busy: boolean; error: string | null }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <section style={{ width: '100%', maxWidth: 420, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 20, background: 'rgba(11,14,22,0.95)' }}>
        <h1 style={{ marginTop: 0, marginBottom: 8 }}>Portfolio Manager</h1>
        <p style={{ marginTop: 0, opacity: 0.8 }}>Accede con tu cuenta para ver tus datos.</p>
        <div style={{ display: 'grid', gap: 10 }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            style={{ padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.16)', background: '#0f1320', color: '#fff' }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            style={{ padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.16)', background: '#0f1320', color: '#fff' }}
          />
          <button
            type="button"
            onClick={() => {
              void onLogin(email, password);
            }}
            disabled={busy || !email.trim() || !password}
            style={{ padding: 11, borderRadius: 9, border: 0, fontWeight: 600, background: '#28a4ff', color: '#041220', cursor: 'pointer' }}
          >
            {busy ? 'Entrando...' : 'Entrar'}
          </button>
          {error ? <p style={{ margin: 0, color: '#ff8a8a' }}>{error}</p> : null}
        </div>
      </section>
    </main>
  );
};

const ClientPortal = ({ clientId, email, onLogout }: { clientId: string; email: string | null; onLogout: () => Promise<void> }) => {
  const [overview, setOverview] = useState<ClientOverview | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeClientOverview(
      clientId,
      (value) => {
        setOverview(value as ClientOverview | null);
        setLoaded(true);
        setError(null);
      },
      () => {
        setLoaded(true);
        setError('No se pudo cargar tu resumen.');
      }
    );
    return () => unsubscribe();
  }, [clientId]);

  const clientName = useMemo(() => overview?.clientName ?? CLIENTS.find((client) => client.id === clientId)?.name ?? clientId, [clientId, overview]);

  return (
    <main style={{ minHeight: '100vh', padding: '24px 16px', maxWidth: 980, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0 }}>Area Cliente</h1>
          <p style={{ margin: '6px 0 0 0', opacity: 0.75 }}>{clientName} · {clientId}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, opacity: 0.75 }}>{email ?? ''}</span>
          <button type="button" onClick={() => { void onLogout(); }} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#fff' }}>
            Salir
          </button>
        </div>
      </header>

      {error ? <p style={{ color: '#ff8a8a' }}>{error}</p> : null}
      {!loaded ? <p style={{ opacity: 0.7 }}>Cargando tu resumen...</p> : null}
      {loaded && !overview ? (
        <p style={{ opacity: 0.8 }}>
          Aun no hay resumen publicado para tu cuenta. El administrador debe sincronizar tus datos.
        </p>
      ) : null}

      {overview ? (
        <>
          <section style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', marginBottom: 18 }}>
            <article style={{ padding: 14, borderRadius: 12, border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(14,19,31,0.9)' }}>
              <p style={{ margin: 0, opacity: 0.75 }}>Saldo actual</p>
              <h3 style={{ margin: '8px 0 0 0' }}>{formatEuro(overview.currentBalance)}</h3>
            </article>
            <article style={{ padding: 14, borderRadius: 12, border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(14,19,31,0.9)' }}>
              <p style={{ margin: 0, opacity: 0.75 }}>Beneficio acumulado</p>
              <h3 style={{ margin: '8px 0 0 0' }}>{formatEuro(overview.cumulativeProfit)}</h3>
            </article>
            <article style={{ padding: 14, borderRadius: 12, border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(14,19,31,0.9)' }}>
              <p style={{ margin: 0, opacity: 0.75 }}>Rentabilidad YTD</p>
              <h3 style={{ margin: '8px 0 0 0' }}>{formatPct(overview.ytdReturnPct ?? 0)}</h3>
            </article>
            <article style={{ padding: 14, borderRadius: 12, border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(14,19,31,0.9)' }}>
              <p style={{ margin: 0, opacity: 0.75 }}>Actualizado</p>
              <h3 style={{ margin: '8px 0 0 0', fontSize: 16 }}>{new Date(overview.updatedAt).toLocaleString('es-ES')}</h3>
            </article>
          </section>

          <section style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(14,19,31,0.9)', overflow: 'hidden' }}>
            <div style={{ padding: 14, borderBottom: '1px solid rgba(255,255,255,0.09)' }}>
              <strong>Ultimos movimientos</strong>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: 12 }}>Fecha</th>
                    <th style={{ textAlign: 'right', padding: 12 }}>Ingreso</th>
                    <th style={{ textAlign: 'right', padding: 12 }}>Retiro</th>
                    <th style={{ textAlign: 'right', padding: 12 }}>Saldo</th>
                    <th style={{ textAlign: 'right', padding: 12 }}>Beneficio día</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: 12, opacity: 0.7 }}>Sin movimientos recientes.</td>
                    </tr>
                  ) : (
                    overview.rows
                      .slice()
                      .reverse()
                      .map((row) => (
                        <tr key={row.iso}>
                          <td style={{ padding: 12 }}>{new Date(row.iso).toLocaleDateString('es-ES')}</td>
                          <td style={{ padding: 12, textAlign: 'right' }}>{row.increment ? formatEuro(row.increment) : '—'}</td>
                          <td style={{ padding: 12, textAlign: 'right' }}>{row.decrement ? formatEuro(row.decrement) : '—'}</td>
                          <td style={{ padding: 12, textAlign: 'right' }}>{row.finalBalance !== null ? formatEuro(row.finalBalance) : '—'}</td>
                          <td style={{ padding: 12, textAlign: 'right' }}>{row.profit !== null ? formatEuro(row.profit) : '—'}</td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
};

const AuthShell = () => {
  const [session, setSession] = useState<SessionState>({
    loading: true,
    role: null,
    clientId: null,
    email: null,
    error: null
  });
  const [loginBusy, setLoginBusy] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        usePortfolioStore.setState({ canWrite: false, initialized: false });
        setSession({ loading: false, role: null, clientId: null, email: null, error: null });
        return;
      }

      try {
        const email = (user.email ?? '').toLowerCase();
        const isAdmin = ADMIN_EMAILS.has(email);

        if (isAdmin) {
          usePortfolioStore.getState().setWriteAccess(true);
          await initializePortfolioStore();
          await syncClientOverviews(usePortfolioStore.getState().snapshot, CLIENTS);
          setSession({ loading: false, role: 'admin', clientId: null, email: user.email, error: null });
          return;
        }

        const profile = await fetchAccessProfile(user.uid);
        if (!profile || profile.active === false || profile.role !== 'client' || !profile.clientId) {
          await auth.signOut();
          setSession({ loading: false, role: null, clientId: null, email: null, error: 'Tu usuario no tiene perfil activo. Contacta con el administrador.' });
          return;
        }

        usePortfolioStore.getState().setWriteAccess(false);
        usePortfolioStore.getState().setInitialized(true);
        setSession({ loading: false, role: 'client', clientId: profile.clientId, email: user.email, error: null });
      } catch (error) {
        console.error(error);
        setSession({ loading: false, role: null, clientId: null, email: null, error: 'Error validando tu sesión.' });
      }
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async (email: string, password: string) => {
    try {
      setLoginBusy(true);
      setSession((prev) => ({ ...prev, error: null }));
      await auth.signInWithEmailAndPassword(email.trim(), password);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo iniciar sesión';
      setSession((prev) => ({ ...prev, error: message }));
    } finally {
      setLoginBusy(false);
    }
  };

  const handleLogout = async () => {
    await auth.signOut();
  };

  if (session.loading) {
    return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>Cargando sesión...</main>;
  }

  if (!session.role) {
    return <LoginCard onLogin={handleLogin} busy={loginBusy} error={session.error} />;
  }

  if (session.role === 'client' && session.clientId) {
    return <ClientPortal clientId={session.clientId} email={session.email} onLogout={handleLogout} />;
  }

  return (
    <>
      <div style={{ position: 'fixed', top: 10, right: 12, zIndex: 9999, display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(2,8,18,0.85)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 999, padding: '6px 10px' }}>
        <span style={{ fontSize: 12, opacity: 0.75 }}>{session.email}</span>
        <button type="button" onClick={() => { void handleLogout(); }} style={{ border: 0, borderRadius: 999, padding: '6px 10px', background: '#2d8cff', color: '#031120', fontWeight: 600 }}>
          Salir
        </button>
      </div>
      <App />
    </>
  );
};

export default AuthShell;
