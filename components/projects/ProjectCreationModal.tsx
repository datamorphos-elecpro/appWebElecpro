'use client';

import { useRouter } from 'next/navigation';
import { Dialog } from '../ui/Dialog';
import { ProjectWorkspace } from './ProjectWorkspace';

export function ProjectCreationModal() {
  const router = useRouter();
  return <Dialog open title="Nuevo proyecto" onClose={() => router.push('/proyectos')}><ProjectWorkspace /></Dialog>;
}
