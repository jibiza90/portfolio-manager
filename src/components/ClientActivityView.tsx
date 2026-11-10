import React, { useEffect, useMemo, useState } from 'react';
import {
  fetchClientActivitySnapshot,
  fetchClientAnalyticsConsent,
  type ClientActivityEvent,
  type ClientActivitySnapshot,
  type ClientAnalyticsConsent
} from '../services/clientAnalytics';
import type { AccessProfileRecord } from '../services/cloudPortfolio';
import type { LoginEvent, ReportDownloadEvent } from '../services/loginTracker';

type ActivityPeriod = '7' | '30' | '90' | 'all';

interface ClientOption {
  id: string;
  label: string;
}

interface ClientActivityViewProps {
  clients: ClientOption[];
  accessProfiles: AccessProfileRecord[];
  downloadEvents: ReportDownloadEvent[];
  loginEvents: LoginEvent[];
}

const EMPTY_SNAPSHOT: ClientActivitySnapshot = { sessions: [], events: [], devices: [] };

const formatDateTime = (value: number) => value
  ? new Date(value).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'medium' })
  : 'Sin datos';

// "hoy", "ayer", "hace 5 días"...
const formatAgo = (value: number) => {
  const days = Math.floor((Date.now() - value) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  return `Hace ${days} días`;
};

const formatDuration = (value: number) => {
  const seconds = Math.max(0, Math.round(value / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return remainingSeconds ? `${minutes} min ${remainingSeconds} s` : `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours} h ${remainingMinutes} min` : `${hours} h`;
};

const chartLabels: Record<string, string> = {
  balance: 'Evolución del patrimonio',
  return: 'Rentabilidad mensual',
  profit: 'Beneficio mensual',
  general: 'Rentabilidad general'
};

const eventLabels: Record<string, string> = {
  chart_change: 'Cambio de gráfico',
  chart_expand: 'Gráfico ampliado',
  chart_expand_request: 'Solicitud de ampliación',
  chart_expanded_duration: 'Tiempo con gráfico ampliado',
  chart_duration: 'Tiempo en gráfico',
  chart_point_view: 'Punto del gráfico consultado',
  detail_expand: 'Detalle mensual abierto',
  detail_collapse: 'Detalle mensual cerrado',
  expanded_period_change: 'Periodo del gráfico ampliado',
  expanded_period_reset: 'Periodo ampliado restablecido',
  failed_login_attempts: 'Intentos de acceso fallidos detectados',
  legal_notice_acknowledged: 'Aviso de privacidad y cookies confirmado',
  login_success: 'Inicio de sesión correcto',
  period_change: 'Cambio de periodo',
  period_custom_change: 'Periodo personalizado',
  privacy_choice: 'Preferencia de privacidad',
  report_download: 'Informe descargado',
  report_download_request: 'Descarga de informe solicitada',
  section_duration: 'Tiempo en sección',
  support_close: 'Mensajes cerrados',
  support_message: 'Mensaje enviado',
  support_open: 'Mensajes abiertos',
  annual_returns_download: 'Informe fiscal descargado',
  benefits_period: 'Periodo de beneficios mensuales',
  closing_year: 'Año elegido en los cierres',
  contribution_journey_filter: 'Filtro de aportaciones',
  contribution_journey_select: 'Aportación consultada',
  fiscal_open: 'Información fiscal abierta',
  movement_receipt_download: 'Justificante descargado',
  movement_receipt_open: 'Justificante abierto',
  movements_period: 'Periodo de aportaciones y retiradas',
  movements_type: 'Tipo de movimiento elegido',
  news_tour: 'Novedades',
  patrimony_trend_hover: 'Mes consultado en el gráfico de patrimonio',
  text_size: 'Tamaño de letra',
  total_return_notice: 'Aviso de la rentabilidad total leído'
};

const readableEventLabel = (event: ClientActivityEvent) => {
  const base = eventLabels[event.type] ?? event.type.replace(/_/g, ' ');
  const detail = chartLabels[event.label] ?? event.label;
  return detail ? `${base}: ${detail}` : base;
};

const ACTIVE_MEASUREMENT_VERSION = 'active-v2';
const measuredDurationTypes = new Set(['section_duration', 'chart_duration', 'chart_expanded_duration']);
const isCurrentDurationMeasurement = (event: ClientActivityEvent) => (
  !measuredDurationTypes.has(event.type) || event.metadata.measurementVersion === ACTIVE_MEASUREMENT_VERSION
);

const sumByLabel = (events: ClientActivityEvent[], type: string) => {
  const totals = new Map<string, number>();
  events.filter((event) => event.type === type && isCurrentDurationMeasurement(event)).forEach((event) => {
    const label = chartLabels[event.label] ?? event.label;
    totals.set(label, (totals.get(label) ?? 0) + event.durationMs);
  });
  return [...totals.entries()]
    .map(([label, durationMs]) => ({ label, durationMs }))
    .sort((left, right) => right.durationMs - left.durationMs);
};

export function ClientActivityView({ clients, accessProfiles, downloadEvents, loginEvents }: ClientActivityViewProps) {
  const [selectedClientId, setSelectedClientId] = useState('');
  const [period, setPeriod] = useState<ActivityPeriod>('30');
  const [snapshot, setSnapshot] = useState<ClientActivitySnapshot>(EMPTY_SNAPSHOT);
  const [consent, setConsent] = useState<ClientAnalyticsConsent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ultima vez que entro cada cliente: el acceso mas reciente de cualquiera de sus usuarios.
  const lastLoginByClient = useMemo(() => {
    const clientByUid = new Map(accessProfiles.map((profile) => [profile.uid, profile.clientId]));
    const result = new Map<string, number>();
    loginEvents.forEach((event) => {
      const clientId = clientByUid.get(event.uid);
      if (!clientId) return;
      const at = event.loginAt || event.createdAt;
      if (at > (result.get(clientId) ?? 0)) result.set(clientId, at);
    });
    return result;
  }, [accessProfiles, loginEvents]);
  const lastAccessList = useMemo(
    () => clients
      .filter((client) => accessProfiles.some((profile) => profile.clientId === client.id))
      .map((client) => ({ ...client, lastLogin: lastLoginByClient.get(client.id) ?? 0 }))
      .sort((left, right) => right.lastLogin - left.lastLogin),
    [accessProfiles, clients, lastLoginByClient]
  );

  const selectedProfile = useMemo(
    () => accessProfiles.find((profile) => profile.clientId === selectedClientId && profile.active !== false) ?? null,
    [accessProfiles, selectedClientId]
  );

  const loadActivity = async (silent = false) => {
    if (!selectedClientId) {
      setSnapshot(EMPTY_SNAPSHOT);
      setConsent(null);
      return;
    }
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [nextSnapshot, nextConsent] = await Promise.all([
        fetchClientActivitySnapshot(selectedClientId),
        selectedProfile?.uid ? fetchClientAnalyticsConsent(selectedProfile.uid) : Promise.resolve(null)
      ]);
      setSnapshot(nextSnapshot);
      setConsent(nextConsent);
    } catch (loadError) {
      console.error('No se pudo cargar la actividad del cliente', loadError);
      setError('No se pudo cargar la actividad de este cliente. Revisa la conexión y vuelve a intentarlo.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void loadActivity();
    if (!selectedClientId) return undefined;
    const timer = window.setInterval(() => { void loadActivity(true); }, 60_000);
    return () => window.clearInterval(timer);
  }, [selectedClientId, selectedProfile?.uid]);

  const since = period === 'all' ? 0 : Date.now() - Number(period) * 24 * 60 * 60 * 1000;
  const sessions = useMemo(
    () => snapshot.sessions.filter((session) => session.startedAt >= since),
    [since, snapshot.sessions]
  );
  const events = useMemo(
    () => snapshot.events.filter((event) => event.occurredAt >= since),
    [since, snapshot.events]
  );
  const downloads = useMemo(
    () => downloadEvents
      .filter((event) => event.clientId === selectedClientId && event.downloadedAt >= since)
      .sort((left, right) => right.downloadedAt - left.downloadedAt),
    [downloadEvents, selectedClientId, since]
  );
  const sectionDurations = useMemo(() => sumByLabel(events, 'section_duration'), [events]);
  const chartDurations = useMemo(() => sumByLabel(events, 'chart_duration'), [events]);
  const usageEvents = useMemo(() => events.filter((event) => event.category === 'usage'), [events]);
  const securityEvents = useMemo(() => events.filter((event) => event.category === 'security'), [events]);
  const totalSessionDuration = useMemo(
    () => sessions.reduce((total, session) => {
      const end = session.endedAt ?? Math.min(Date.now(), session.lastSeenAt + 60_000);
      return total + Math.max(0, end - session.startedAt);
    }, 0),
    [sessions]
  );
  const activeSessions = useMemo(
    () => snapshot.sessions.filter((session) => !session.endedAt && session.lastSeenAt >= Date.now() - 135_000),
    [snapshot.sessions]
  );
  const newDeviceCount = useMemo(() => sessions.filter((session) => session.isNewDevice).length, [sessions]);
  const detailOpenCount = useMemo(() => usageEvents.filter((event) => event.type === 'detail_expand').length, [usageEvents]);
  const chartChangeCount = useMemo(() => usageEvents.filter((event) => event.type === 'chart_change').length, [usageEvents]);
  const chartPointCount = useMemo(() => usageEvents.filter((event) => event.type === 'chart_point_view').length, [usageEvents]);
  const activeReadingDuration = useMemo(
    () => sectionDurations.reduce((total, item) => total + item.durationMs, 0),
    [sectionDurations]
  );
  const failedLoginCount = useMemo(
    () => securityEvents
      .filter((event) => event.type === 'failed_login_attempts')
      .reduce((total, event) => total + Number(event.metadata.count ?? 0), 0),
    [securityEvents]
  );
  const timeline = useMemo(
    () => events
      .filter(isCurrentDurationMeasurement)
      .sort((left, right) => right.occurredAt - left.occurredAt)
      .slice(0, 160),
    [events]
  );

  const maxSectionDuration = Math.max(1, ...sectionDurations.map((item) => item.durationMs));
  const maxChartDuration = Math.max(1, ...chartDurations.map((item) => item.durationMs));
  const selectedClient = clients.find((client) => client.id === selectedClientId);

  return (
    <div className="client-activity-admin fade-in">
      <section className="glass-card client-activity-toolbar">
        <div>
          <span className="eyebrow">Uso individual del portal</span>
          <h2>Actividad de clientes</h2>
          <p>Consulta sesiones, dispositivos, seguridad y uso detallado autorizado contractualmente.</p>
        </div>
        <div className="client-activity-controls">
          <label>
            Cliente
            <select value={selectedClientId} onChange={(event) => setSelectedClientId(event.target.value)}>
              <option value="">Selecciona un cliente</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.label}</option>)}
            </select>
          </label>
          <label>
            Periodo
            <select value={period} onChange={(event) => setPeriod(event.target.value as ActivityPeriod)}>
              <option value="7">Últimos 7 días</option>
              <option value="30">Últimos 30 días</option>
              <option value="90">Últimos 90 días</option>
              <option value="all">Todo lo registrado</option>
            </select>
          </label>
          <button type="button" onClick={() => { void loadActivity(); }} disabled={!selectedClientId || loading}>
            {loading ? 'Actualizando...' : 'Recargar'}
          </button>
        </div>
      </section>

      {!selectedClientId ? (
        <section className="glass-card client-activity-empty">
          <strong>Selecciona un cliente para abrir su ficha de actividad.</strong>
          <span>La información nunca se mezcla entre clientes.</span>
        </section>
      ) : null}
      {!selectedClientId && lastAccessList.length ? (
        <section className="glass-card client-activity-card client-activity-last-access">
          <header><div><span className="eyebrow">Accesos</span><h3>Última vez que entró cada cliente</h3></div></header>
          <div className="client-activity-table-wrap">
            <table>
              <thead><tr><th>Cliente</th><th>Última vez que entró</th><th>Hace</th></tr></thead>
              <tbody>
                {lastAccessList.map((client) => (
                  <tr key={client.id} onClick={() => setSelectedClientId(client.id)} style={{ cursor: 'pointer' }}>
                    <td>{client.label}</td>
                    <td>{client.lastLogin ? formatDateTime(client.lastLogin) : 'Sin accesos registrados'}</td>
                    <td>{client.lastLogin ? formatAgo(client.lastLogin) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {!selectedClientId ? null : error ? (
        <section className="glass-card client-activity-error">{error}</section>
      ) : (
        <>
          <section className="client-activity-status-row">
            <article className="glass-card">
              <span>Cliente</span>
              <strong>{selectedClient?.label ?? selectedClientId}</strong>
              <small>{selectedProfile?.loginId ? `Usuario ${selectedProfile.loginId}` : 'Sin acceso activo asignado'}</small>
            </article>
            <article className="glass-card">
              <span>Analítica detallada</span>
              <strong>{consent?.choice === 'all' ? 'Activa por contrato' : 'Pendiente de activación'}</strong>
              <small>{consent?.choice === 'all' ? `Registrada ${formatDateTime(consent.updatedAt)}` : 'Se activará en el próximo acceso al portal'}</small>
            </article>
            <article className="glass-card">
              <span>Última vez que entró</span>
              <strong>{lastLoginByClient.get(selectedClientId) ? formatDateTime(lastLoginByClient.get(selectedClientId) ?? 0) : 'Sin accesos registrados'}</strong>
              <small>{lastLoginByClient.get(selectedClientId) ? formatAgo(lastLoginByClient.get(selectedClientId) ?? 0) : 'Todavía no ha entrado en la web'}</small>
            </article>
            <article className="glass-card">
              <span>Estado actual</span>
              <strong>{activeSessions.length ? `${activeSessions.length} online` : 'Desconectado'}</strong>
              <small>{snapshot.sessions[0] ? `Última actividad ${formatDateTime(snapshot.sessions[0].lastSeenAt)}` : 'Sin sesiones registradas'}</small>
            </article>
          </section>

          <section className="client-activity-kpis">
            <article><span>Sesiones</span><strong>{sessions.length}</strong></article>
            <article><span>Tiempo de sesión</span><strong>{formatDuration(totalSessionDuration)}</strong></article>
            <article><span>Tiempo activo medido</span><strong>{formatDuration(activeReadingDuration)}</strong></article>
            <article><span>Sección principal</span><strong>{sectionDurations[0]?.label ?? 'Sin datos'}</strong></article>
            <article><span>Dispositivos</span><strong>{snapshot.devices.length}</strong></article>
            <article><span>Nuevos dispositivos</span><strong>{newDeviceCount}</strong></article>
            <article><span>Detalles abiertos</span><strong>{detailOpenCount}</strong></article>
            <article><span>Cambios de gráfico</span><strong>{chartChangeCount}</strong></article>
            <article><span>Puntos consultados</span><strong>{chartPointCount}</strong></article>
            <article><span>Informes descargados</span><strong>{downloads.length}</strong></article>
            <article><span>Intentos fallidos detectados</span><strong>{failedLoginCount}</strong></article>
          </section>

          {consent?.choice !== 'all' ? (
            <section className="client-activity-consent-note glass-card">
              <strong>Activación pendiente.</strong>
              <span>La analítica contractual se activará automáticamente cuando este cliente vuelva a entrar.</span>
            </section>
          ) : null}

          <section className="client-activity-grid">
            <article className="glass-card client-activity-card">
              <header><div><span className="eyebrow">Atención</span><h3>Tiempo por sección</h3></div></header>
              {sectionDurations.length ? sectionDurations.map((item) => (
                <div className="client-activity-bar" key={item.label}>
                  <div><span>{item.label}</span><strong>{formatDuration(item.durationMs)}</strong></div>
                  <i><b style={{ width: `${Math.max(4, item.durationMs / maxSectionDuration * 100)}%` }} /></i>
                </div>
              )) : <p className="muted">Todavía no hay tiempo de lectura registrado para este periodo.</p>}
              <p className="client-activity-footnote">Solo se suma tiempo registrado con la medición activa actual: sección visible, pestaña activa y actividad reciente del usuario.</p>
            </article>

            <article className="glass-card client-activity-card">
              <header><div><span className="eyebrow">Gráficos</span><h3>Tiempo por visualización</h3></div></header>
              {chartDurations.length ? chartDurations.map((item) => (
                <div className="client-activity-bar is-chart" key={item.label}>
                  <div><span>{item.label}</span><strong>{formatDuration(item.durationMs)}</strong></div>
                  <i><b style={{ width: `${Math.max(4, item.durationMs / maxChartDuration * 100)}%` }} /></i>
                </div>
              )) : <p className="muted">Todavía no hay interacciones con gráficos registradas.</p>}
            </article>

            <article className="glass-card client-activity-card client-activity-wide">
              <header><div><span className="eyebrow">Seguridad</span><h3>Sesiones y dispositivos</h3></div></header>
              <div className="client-activity-table-wrap">
                <table>
                  <thead><tr><th>Inicio</th><th>Duración</th><th>Dispositivo</th><th>Navegador</th><th>Pantalla</th><th>Ubicación aproximada</th><th>Estado</th></tr></thead>
                  <tbody>
                    {sessions.length ? sessions.map((session) => {
                      const end = session.endedAt ?? Math.min(Date.now(), session.lastSeenAt + 60_000);
                      const online = !session.endedAt && session.lastSeenAt >= Date.now() - 135_000;
                      const location = [session.city, session.country].filter(Boolean).join(', ');
                      return (
                        <tr key={session.id}>
                          <td>{formatDateTime(session.startedAt)}</td>
                          <td>{formatDuration(Math.max(0, end - session.startedAt))}</td>
                          <td>{session.deviceType} · {session.operatingSystem}{session.isNewDevice ? <em>Nuevo</em> : null}</td>
                          <td>{session.browser}</td>
                          <td>{session.screen}<small>{session.viewport ? `Vista ${session.viewport}` : ''}</small></td>
                          <td>{location || 'No disponible'}</td>
                          <td><span className={online ? 'is-online' : ''}>{online ? 'Online' : session.endReason || 'Finalizada'}</span></td>
                        </tr>
                      );
                    }) : <tr><td colSpan={7}>Sin sesiones en este periodo.</td></tr>}
                  </tbody>
                </table>
              </div>
              <p className="client-activity-footnote">La ubicación solo aparece si existe un proveedor de geolocalización aproximada configurado. No se guarda la dirección IP.</p>
            </article>

            <article className="glass-card client-activity-card">
              <header><div><span className="eyebrow">Informes</span><h3>Descargas</h3></div></header>
              <div className="client-activity-list">
                {downloads.length ? downloads.slice(0, 30).map((download) => (
                  <div key={download.id}>
                    <strong>{download.filename || download.reportLabel}</strong>
                    <span>{formatDateTime(download.downloadedAt)}</span>
                    <small>{download.periodStart && download.periodEnd ? `${download.periodStart} - ${download.periodEnd}` : 'Periodo completo'}</small>
                  </div>
                )) : <p className="muted">No hay descargas en este periodo.</p>}
              </div>
            </article>

            <article className="glass-card client-activity-card">
              <header><div><span className="eyebrow">Dispositivos conocidos</span><h3>Accesos por equipo</h3></div></header>
              <div className="client-activity-list">
                {snapshot.devices.length ? snapshot.devices.map((device) => (
                  <div key={device.id}>
                    <strong>{device.deviceType} · {device.operatingSystem}</strong>
                    <span>{device.browser} · {device.screen}</span>
                    <small>{device.loginCount} accesos · Último {formatDateTime(device.lastSeenAt)}</small>
                  </div>
                )) : <p className="muted">No hay dispositivos registrados.</p>}
              </div>
            </article>

            <article className="glass-card client-activity-card client-activity-wide">
              <header><div><span className="eyebrow">Cronología</span><h3>Actividad detallada</h3></div><span>{timeline.length} eventos</span></header>
              <div className="client-activity-timeline">
                {timeline.length ? timeline.map((event) => (
                  <div key={event.id}>
                    <i className={event.category === 'security' ? 'is-security' : ''} />
                    <div>
                      <strong>{readableEventLabel(event)}</strong>
                      <span>{formatDateTime(event.occurredAt)}</span>
                      {event.durationMs > 0 ? <small>Duración: {formatDuration(event.durationMs)}</small> : null}
                      {event.type === 'chart_point_view' && typeof event.metadata.chart === 'string' ? (
                        <small>Gráfico: {chartLabels[event.metadata.chart] ?? event.metadata.chart}</small>
                      ) : null}
                    </div>
                  </div>
                )) : <p className="muted">No hay eventos para mostrar.</p>}
              </div>
              <p className="client-activity-footnote">Los intentos fallidos se registran cuando se producen en el mismo navegador y después se completa un acceso correcto. No se permiten escrituras anónimas en la base de datos.</p>
            </article>
          </section>
        </>
      )}
    </div>
  );
}
