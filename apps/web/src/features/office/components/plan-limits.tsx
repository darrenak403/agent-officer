'use client';

import { useEffect, useState } from 'react';
import type { OfficeAccounts, OfficeSnapshot } from '@office/contracts';

const TZ = 'Asia/Ho_Chi_Minh';
const clock = new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const day = new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit' });
const at = new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });

function left(ms: number) {
  if (ms <= 0) return 'đã hồi';
  const m = Math.ceil(ms / 60000);
  const d = Math.floor(m / 1440); const h = Math.floor((m % 1440) / 60); const r = m % 60;
  return d ? `còn ${d} ngày ${h}g` : h ? `còn ${h}g${String(r).padStart(2, '0')}` : `còn ${r} phút`;
}

function Limit({ name, pct, resetsAt, now, withDay }: { name: string; pct: number | null; resetsAt: string | null; now: number; withDay?: boolean }) {
  if (pct == null) return null;
  const reset = resetsAt ? Date.parse(resetsAt) : null;
  const level = pct >= 90 ? 'high' : pct >= 70 ? 'mid' : 'low';
  return (
    <div className={`limit limit-${level}`} title={reset ? `Hồi lúc ${at.format(reset)} ${day.format(reset)} (giờ Việt Nam)` : undefined}>
      <span className="limit-name">{name}</span>
      <span className="limit-bar"><i style={{ width: `${pct}%` }} /></span>
      <b>{Math.round(pct)}%</b>
      {reset && <span className="limit-reset">{left(reset - now)} · hồi {at.format(reset)}{withDay ? ` ${day.format(reset)}` : ''}</span>}
    </div>
  );
}

const compact = new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 });

/**
 * Account, plan usage and a live Vietnam clock. Real percentages come from the Claude status line
 * or Codex's own session log; without them Claude shows a local token estimate for the 5-hour window.
 */
export function PlanLimits({ limits, info }: { limits: OfficeSnapshot['limits']; info: OfficeAccounts | undefined }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  if (now == null) return null;
  const real = limits ?? info?.limits ?? null;
  const acct = info?.account;
  const est = info?.estimate;
  const estReset = est?.resetsAt ? Date.parse(est.resetsAt) : null;
  return (
    <div className="plan-limits">
      <div className="usage">
      {acct && <b className="account-plan" title="Gói đang dùng của tài khoản đăng nhập trên máy">{acct.plan ?? 'Đã đăng nhập'}</b>}
      {info && !acct && <span className="limit-empty">Chưa đăng nhập</span>}
      {real && <>
        <Limit name="5 giờ" pct={real.fiveHourPct} resetsAt={real.fiveHourResetsAt} now={now} />
        <Limit name="Tuần" pct={real.weekPct} resetsAt={real.weekResetsAt} now={now} withDay />
      </>}
      {!real && est && (() => {
        // No real % without the CLI status line: the bar shows how much of the 5-hour window has passed.
        const pct = estReset ? Math.min(100, Math.max(0, 100 - (estReset - now) / 180000)) : 0;
        return <div className="limit limit-low limit-estimate" title={`Ước tính từ transcript trên máy (${est.replies} lượt trả lời, không tính ${compact.format(est.cacheRead)} token đọc cache). Thanh là thời gian đã qua của cửa sổ 5 giờ; % hạn mức thật chỉ có khi chạy claude trong terminal.`}>
          <span className="limit-name">5 giờ</span>
          <span className="limit-bar"><i style={{ width: `${pct}%` }} /></span>
          <b>{compact.format(est.tokens)} tok</b>
          <span className="limit-reset">{estReset ? `${left(estReset - now)} · hồi ${at.format(estReset)}` : 'chưa dùng trong cửa sổ này'}</span>
        </div>;
      })()}
      </div>
      <time className="vn-clock" dateTime={new Date(now).toISOString()}>{clock.format(now)}<small>{day.format(now)} · GMT+7</small></time>
    </div>
  );
}
