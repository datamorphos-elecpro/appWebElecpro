'use client';

import { useRouter } from 'next/navigation';
import { Dialog } from '../ui/Dialog';
import { ProjectWorkspace } from './ProjectWorkspace';

export function ProjectCreationModal({ clients }: { clients: { id: string; name: string; address?: string | null }[] }) {
  const router = useRouter();
  return <Dialog open title="Nuevo proyecto" onClose={() => router.push('/proyectos')}><ProjectWorkspace clients={clients} /></Dialog>;
}
