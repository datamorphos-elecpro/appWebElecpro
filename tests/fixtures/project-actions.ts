import { withholdingSchema, voidWithholdingSchema } from '../../lib/validators/withholding';

export async function registerWithholding(input: unknown) {
  const value = withholdingSchema.parse(input); localStorage.setItem('elecpro:test:withholding', JSON.stringify(value));
  return { ...value, id: '55555555-5555-4555-8555-555555555555' };
}
export async function voidWithholding(input: unknown) {
  const value = voidWithholdingSchema.parse(input); localStorage.setItem('elecpro:test:void-withholding', JSON.stringify(value)); return value;
}
export async function saveProject() { return { id: '33333333-3333-4333-8333-333333333333' }; }
export async function saveProjectRecord(kind: string, input: unknown) { localStorage.setItem('elecpro:test:project-record', JSON.stringify({ kind, input })); }
export async function settleProjectShares() {}
