import { describe, expect, it } from 'vitest';
import { projectProfit } from '../lib/calculations';
describe('paid project distributions', () => {
 it('deducts paid amounts in both profit models', () => {
 expect(projectProfit('value', '1000', '500', '100', '200').toString()).toBe('700');
 expect(projectProfit('manual', '1000', '500', '100', '200').toString()).toBe('200');
 });
 it('preserves losses after later expenses and exact decimal arithmetic', () => {
 expect(projectProfit('value', '1', '0', '0.7', '0.4').toString()).toBe('-0.1');
 });
});
