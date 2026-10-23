export const projectCsvColumns = ['Cotización', 'Proyecto', 'Cliente', 'Estado', 'Valor', 'Anticipos', 'Retenciones', 'Cubierto', 'Saldo', 'Gastos', 'Ganancia'] as const;

const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export function excelCsv(rows: ReadonlyArray<ReadonlyArray<unknown>>) {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}`;
}
