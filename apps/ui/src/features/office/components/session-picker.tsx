
import { useEffect, useRef, useState } from 'react';
import type { OfficeSession } from '@office/contracts';
import { sessionLabel } from '../labels';

const STATE: Record<OfficeSession['status'], string> = { ACTIVE: 'active', ENDED: 'ended', UNKNOWN: 'idle' };

function Row({ s }: { s: OfficeSession }) {
  const l = sessionLabel(s);
  return <>
    <i className={`sp-dot sp-${STATE[s.status]}`} aria-hidden="true" />
    <span className="sp-text"><b>{l.title}</b><small>{l.meta}</small></span>
  </>;
}

/** Session switcher: project name first, state and size as a quiet second line. */
export function SessionPicker({ sessions, activeId, onChange }: { sessions: OfficeSession[]; activeId: string | null; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const active = sessions.find(s => s.id === activeId) ?? null;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);

  return (
    <div className="session-picker" ref={root}>
      <button className="sp-trigger" aria-haspopup="listbox" aria-expanded={open} disabled={!sessions.length} onClick={() => setOpen(v => !v)}>
        {active ? <Row s={active} /> : <span className="sp-text"><b>Chưa có phiên nào</b><small>Phiên sẽ xuất hiện khi agent bắt đầu</small></span>}
        <svg className="sp-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
      </button>
      {open && <ul className="sp-menu" role="listbox" aria-label="Phiên làm việc">
        {sessions.map(s => (
          <li key={s.id} role="option" aria-selected={s.id === activeId}>
            <button onClick={() => { onChange(s.id); setOpen(false); }}><Row s={s} /></button>
          </li>
        ))}
      </ul>}
    </div>
  );
}
