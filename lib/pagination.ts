export const pageSizeOptions = [20, 50, 100] as const;
export const defaultPageSize = 20;
export type PageSize = (typeof pageSizeOptions)[number];
export type SortDirection = 'asc' | 'desc';

export type ListQuery<TSort extends string = string, TFilters extends Record<string, string> = Record<string, string>> = {
  search: string;
  filters: TFilters;
  sort: TSort;
  direction: SortDirection;
  page: number;
  pageSize: PageSize;
};

export type PageInfo = {
  page: number;
  pageSize: PageSize;
  total: number;
  pageCount: number;
  from: number;
  to: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

export type PaginatedResult<T> = {
  records: T[];
  total: number;
  page: PageInfo;
};

export function parsePositiveInteger(value: string | string[] | undefined, fallback: number) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parsePageSize(value: string | string[] | undefined): PageSize {
  const parsed = parsePositiveInteger(value, defaultPageSize);
  return pageSizeOptions.includes(parsed as PageSize) ? parsed as PageSize : defaultPageSize;
}

export function pageRange(page: number, pageSize: PageSize) {
  const from = (Math.max(1, page) - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

export function pagination(total: number, page: number, pageSize: PageSize): PageInfo {
  const safePage = Math.max(1, page);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(safePage, pageCount);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(total, current * pageSize);
  return { page: current, pageSize, total, pageCount, from, to, hasPrevious: current > 1, hasNext: current < pageCount };
}

export function paginated<T>(records: T[], total: number, page: number, pageSize: PageSize): PaginatedResult<T> {
  return { records, total, page: pagination(total, page, pageSize) };
}
