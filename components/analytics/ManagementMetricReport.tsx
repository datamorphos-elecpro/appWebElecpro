import { ManagementEconomicSummary, ExpenseProjectDetails } from './ManagementEconomicSummary';
import { decimal } from '../../lib/calculations';
import { financialAttributes } from '../../lib/financial-tone';
import { money } from '../../lib/money';
import { reportCharts, reportGroups, type ManagementReport, type ManagementReportRow } from '../../lib/management-report';
import { columns, cells, cellAttributes } from './MetricDetailTable';
import { MetricReportChart } from './MetricReportChart';
import styles from '../../app/(report)/analisis/informe/report.module.css';

const sum = (rows: ManagementReportRow[], field: string) => rows.reduce((total, row) => total.plus(String((row as unknown as Record<string, unknown>)[field] ?? '0')), decimal(0)).toString();
export function ManagementMetricReport({ report }: { report: ManagementReport }) {
  const rows = report.records as ManagementReportRow[];
  const projects = rows.filter((row) => row.kind === 'project');
  const expense = report.metric === 'management.expenses';
  const result = report.metric === 'management.profit' || report.metric === 'management.projectedProfit';
  const projected = report.metric === 'management.projectedProfit';
  const metrics = [
    { label: report.metric === 'management.balance' ? 'Saldo total' : expense ? 'Total gastado' : result ? 'Resultado total' : 'Valor contratado', value: money(report.value) },
    { label: report.metric === 'management.balance' ? 'Clientes con deuda' : 'Clientes', value: String(new Set(rows.map((row) => row.client_id)).size) },
    { label: report.metric === 'management.balance' ? 'Proyectos con deuda' : expense ? 'Proyectos con gastos' : 'Proyectos', value: String(new Set(rows.map((row) => row.project_id)).size) },
    ...(expense ? [{ label: 'Movimientos', value: String(rows.length) }] : []),
    ...(result ? [{ label: 'Costo directo neto', value: money(sum(projects, 'base')) }, { label: projected ? 'Presupuesto' : 'Gastos reales', value: money(sum(projects, projected ? 'budget' : 'expenses')) }, ...(!projected ? [{ label: 'Distribuciones pagadas', value: money(sum(projects, 'paid_distributions')) }] : [])] : []),
  ];
  const groups = reportGroups(rows, expense ? 'project' : 'client');
  const headers = columns(report.metric);
  const numericFrom = report.metric === 'management.balance' ? 2 : expense ? 5 : 3;
  const renderRow = (row: ManagementReportRow) => <tr key={row.id}>{cells(report.metric, row).map((cell, index) => <td key={index} className={index >= numericFrom ? styles.numeric : undefined} {...cellAttributes(report.metric, row, index)}>{cell}</td>)}</tr>;
  function subtotalAmounts(groupRows: ManagementReportRow[]) {
    if (report.metric === 'management.balance') return [sum(groupRows, 'project_value'), sum(groupRows, 'paid'), sum(groupRows, 'withheld'), decimal(sum(groupRows, 'paid')).plus(sum(groupRows, 'withheld')).toString(), sum(groupRows, 'balance')];
    if (result) return [sum(groupRows, 'base'), sum(groupRows, projected ? 'budget' : 'expenses'), ...(!projected ? [sum(groupRows, 'paid_distributions')] : []), sum(groupRows, 'amount')];
    return [sum(groupRows, 'amount')];
  }
  return <>
    <ManagementEconomicSummary projects={report.projects} />
    {expense && <ExpenseProjectDetails projects={report.projects} />}
    <p>Acumulado de los proyectos filtrados. El periodo de caja no limita este informe. Importes en COP, sin decimales.</p>
    {result && <p>{projected ? 'Resultado proyectado = costo directo neto − presupuesto.' : 'Resultado actual = costo directo neto − gastos reales − distribuciones pagadas.'} La base excluye AIU e IVA adicional sobre costo directo.</p>}
    <div className={styles.metrics}>{metrics.filter(metric => !['Valor contratado','Total gastado','Distribuciones pagadas','Gastos reales','Costo directo neto'].includes(metric.label) && !(metric.label === 'Resultado total' && !projected)).map((metric) => <div className={styles.metric} key={metric.label}><span>{metric.label}</span><strong {...(metric.label === 'Resultado total' ? financialAttributes(report.value, 'result') : {})}>{metric.value}</strong></div>)}</div>
    <div className={styles.charts}>{reportCharts(report).map((chart) => <MetricReportChart key={chart.title} {...chart} />)}</div>
    {!rows.length && <p>Sin registros para los filtros aplicados.</p>}
    {groups.map((group) => <section className={styles.tableSection} key={group.key}>
      <table data-metric-detail="true"><caption className={styles.groupCaption}><h2>{group.label} · {group.rows.length} {expense ? 'movimientos' : 'proyectos'}</h2></caption><thead><tr>{headers.map((header, index) => <th key={header} className={index >= numericFrom ? styles.numeric : undefined}>{header}</th>)}</tr></thead>
      {group.rows.length > 1 && <tbody className={styles.tableLead}>{renderRow(group.rows[0])}</tbody>}
      {group.rows.length > 2 && <tbody>{group.rows.slice(1, -1).map(renderRow)}</tbody>}
      <tbody className={styles.tableTail}>
        {renderRow(group.rows[group.rows.length - 1])}
        <tr className={styles.subtotal}><th scope="row" colSpan={headers.length - subtotalAmounts(group.rows).length}>Subtotal de {group.label}</th>{subtotalAmounts(group.rows).map((amount, index, amounts) => <td key={index} className={styles.numeric} {...(result && index === amounts.length - 1 ? financialAttributes(amount, 'result') : {})}>{money(amount)}</td>)}</tr>
      </tbody></table>
    </section>)}
    <p className={styles.grandTotal}>Total general: <strong {...(result ? financialAttributes(report.value, 'result') : {})}>{money(report.value)} COP</strong></p>
  </>;
}
