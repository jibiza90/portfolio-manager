import { useEffect } from 'react';

// Ya se guarda en Firestore en cada cambio desde el store; este hook queda como no-op.
export const useAutosave = () => {
  useEffect(() => {
    // Intencionalmente vacío
  }, []);
};
