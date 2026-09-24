import { NextRequest, NextResponse } from 'next/server';
import { isRemoteSearchKind, type RemoteSearchResult } from '../../../../lib/remote-search';
import { createClient } from '../../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ kind: string }> }) {
  const { kind } = await context.params;
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  const id = request.nextUrl.searchParams.get('id')?.trim() ?? '';
  if (!isRemoteSearchKind(kind)) return NextResponse.json({ message: 'Tipo de búsqueda no permitido.' }, { status: 404 });
  if (!id && q.length < 2) return NextResponse.json({ records: [] satisfies RemoteSearchResult[] });
  if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ message: 'ID no válido.' }, { status: 400 });
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('is_active').eq('id', claims.claims.sub).single();
  if (!profile?.is_active) return NextResponse.json({ message: 'No autorizado.' }, { status: 403 });
  const safe = q.replace(/[%,()]/g, '');
  if (!id && !safe) return NextResponse.json({ records: [] satisfies RemoteSearchResult[] });
  if (kind === 'clients') {
    let query = supabase.from('clients').select('id,name,contact_name,email,address').eq('is_active', true);
    query = id ? query.eq('id', id) : query.or(`name.ilike.%${safe}%,contact_name.ilike.%${safe}%,email.ilike.%${safe}%`);
    const { data, error } = await query.order('name', { ascending: true }).order('id', { ascending: true }).limit(id ? 1 : 20);
    if (error) return NextResponse.json({ message: error.message }, { status: 400 });
    return NextResponse.json({ records: (data ?? []).map((row) => ({ id: row.id, primary: row.name, secondary: [row.contact_name, row.email].filter(Boolean).join(' · ') || 'Cliente activo', metadata: { address: row.address ?? '', contact_name: row.contact_name ?? '', email: row.email ?? '' } })) satisfies RemoteSearchResult[] });
  }
  let query = supabase.from('catalog_items').select('id,code,description,unit,base_unit_price,category').eq('is_active', true);
  query = id ? query.eq('id', id) : query.or(`code.ilike.%${safe}%,description.ilike.%${safe}%`);
  const { data, error } = await query.order('code', { ascending: true }).order('id', { ascending: true }).limit(id ? 1 : 20);
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ records: (data ?? []).map((row) => ({ id: row.id, primary: `${row.code} · ${row.description}`, secondary: `${row.unit} · ${row.base_unit_price}`, metadata: { code: row.code, description: row.description, unit: row.unit, base_unit_price: String(row.base_unit_price), category: row.category } })) satisfies RemoteSearchResult[] });
}
