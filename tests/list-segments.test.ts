import { describe, expect, it } from 'vitest';
import { metricLinks, projectListOptions, quoteListOptions } from '../lib/list-segments';
import { canonicalListHref, parseListQuery, type ListQueryOptions } from '../lib/pagination';

describe('navegación y filtros de métricas', () => {
  it('normaliza enlaces antiguos de fecha conservando dirección, búsqueda y filtros', () => {
    const raw = { sort: 'issued_on', direction: 'asc', status: 'approved', q: 'Cliente', segment: 'decided' };
    const query = parseListQuery(raw, quoteListOptions);
    expect(query.sort).toBe('created_at');
    expect(canonicalListHref('/cotizaciones', raw, query, quoteListOptions)).toBe('/cotizaciones?q=Cliente&status=approved&segment=decided&direction=asc');
  });
  it('descarta segmentos desconocidos y parámetros repetidos', () => {
    const raw = { segment: 'unknown' }; const query = parseListQuery(raw, projectListOptions);
    expect(canonicalListHref('/proyectos', raw, query, projectListOptions)).toBe('/proyectos');
    expect(parseListQuery({ segment: ['valid', 'decided'] }, quoteListOptions).filters.segment).toBe('');
  });
  it('conserva el segmento al paginar y al quitar únicamente el estado', () => {
    const raw = { segment: 'active', status: 'approved', page: '3', pageSize: '50', q: 'Obra' };
    const query = parseListQuery(raw, projectListOptions);
    expect(canonicalListHref('/proyectos', raw, { ...query, page: 4 }, projectListOptions)).toContain('segment=active&page=4&pageSize=50');
    expect(canonicalListHref('/proyectos', raw, { ...query, page: 1, filters: { ...query.filters, status: '' } }, projectListOptions)).toBe('/proyectos?q=Obra&segment=active&pageSize=50');
  });
  it('cada tarjeta abre una consulta válida desde la primera página y sin búsquedas heredadas', () => {
    for (const href of Object.values(metricLinks)) {
      const url = new URL(href, 'https://elecpro.test');
      const options: ListQueryOptions<string, Record<string, readonly string[]>> = url.pathname === '/cotizaciones' ? quoteListOptions : projectListOptions;
      const raw = Object.fromEntries(url.searchParams); const query = parseListQuery(raw, options);
      expect(query.page).toBe(1); expect(query.search).toBe('');
      expect(canonicalListHref(url.pathname, raw, query, options)).toBe(href);
    }
  });
});
