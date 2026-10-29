import { describe, expect, it } from 'vitest';
import { attachmentAccept, attachmentMaxBytes, attachmentTypeName, canPreviewFile, fileSizeText, receiptMaxBytes, validateProjectFile } from '../lib/project-files';

describe('archivos de proyectos', () => {
  it('acepta un soporte PDF dentro del límite, conservando mayúsculas del nombre', () => {
    expect(validateProjectFile({ name: 'Comprobante.PDF', size: receiptMaxBytes }, 'receipt')).toBe('application/pdf');
    expect(() => validateProjectFile({ name: 'comprobante.pdf', size: receiptMaxBytes + 1 }, 'receipt')).toThrow('10 MB');
    expect(() => validateProjectFile({ name: 'comprobante.png', size: 100 }, 'receipt')).toThrow('PDF');
  });
  it.each(['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx', 'xls', 'xlsx', 'dwg', 'dxf', 'zip'])('admite %s como adjunto de hasta 50 MB', (extension) => {
    expect(validateProjectFile({ name: `Documento.${extension}`, size: attachmentMaxBytes }, 'attachment')).toBeTruthy();
    expect(attachmentAccept).toContain(`.${extension}`);
  });
  it.each([{ name: 'vacío.pdf', size: 0 }, { name: 'archivo.pdf', size: -1 }, { name: 'archivo.pdf', size: 1.5 }, { name: 'grande.pdf', size: attachmentMaxBytes + 1 }, { name: 'malicioso.exe', size: 20 }, { name: '../archivo.pdf', size: 20 }, { name: 'a\\archivo.pdf', size: 20 }, { name: 'a\n.pdf', size: 20 }, { name: `${'a'.repeat(241)}.pdf`, size: 20 }])('rechaza nombres, formatos y tamaños inválidos: $name', (file) => {
    expect(() => validateProjectFile(file, 'attachment')).toThrow();
  });
  it('solo permite vista previa para PDF e imágenes admitidas', () => {
    expect(canPreviewFile('application/pdf')).toBe(true); expect(canPreviewFile('image/png')).toBe(true);
    expect(canPreviewFile('image/jpeg')).toBe(true); expect(canPreviewFile('application/zip')).toBe(false);
    expect(canPreviewFile('text/html')).toBe(false);
  });
  it('normaliza espacios de categorías y exige nombres no vacíos de máximo 100 caracteres', () => {
    expect(attachmentTypeName.parse('  Acta   de entrega  ')).toBe('Acta de entrega');
    expect(attachmentTypeName.safeParse(' ').success).toBe(false);
    expect(attachmentTypeName.safeParse('a'.repeat(101)).success).toBe(false);
  });
  it('presenta tamaños sin precisión innecesaria', () => {
    expect(fileSizeText(1024)).toBe('1 KB'); expect(fileSizeText(receiptMaxBytes)).toBe('10 MB');
  });
});
