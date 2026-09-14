import { describe, expect, it } from 'vitest';
import { excelCsv, projectCsvColumns } from '../lib/csv';

describe('exportación CSV de proyectos', () => {
  it('emite BOM, separador punto y coma y las nueve columnas acordadas', () => {
    const csv = excelCsv([projectCsvColumns, ['COT-1', 'Proyecto', 'Cliente', 'Aprobado', '100', '25', '75', '10', '90']]);
    expect(projectCsvColumns).toHaveLength(9);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.split('\r\n')[0].split(';')).toHaveLength(9);
  });

  it('escapa comillas y conserva saltos de línea dentro de una celda', () => {
    expect(excelCsv([['Proyecto "Norte"\nEtapa 2']])).toBe('\uFEFF"Proyecto ""Norte""\nEtapa 2"');
  });
});
