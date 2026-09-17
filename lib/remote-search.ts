export type RemoteSearchKind = 'clients' | 'catalog';
export type RemoteSearchResult = { id: string; primary: string; secondary: string; metadata: Record<string, string> };

export function isRemoteSearchKind(value: string): value is RemoteSearchKind { return value === 'clients' || value === 'catalog'; }
