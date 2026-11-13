import 'server-only';
import { OfficeSnapshotSchema, Runtime, type OfficeSnapshot } from '@office/contracts';

const internalApi = process.env.OFFICE_API_INTERNAL_URL ?? 'http://127.0.0.1:4100';

export async function readOfficeSnapshot(runtime: Runtime): Promise<OfficeSnapshot> {
  const response = await fetch(`${internalApi}/api/office/snapshot?runtime=${runtime}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Office API returned ${response.status}`);
  const snapshot = OfficeSnapshotSchema.parse(await response.json());
  if (snapshot.runtime !== runtime) throw new Error('Office API runtime mismatch');
  return snapshot;
}
