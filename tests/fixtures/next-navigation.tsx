const router = { replace: () => {}, push: () => {}, refresh: () => {} };
export function useRouter() { return router; }
export function useSearchParams() { return new URLSearchParams(window.location.search); }
export function usePathname() { return window.location.pathname; }
export function redirect(path: string): never { throw new Error(`Redirección inesperada en fixture: ${path}`); }
