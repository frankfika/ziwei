import NewChartClient from './NewChartClient';
import { getService } from '@/lib/service';

export const dynamic = 'force-dynamic';

export default function NewProfilePage() {
  const years = getService().coverage().indexedYears;

  return <NewChartClient indexedYears={years} />;
}
