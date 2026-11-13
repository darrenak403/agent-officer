import { Runtime } from '@office/contracts';
import { OfficeDashboard } from '../features/office/components/office-dashboard';
import { getOfficePageData } from '../features/office/queries';

export default async function Page({ searchParams }: { searchParams: Promise<{ runtime?: string }> }) {
  const params = await searchParams;
  const parsed = Runtime.safeParse(params.runtime);
  const runtime = parsed.success ? parsed.data : 'claude_code';
  const { snapshot, available } = await getOfficePageData(runtime);
  return <OfficeDashboard initialRuntime={runtime} initialSnapshot={snapshot} initialAvailable={available} renderedAt={Date.now()} />;
}
