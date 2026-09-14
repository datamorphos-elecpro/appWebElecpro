import { ProjectCreationModal } from '../../../../components/projects/ProjectCreationModal';
import { getRows } from '../../../../lib/data';

export default async function NewProject() {
  const clients = await getRows('clients', 'id,name,address,is_active');
  return <ProjectCreationModal clients={clients.filter(client => client.is_active !== false)} />;
}
