import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { analysisDetailResponseSchema, parseAnalysisDetailRequest } from '../../../../lib/analytics-detail';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: token } = await supabase.auth.getClaims();
  if (!token?.claims?.sub) return NextResponse.json({ message: 'No autorizado.' }, { status: 401, headers });
  const { data: profile } = await supabase.from('profiles').select('is_active').eq('id', token.claims.sub).single();
  if (!profile?.is_active) return NextResponse.json({ message: 'No autorizado.' }, { status: 403, headers });
  let input;
  try { input = parseAnalysisDetailRequest(request.nextUrl.searchParams); }
  catch { return NextResponse.json({ message: 'Revise la métrica, los filtros y la paginación.' }, { status: 400, headers }); }
  const { data, error } = await supabase.rpc('analytics_metric_detail', {
    p_metric: input.metric, p_filters: input.filters, p_page: input.page, p_page_size: input.pageSize,
  });
  const result = analysisDetailResponseSchema.safeParse(data);
  if (error || !result.success) {
    console.error('[análisis:detalle]', error ?? result.error);
    return NextResponse.json({ message: 'No fue posible cargar el detalle. Intente nuevamente.' }, { status: 500, headers });
  }
  return NextResponse.json(result.data, { headers });
}
