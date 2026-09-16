import type { SVGProps } from 'react';

export type IconName = 'dashboard' | 'query_stats' | 'folder_open' | 'request_quote' | 'inventory_2' | 'local_shipping' | 'groups' | 'account_balance_wallet' | 'notifications' | 'left_panel_open' | 'left_panel_close' | 'menu_open' | 'admin_panel_settings' | 'logout' | 'close' | 'check_circle' | 'error' | 'warning' | 'info';

const paths: Record<IconName, string[]> = {
  dashboard: ['M4 5h7v7H4z', 'M13 5h7v4h-7z', 'M13 11h7v8h-7z', 'M4 14h7v5H4z'],
  query_stats: ['M4 19h17', 'M6 16l4-4 3 3 6-8', 'M19 7h-4V3'],
  folder_open: ['M3 7h7l2 2h9v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M3 11h18'],
  request_quote: ['M6 3h9l3 3v15H6z', 'M15 3v4h4', 'M8 10h8', 'M8 14h8', 'M9 18h4'],
  inventory_2: ['M4 7l8-4 8 4-8 4z', 'M4 7v10l8 4 8-4V7', 'M12 11v10'],
  local_shipping: ['M3 6h11v9H3z', 'M14 9h4l3 3v3h-7z', 'M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4', 'M18 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4'],
  groups: ['M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6', 'M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6', 'M3 20a5 5 0 0 1 10 0', 'M11 20a5 5 0 0 1 10 0'],
  account_balance_wallet: ['M4 6h14a2 2 0 0 1 2 2v10H4z', 'M4 8a2 2 0 0 1 2-2', 'M15 12h6v4h-6z', 'M18 14h.1'],
  notifications: ['M18 16H6l2-2v-4a4 4 0 0 1 8 0v4z', 'M10 19a2 2 0 0 0 4 0'],
  left_panel_open: ['M4 5h16v14H4z', 'M9 5v14', 'M15 9l-3 3 3 3'],
  left_panel_close: ['M4 5h16v14H4z', 'M9 5v14', 'M12 9l3 3-3 3'],
  menu_open: ['M4 7h16', 'M4 12h11', 'M4 17h16', 'M16 10l3 2-3 2'],
  admin_panel_settings: ['M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z', 'M9 12l2 2 4-4'],
  logout: ['M10 5H5v14h5', 'M13 8l4 4-4 4', 'M17 12H9'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  check_circle: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18', 'M8 12l3 3 5-6'],
  error: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18', 'M12 7v6', 'M12 17h.1'],
  warning: ['M12 4l9 16H3z', 'M12 9v5', 'M12 17h.1'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18', 'M12 11v6', 'M12 7h.1'],
};

export function Icon({ name, title, className, ...props }: { name: IconName; title?: string } & SVGProps<SVGSVGElement>) {
  return <svg className={className} viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined} {...props}>{title && <title>{title}</title>}{paths[name].map((d) => <path key={d} d={d} />)}</svg>;
}
