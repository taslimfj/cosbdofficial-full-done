import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useState যা localStorage-এ draft হিসেবে সংরক্ষিত থাকে।
 * App minimize করে অন্য app-এ গিয়ে ফিরে আসলে (বা browser tab reload হলেও)
 * form-এ লেখা data হারিয়ে যায় না। clear() দিয়ে draft মুছে ফেলা যায়।
 */
export function usePersistentState<T>(key: string, initialValue: T) {
  const storageKey = `draft:${key}`;

  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw == null) return initialValue;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) &&
          initialValue && typeof initialValue === 'object' && !Array.isArray(initialValue)) {
        return { ...(initialValue as any), ...parsed } as T;
      }
      return parsed as T;
    } catch {
      return initialValue;
    }
  });

  const initialRef = useRef(initialValue);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {}
  }, [storageKey, state]);

  const clear = useCallback(() => {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {}
    setState(initialRef.current);
  }, [storageKey]);

  return [state, setState, clear] as const;
}
