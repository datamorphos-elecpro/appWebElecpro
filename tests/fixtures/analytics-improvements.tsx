import { createRoot } from 'react-dom/client';
import { AnalyticsWorkspace } from '../../components/analytics/AnalyticsWorkspace';
import { AnalysisMetricCard } from '../../components/analytics/MetricDetail';
import Report from '../../app/(report)/analisis/informe/page';
import { commercialFixture, operationFixture } from './analytics-improvements-data';
import { money } from '../../lib/money';
import { managementMetrics } from '../../lib/management-report';
import { metricLabels } from '../../lib/analytics-detail';
import '../../app/globals.css';

async function main() {
  const params = new URLSearchParams(location.search);
  const report = params.get('view') === 'report' || location.pathname === '/analisis/informe';
  const tab = params.get('tab') === 'operation' ? 'operation' : 'commercial';
  const content = report ? await Report({ searchParams: Promise.resolve(Object.fromEntries(params)) }) : params.has('metrics')
    ? <>{managementMetrics.map((metric) => <AnalysisMetricCard key={metric} metric={metric} label={metricLabels[metric]} value={money(135)} />)}</>
    : <AnalyticsWorkspace tab={tab} data={tab === 'operation' ? await operationFixture() : await commercialFixture()} options={{ clients: [], projects: [], responsible: [] }} />;
  createRoot(document.getElementById('root')!).render(report ? content : <main style={{ padding: 16 }}>{content}</main>);
}
void main();
