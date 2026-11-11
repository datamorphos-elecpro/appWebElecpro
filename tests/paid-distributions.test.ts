import { describe, expect, it } from 'vitest';
import { projectProfit } from '../lib/calculations';
describe('paid project distributions', () => {
 it('deducts paid amounts in both profit models', () => {
 expect(projectProfit('value', '1000', '500', '100', '200').toString()).toBe('700');
 expect(projectProfit('manual', '1000', '500', '100', '200').toString()).toBe('700');
 });
 it('preserves losses after later expenses and exact decimal arithmetic', () => {
 expect(projectProfit('value', '1', '0', '0.7', '0.4').toString()).toBe('-0.1');
 });
});

it('descuenta gastos y distribuciones de costo directo neto: 10 - 7 - 1 = 2', () => {
 expect(projectProfit('value','10000000','0','7000000','1000000').toString()).toBe('2000000');
});
