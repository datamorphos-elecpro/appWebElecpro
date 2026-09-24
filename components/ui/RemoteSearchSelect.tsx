'use client';

import { useEffect, useRef, useState } from 'react';
import type { RemoteSearchKind, RemoteSearchResult } from '../../lib/remote-search';
import { SearchList } from './SearchList';

export function RemoteSearchSelect({ kind, value, onSelect, placeholder, disabled = false, defaultResult }: { kind: RemoteSearchKind; value: string; onSelect: (result: RemoteSearchResult | null) => void; placeholder: string; disabled?: boolean; defaultResult?: RemoteSearchResult | null }) {
  const [query, setQuery] = useState(''); const [records, setRecords] = useState<RemoteSearchResult[]>([]);
  const [resolved, setResolved] = useState<RemoteSearchResult | null>(defaultResult?.id === value ? defaultResult : null);
  const [loading, setLoading] = useState(false); const [message, setMessage] = useState(''); const [unavailable, setUnavailable] = useState(false);
  const request = useRef<AbortController | null>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => {
    if (!value) return;
    const controller = new AbortController();
    void fetch(`/api/search/${kind}?id=${encodeURIComponent(value)}`, { signal: controller.signal }).then(async (response) => {
      const body = await response.json() as { records?: RemoteSearchResult[] };
      if (!response.ok && response.status !== 400) throw new Error('No fue posible resolver la selección.');
      const record = body.records?.[0] ?? null;
      setResolved(record); setUnavailable(!record);
      if (!record) onSelectRef.current(null);
      else if (defaultResult?.id !== value) onSelectRef.current(record);
    }).catch((error) => { if (error.name !== 'AbortError') setMessage('No fue posible resolver la selección.'); });
    return () => controller.abort();
  }, [value, kind, defaultResult?.id]);
  useEffect(() => {
    if (query.trim().length < 2) return;
    const timer = window.setTimeout(() => {
      const controller = new AbortController(); request.current?.abort(); request.current = controller;
      setLoading(true); setMessage('');
      void fetch(`/api/search/${kind}?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal }).then(async (response) => {
        const body = await response.json() as { records?: RemoteSearchResult[]; message?: string };
        if (!response.ok) throw new Error(body.message ?? 'No fue posible buscar.');
        setRecords(body.records ?? []);
      }).catch((error) => { if (error.name !== 'AbortError') setMessage(error instanceof Error ? error.message : 'No fue posible buscar.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 300);
    return () => { window.clearTimeout(timer); request.current?.abort(); };
  }, [query, kind]);
  const selected = value ? resolved?.id === value ? resolved : defaultResult?.id === value ? defaultResult : null : null;
  const options = [...(selected ? [selected] : []), ...records.filter((record) => record.id !== selected?.id)].map((record) => ({ value: record.id, label: record.primary, description: record.secondary }));
  return <div><SearchList label={kind === 'clients' ? 'Cliente' : 'Catálogo'} values={value && selected ? [value] : []} options={options} query={query} onQueryChange={(next) => { setQuery(next); if (next.trim().length < 2) setRecords([]); }} placeholder={placeholder} loading={loading} error={message} disabled={disabled} unresolved={unavailable} emptyLabel={kind === 'clients' ? 'Seleccione un cliente' : 'Buscar en catálogo'} onChange={(ids) => { const record = ids.length ? [selected, ...records].find((item) => item?.id === ids[0]) ?? null : null; setResolved(record); setUnavailable(false); onSelect(record); setQuery(''); setRecords([]); }} />{unavailable && <small role="alert">El cliente recuperado ya no está disponible. Seleccione uno activo.</small>}</div>;
}
