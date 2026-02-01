import { useEffect, useRef } from 'react';
import { getStorageKey, usePortfolioStore } from '../store/portfolio';

const AUTOSAVE_DELAY = 600;

export const useAutosave = () => {
  const timeoutRef = useRef<number | null>(null);
  const { finalByDay, movementsByClient, saveStatus, markSaving, markSaved, markError } =
    usePortfolioStore((state) => ({
      finalByDay: state.finalByDay,
      movementsByClient: state.movementsByClient,
      saveStatus: state.saveStatus,
      markSaving: state.markSaving,
      markSaved: state.markSaved,
      markError: state.markError
    }));

  useEffect(() => {
    if (saveStatus !== 'dirty') {
      return;
    }

    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(() => {
      try {
        markSaving();
        const payload = JSON.stringify({ finalByDay, movementsByClient });
        window.localStorage.setItem(getStorageKey(), payload);
        markSaved();
      } catch (error) {
        console.error('Autosave failed', error);
        markError();
      }
    }, AUTOSAVE_DELAY);

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [finalByDay, movementsByClient, saveStatus, markSaving, markSaved, markError]);
};
