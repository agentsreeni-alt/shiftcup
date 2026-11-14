import { useCallback, useRef } from 'react';

/**
 * For a TextInput's onSubmitEditing. When text arrives all at once (iOS password
 * autofill, paste), the Return key can fire before React re-renders, so the handler
 * would still see the old, empty values. This waits a tick and calls the newest handler.
 */
export function useKeyboardSubmit(handler: () => unknown): () => void {
  const latest = useRef(handler);
  latest.current = handler;
  return useCallback(() => {
    setTimeout(() => {
      void latest.current();
    }, 50);
  }, []);
}
