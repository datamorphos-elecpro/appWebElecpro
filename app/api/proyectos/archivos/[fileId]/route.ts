import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '../../../../../lib/supabase/server';
import { canPreviewFile, projectFilesBucket } from '../../../../../lib/project-files';

export async function GET(request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!z.string().uuid().safeParse(fileId).success) return NextResponse.json({ error: 'Archivo no válido.' }, { status: 400, headers });
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ error: 'Inicie sesión para consultar el archivo.' }, { status: 401, headers });
  const { data: profile } = await supabase.from('profiles').select('is_active').eq('id', claims.claims.sub).single();
  if (!profile?.is_active) return NextResponse.json({ error: 'Acceso no autorizado.' }, { status: 403, headers });
  const { data: file, error } = await supabase.from('project_files').select('object_path,original_name,mime_type').eq('id', fileId).eq('status', 'ready').single();
  if (error || !file) return NextResponse.json({ error: 'Archivo no disponible. Actualice el proyecto.' }, { status: 404, headers });
  const download = request.nextUrl.searchParams.get('download') === '1' || !canPreviewFile(file.mime_type);
  const { data, error: signError } = await supabase.storage.from(projectFilesBucket).createSignedUrl(file.object_path, 60, download ? { download: file.original_name } : undefined);
  if (signError) return NextResponse.json({ error: 'No fue posible abrir el archivo. Reintente.' }, { status: 503, headers });
  if (request.nextUrl.searchParams.get('format') === 'json') return NextResponse.json({ url: data.signedUrl }, { headers });
  return new NextResponse(null, { status: 302, headers: { ...headers, Location: data.signedUrl } });
}
