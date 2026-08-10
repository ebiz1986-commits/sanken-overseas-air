import { useState, useEffect, useRef } from 'react';

interface AutoSaveOptions<T> {
  key: string;
  initialData: T;
  enabled?: boolean;
  debounceMs?: number;
}

export function useAutoSaveDraft<T>({
  key,
  initialData,
  enabled = true,
  debounceMs = 500
}: AutoSaveOptions<T>) {
  const [data, setData] = useState<T>(initialData);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasRestored, setHasRestored] = useState<boolean>(false);
  const isInitialMount = useRef(true);

  // Load draft on mount or key change
  useEffect(() => {
    if (!key || !enabled) return;
    
    try {
      const savedItem = localStorage.getItem(`draft_${key}`);
      if (savedItem) {
        const parsed = JSON.parse(savedItem);
        if (parsed && parsed.data) {
          setData(parsed.data);
          if (parsed.timestamp) {
            setLastSaved(new Date(parsed.timestamp));
          }
          setHasRestored(true);
        }
      } else {
        setData(initialData);
        setHasRestored(false);
      }
    } catch (e) {
      console.warn('Failed to load auto-save draft from localStorage:', e);
    }
  }, [key, enabled]);

  // Sync initialData when initialData changes externally if no draft active
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const savedItem = localStorage.getItem(`draft_${key}`);
    if (!savedItem) {
      setData(initialData);
    }
  }, [initialData]);

  // Debounced auto-save on data change
  useEffect(() => {
    if (!key || !enabled || isInitialMount.current) return;

    const timer = setTimeout(() => {
      try {
        const now = new Date();
        const payload = {
          data,
          timestamp: now.toISOString()
        };
        localStorage.setItem(`draft_${key}`, JSON.stringify(payload));
        setLastSaved(now);
      } catch (e) {
        console.warn('Failed to auto-save draft to localStorage:', e);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [data, key, enabled, debounceMs]);

  const updateData = (newData: T | ((prev: T) => T)) => {
    setData(newData);
  };

  const clearDraft = () => {
    try {
      localStorage.removeItem(`draft_${key}`);
      setLastSaved(null);
      setHasRestored(false);
      setData(initialData);
    } catch (e) {
      console.warn('Failed to clear draft from localStorage:', e);
    }
  };

  return {
    data,
    setData: updateData,
    lastSaved,
    hasRestored,
    clearDraft,
    isDraftSaved: !!lastSaved || hasRestored
  };
}
