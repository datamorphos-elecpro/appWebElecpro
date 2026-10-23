import { describe, expect, it } from 'vitest';
import { excelCsv, projectCsvColumns } from '../lib/csv';

describe('exportación CSV de proyectos', () => {
  it('emite BOM, separador punto y coma y retenciones separadas de pagos y saldo', () => {
    const csv = excelCsv([projectCsvColumns, ['COT-1', 'Proyecto', 'Cliente', 'Aprobado', '100', '25', '5', '30', '70', '10', '0', '90']]);
    expect(projectCsvColumns).toHaveLength(12);
    expect(projectCsvColumns.slice(5, 9)).toEqual(['Anticipos', 'Retenciones', 'Cubierto', 'Saldo']);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.split('\r\n')[0].split(';')).toHaveLength(12);
  });

  it('escapa comillas y conserva saltos de línea dentro de una celda', () => {
    expect(excelCsv([['Proyecto "Norte"\nEtapa 2']])).toBe('\uFEFF"Proyecto ""Norte""\nEtapa 2"');
  });
});
