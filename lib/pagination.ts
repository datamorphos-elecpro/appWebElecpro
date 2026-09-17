export const pageSizeOptions = [20, 50, 100] as const;
export const defaultPageSize = 20;
export type PageSize = (typeof pageSizeOptions)[number];
export type SortDirection = 'asc' | 'desc';
export type SearchParams = Record<string, string | string[] | undefined>;
export type ListQuery<TSort extends string = string, TFilters extends Record<string, string> = Record<string, string>> = { search: string; filters: TFilters; sort: TSort; direction: SortDirection; page: number; pageSize: PageSize };
export type PageInfo = { page: number; pageSize: PageSize; total: number; pageCount: number; from: number; to: number; hasPrevious: boolean; hasNext: boolean };
export type PaginatedResult<T> = { records: T[]; total: number; page: PageInfo };
export type ListQueryOptions<TSort extends string, TFilters extends Record<string, readonly string[]>> = { sort: readonly TSort[]; defaultSort: TSort; filters: TFilters; prefix?: string };

function single(params: SearchParams, key: string) { const raw = params[key]; return Array.isArray(raw) ? (raw.length === 1 ? raw[0] ?? '' : '') : raw ?? ''; }

/** Parses only allow-listed, singular URL values. Invalid values become safe defaults. */
export function parseListQuery<TSort extends string, TFilters extends Record<string, readonly string[]>>(params: SearchParams, options: ListQueryOptions<TSort, TFilters>): ListQuery<TSort, Record<keyof TFilters, string>> {
  const prefix = options.prefix ?? ''; const value = (key: string) => single(params, `${prefix}${key}`); const rawSort = value('sort'); const sort = options.sort.includes(rawSort as TSort) ? rawSort as TSort : options.defaultSort;
  const filters = Object.fromEntries(Object.entries(options.filters).map(([key, allowed]) => { const candidate = value(key); return [key, allowed.includes(candidate) ? candidate : '']; })) as Record<keyof TFilters, string>;
  return { search: value('q').trim(), filters, sort, direction: value('direction') === 'asc' ? 'asc' : 'desc', page: parsePositiveInteger(value('page'), 1), pageSize: parsePageSize(value('pageSize')) };
}

/** Builds the one stable representation of a list query, omitting defaults. */
export function canonicalListSearch<TSort extends string, TFilters extends Record<string, readonly string[]>>(query: ListQuery<TSort, Record<keyof TFilters, string>>, options: ListQueryOptions<TSort, TFilters>) {
  const prefix = options.prefix ?? ''; const result = new URLSearchParams(); if (query.search) result.set(`${prefix}q`, query.search);
  for (const [key, value] of Object.entries(query.filters)) if (value) result.set(`${prefix}${key}`, value);
  if (query.sort !== options.defaultSort) result.set(`${prefix}sort`, query.sort); if (query.direction !== 'desc') result.set(`${prefix}direction`, query.direction); if (query.page !== 1) result.set(`${prefix}page`, String(query.page)); if (query.pageSize !== defaultPageSize) result.set(`${prefix}pageSize`, String(query.pageSize)); return result;
}
export function canonicalListHref<TSort extends string, TFilters extends Record<string, readonly string[]>>(pathname: string, raw: SearchParams, query: ListQuery<TSort, Record<keyof TFilters, string>>, options: ListQueryOptions<TSort, TFilters>) {
  const prefix = options.prefix ?? ''; const known = new Set(['q', 'sort', 'direction', 'page', 'pageSize', ...Object.keys(options.filters)].map((key) => `${prefix}${key}`)); const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) if (!known.has(key) && !Array.isArray(value) && value) params.set(key, value); canonicalListSearch(query, options).forEach((value, key) => params.set(key, value)); const search = params.toString(); return search ? `${pathname}?${search}` : pathname;
}
export function hasCanonicalListQuery<TSort extends string, TFilters extends Record<string, readonly string[]>>(raw: SearchParams, query: ListQuery<TSort, Record<keyof TFilters, string>>, options: ListQueryOptions<TSort, TFilters>) {
  const prefix = options.prefix ?? ''; const canonical = canonicalListSearch(query, options); const known = ['q', 'sort', 'direction', 'page', 'pageSize', ...Object.keys(options.filters)].map((key) => `${prefix}${key}`);
  return known.every((key) => { const rawValue = raw[key]; return !(Array.isArray(rawValue) && rawValue.length !== 1) && (rawValue ?? '') === (canonical.get(key) ?? ''); });
}
export function parsePositiveInteger(value: string | string[] | undefined, fallback: number) { const raw = Array.isArray(value) ? (value.length === 1 ? value[0] : '') : value; const parsed = Number.parseInt(raw ?? '', 10); return Number.isFinite(parsed) && String(parsed) === raw && parsed > 0 ? parsed : fallback; }
export function parsePageSize(value: string | string[] | undefined): PageSize { const parsed = parsePositiveInteger(value, defaultPageSize); return pageSizeOptions.includes(parsed as PageSize) ? parsed as PageSize : defaultPageSize; }
export function pageRange(page: number, pageSize: PageSize) { const from = (Math.max(1, page) - 1) * pageSize; return { from, to: from + pageSize - 1 }; }
export function pagination(total: number, page: number, pageSize: PageSize): PageInfo { const safePage = Math.max(1, page); const pageCount = Math.max(1, Math.ceil(total / pageSize)); const current = Math.min(safePage, pageCount); const from = total === 0 ? 0 : (current - 1) * pageSize + 1; const to = Math.min(total, current * pageSize); return { page: current, pageSize, total, pageCount, from, to, hasPrevious: current > 1, hasNext: current < pageCount }; }
export function paginated<T>(records: T[], total: number, page: number, pageSize: PageSize): PaginatedResult<T> { return { records, total, page: pagination(total, page, pageSize) }; }
