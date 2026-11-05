import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ features: { SHOW_ANALYTICS_DISTRIBUTIONS: false }, distribution: vi.fn(), filters: vi.fn() }));
vi.mock('../lib/features', () => mocks.features);
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock('../lib/distributions-data', () => ({ getDistributionPage: mocks.distribution }));
vi.mock('../lib/analytics-queries', () => ({ getFilterOptions: mocks.filters, getManagement: vi.fn(), getOperation: vi.fn(), getCommercial: vi.fn() }));
vi.mock('../components/analytics/AnalyticsWorkspace', () => ({ AnalyticsWorkspace: () => null }));
vi.mock('../components/analytics/DistributionWorkspace', () => ({ DistributionWorkspace: () => null }));
vi.mock('../components/ui/Page', () => ({ Page: () => null }));
import AnalysisPage from '../app/(protected)/analisis/page';
import DistributionPage from '../app/(protected)/analisis/distribuciones/page';

beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('React', React);
  mocks.features.SHOW_ANALYTICS_DISTRIBUTIONS = false;
  mocks.distribution.mockResolvedValue({ records: [], page: {}, metrics: {}, participants: [] });
});

describe('visibilidad reversible de Distribuciones', () => {
  it('redirige el enlace de pestaña antes de consultar datos', async () => {
    await expect(AnalysisPage({ searchParams: Promise.resolve({ tab: 'distribution' }) })).rejects.toThrow('redirect:/analisis');
    expect(mocks.distribution).not.toHaveBeenCalled(); expect(mocks.filters).not.toHaveBeenCalled();
  });
  it('redirige el enlace heredado directamente a Gerencia', async () => {
    await expect(DistributionPage({ searchParams: Promise.resolve({ distribution_payment: 'paid' }) })).rejects.toThrow(/^redirect:\/analisis$/);
  });
  it('restaura la consulta y el contenido al activar la bandera', async () => {
    mocks.features.SHOW_ANALYTICS_DISTRIBUTIONS = true;
    expect(await AnalysisPage({ searchParams: Promise.resolve({ tab: 'distribution' }) })).toBeTruthy();
    expect(mocks.distribution).toHaveBeenCalledOnce();
    await expect(DistributionPage({ searchParams: Promise.resolve({ distribution_payment: 'paid' }) })).rejects.toThrow('redirect:/analisis?distribution_payment=paid&tab=distribution');
  });
});
