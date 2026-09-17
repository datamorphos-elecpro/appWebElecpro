import { NextRequest, NextResponse } from 'next/server';
import { isRemoteSearchKind, type RemoteSearchResult } from '../../../../lib/remote-search';
import { createClient } from '../../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ kind: string }> }) {
  const { kind } = await context.params;
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (!isRemoteSearchKind(kind)) return NextResponse.json({ message: 'Tipo de búsqueda no permitido.' }, { status: 404 });
  if (q.length < 2) return NextResponse.json({ records: [] satisfies RemoteSearchResult[] });
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('is_active').eq('id', claims.claims.sub).single();
  if (!profile?.is_active) return NextResponse.json({ message: 'No autorizado.' }, { status: 403 });
  const safe = q.replace(/[%,()]/g, '');
  if (!safe) return NextResponse.json({ records: [] satisfies RemoteSearchResult[] });
  if (kind === 'clients') {
    const { data, error } = await supabase.from('clients').select('id,name,contact_name,email,address').eq('is_active', true).or(`name.ilike.%${safe}%,contact_name.ilike.%${safe}%,email.ilike.%${safe}%`).order('name', { ascending: true }).order('id', { ascending: true }).limit(20);
    if (error) return NextResponse.json({ message: error.message }, { status: 400 });
    return NextResponse.json({ records: (data ?? []).map((row) => ({ id: row.id, primary: row.name, secondary: [row.contact_name, row.email].filter(Boolean).join(' · ') || 'Cliente activo', metadata: { address: row.address ?? '', contact_name: row.contact_name ?? '', email: row.email ?? '' } })) satisfies RemoteSearchResult[] });
  }
  const { data, error } = await supabase.from('catalog_items').select('id,code,description,unit,base_unit_price,category').eq('is_active', true).or(`code.ilike.%${safe}%,description.ilike.%${safe}%`).order('code', { ascending: true }).order('id', { ascending: true }).limit(20);
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ records: (data ?? []).map((row) => ({ id: row.id, primary: `${row.code} · ${row.description}`, secondary: `${row.unit} · ${row.base_unit_price}`, metadata: { code: row.code, description: row.description, unit: row.unit, base_unit_price: String(row.base_unit_price), category: row.category } })) satisfies RemoteSearchResult[] });
}
