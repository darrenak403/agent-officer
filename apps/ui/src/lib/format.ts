// Hand-rolled (no Intl) so Node's ICU in the container and the browser produce identical
// text during hydration. Office is local to Vietnam: fixed UTC+7, no DST.
const OFFSET_MS = Number(7) * 3_600_000;
const pad = (n: number) => String(n).padStart(2, '0');

export function formatTime(value: string | null): string {
  if (!value) return 'Không có dữ liệu';
  const d = new Date(Date.parse(value) + OFFSET_MS);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} ${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}`;
}
