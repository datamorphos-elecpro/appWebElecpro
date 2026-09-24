'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from './supabase/client';

export type LocalDraft<T> = { version: 1; savedAt: string; serverUpdatedAt?: string; value: T };

export function useLocalDraft<T>(kind: string, recordId = 'new', userId?: string) {
  const [discoveredKey, setKey] = useState('');
  const key = userId ? `elecpro:draft:v1:${userId}:${kind}:${recordId}` : discoveredKey;
  useEffect(() => {
    if (userId) return;
    let active = true;
    void createClient().auth.getUser().then(({ data }) => {
      if (active && data.user?.id) setKey(`elecpro:draft:v1:${data.user.id}:${kind}:${recordId}`);
    });
    return () => { active = false; };
  }, [kind, recordId, userId]);
  const read = useCallback((): LocalDraft<T> | null => {
    if (!key) return null;
    try { const value = JSON.parse(localStorage.getItem(key) ?? 'null'); return value?.version === 1 ? value as LocalDraft<T> : null; }
    catch { return null; }
  }, [key]);
  const write = useCallback((value: T, serverUpdatedAt?: string) => {
    if (!key) return;
    try { localStorage.setItem(key, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), serverUpdatedAt, value })); }
    catch { /* A full or disabled browser store must not prevent editing. */ }
  }, [key]);
  const clear = useCallback(() => { if (key) localStorage.removeItem(key); }, [key]);
  return { key, read, write, clear };
}

export function useNativeFormDraft(kind: string, recordId = 'new', serverUpdatedAt = '', onRestore?: (values: Record<string, string>) => void) {
  const formRef = useRef<HTMLFormElement>(null);
  const draft = useLocalDraft<Record<string, string>>(kind, recordId);
  const [available, setAvailable] = useState(false);
  const [conflict, setConflict] = useState(false);
  useEffect(() => {
    if (!draft.key) return;
    const stored = draft.read();
    if (stored) queueMicrotask(() => { setAvailable(true); setConflict(Boolean(serverUpdatedAt && stored.serverUpdatedAt && stored.serverUpdatedAt !== serverUpdatedAt)); });
  // The key identifies one restore check, not each render of the callbacks.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.key]);
  function capture(overrides?: unknown) {
    const form = formRef.current; if (!form) return;
    const values: Record<string, string> = {};
    for (const field of Array.from(form.elements)) {
      if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) || !field.name || field.type === 'password') continue;
      values[field.name] = field instanceof HTMLInputElement && field.type === 'checkbox' ? String(field.checked) : field.value;
    }
    draft.write({ ...values, ...(overrides && typeof overrides === 'object' && 'client_id' in overrides ? { client_id: String(overrides.client_id) } : {}) }, serverUpdatedAt);
  }
  function restore() {
    const stored = draft.read(); const form = formRef.current; if (!stored || !form) return;
    for (const [name, value] of Object.entries(stored.value)) {
      const field = form.elements.namedItem(name);
      if (field instanceof HTMLInputElement) { if (field.type === 'checkbox') field.checked = value === 'true'; else field.value = value; }
      else if (field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) field.value = value;
    }
    onRestore?.(stored.value); setAvailable(false); setConflict(false);
  }
  function discard() { draft.clear(); setAvailable(false); setConflict(false); }
  function clearFields() { formRef.current?.reset(); discard(); onRestore?.({}); }
  return { formRef, available, conflict, capture, restore, discard, clearFields, clearDraft: draft.clear };
}
