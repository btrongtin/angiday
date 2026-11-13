'use client';

import { useEffect, useRef } from 'react';

/**
 * Put inside a form whose inputs are uncontrolled (`defaultValue`): when `syncKey` changes (a new search, "Xóa lọc",
 * the Back button) it resets the form to the new defaults, so the inputs show the URL's filters. The form is not
 * remounted, so keyboard focus and an open <details> survive a submit. It does nothing on the first render. React does not
 * move a <select>'s default when its prop changes, so give each select a `key` of its value.
 */
export function SyncForm({ syncKey }: { syncKey: string }) {
  const marker = useRef<HTMLSpanElement>(null);
  const previous = useRef(syncKey);
  useEffect(() => {
    if (previous.current === syncKey) return;
    previous.current = syncKey;
    marker.current?.closest('form')?.reset();
  }, [syncKey]);
  return <span ref={marker} hidden />;
}
