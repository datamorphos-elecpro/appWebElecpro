import { describe, expect, it } from 'vitest';
import { canonicalListHref, hasCanonicalListQuery, pagination, parseListQuery } from '../lib/pagination';

describe('parámetros paginados', () => {
  const options = { sort: ['name', 'created_at'] as const, defaultSort: 'name' as const, filters: { status: ['', 'active', 'inactive'] as const } };
  it('aplica listas blancas y valores predeterminados seguros', () => {
    expect(parseListQuery({ q: '  Ana ', sort: 'sql', direction: 'sideways', status: 'drop', page: '-1', pageSize: '999' }, options)).toEqual({ search: 'Ana', filters: { status: '' }, sort: 'name', direction: 'desc', page: 1, pageSize: 20 });
  });
  it('respeta parámetros válidos y calcula una página estable', () => {
    const parsed = parseListQuery({ sort: 'created_at', direction: 'asc', status: 'inactive', page: '3', pageSize: '50' }, options);
    expect(parsed).toMatchObject({ sort: 'created_at', direction: 'asc', filters: { status: 'inactive' }, page: 3, pageSize: 50 });
    expect(pagination(51, 99, 50)).toMatchObject({ page: 2, pageCount: 2, from: 51, to: 51 });
  });
  it('rechaza valores repetidos y elimina parámetros no canónicos', () => {
    const query = parseListQuery({ q: ['Ana', 'Beto'], status: ['active', 'inactive'], page: '2' }, options);
    expect(query).toMatchObject({ search: '', filters: { status: '' }, page: 2 });
    expect(hasCanonicalListQuery({ page: '2' }, query, options)).toBe(true);
    expect(canonicalListHref('/clientes', { tab: 'management', page: '99' }, { ...query, page: 1 }, options)).toBe('/clientes?tab=management');
  });
});
