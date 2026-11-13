import 'server-only';
import { Runtime, type OfficeSnapshot } from '@office/contracts';
import { readOfficeSnapshot } from '../../server/dal/office';

export const emptySnapshot = (runtime: Runtime): OfficeSnapshot => ({ runtime, sequence: '0', sessions: [], tasks: [], tools: [], events: [] });

export async function getOfficePageData(runtime: Runtime) {
  try { return { snapshot: await readOfficeSnapshot(runtime), available: true }; }
  catch { return { snapshot: emptySnapshot(runtime), available: false }; }
}
