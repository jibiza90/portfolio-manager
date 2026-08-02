import { useEffect, useRef, useState } from 'react';

type NetworkState = 'online' | 'offline' | 'recovered';

export const NetworkStatusBanner = () => {
  const [networkState, setNetworkState] = useState<NetworkState>(() => navigator.onLine ? 'online' : 'offline');
  const wasOfflineRef = useRef(!navigator.onLine);

  useEffect(() => {
    let recoveredTimer: number | null = null;

    const handleOffline = () => {
      if (recoveredTimer !== null) window.clearTimeout(recoveredTimer);
      wasOfflineRef.current = true;
      setNetworkState('offline');
    };

    const handleOnline = () => {
      if (!wasOfflineRef.current) {
        setNetworkState('online');
        return;
      }
      wasOfflineRef.current = false;
      setNetworkState('recovered');
      recoveredTimer = window.setTimeout(() => setNetworkState('online'), 3500);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      if (recoveredTimer !== null) window.clearTimeout(recoveredTimer);
    };
  }, []);

  if (networkState === 'online') return null;

  const offline = networkState === 'offline';
  return (
    <aside
      className={`network-status-banner ${offline ? 'is-offline' : 'is-recovered'}`}
      role={offline ? 'alert' : 'status'}
      aria-live={offline ? 'assertive' : 'polite'}
    >
      <span className="network-status-dot" aria-hidden="true" />
      <div>
        <strong>{offline ? 'Sin conexion' : 'Conexion recuperada'}</strong>
        <span>{offline ? 'Los datos se actualizaran automaticamente al volver la conexion.' : 'Actualizando los datos del portal.'}</span>
      </div>
    </aside>
  );
};
