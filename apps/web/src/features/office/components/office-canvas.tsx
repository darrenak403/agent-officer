'use client';

import { useEffect, useRef } from 'react';
import type { OfficeAgent, Runtime } from '@office/contracts';

type Pixi = typeof import('pixi.js');
/** Canvas agents carry the projected presence label so the map and inspector agree. */
export type CanvasAgent = OfficeAgent & { presence?: { label: string }; displayName?: string; doing?: string | null };
type Scene = { paint: (agents: CanvasAgent[], selectedId: string | null) => void; destroy: () => void };

const SIZE = { width: 1120, height: 650 };
const COLOR = {
  wall: '#273349', wallTop: '#35445b', wallEdge: '#172133', floor: '#394559', floorAlt: '#3d4a5f',
  line: '#2a374b', cream: '#e9e4d5', muted: '#a9b4bd', amber: '#edaa63', teal: '#6ccbb8',
  wood: '#9b674f', woodLight: '#c08a65', woodDark: '#593b3b', rug: '#57637e',
  screen: '#182638', screenLit: '#78a9cb', leaf: '#487c70', pot: '#b17b60',
};
const SHIRTS = ['#d8816a', '#6ab6a6', '#8b9bc9', '#c5a66d', '#b590ba', '#81adc7'];
const HAIR = ['#332c38', '#684633', '#b99a72', '#262b3b', '#8c5a50', '#4b3948'];
const SKIN = ['#e7bb96', '#bb815f', '#d59f79', '#f0cfaa', '#8d634f'];
const STATUS: Record<string, { label: string; color: string }> = {
  WORKING: { label: 'Đang làm', color: '#72d4bd' },
  WAITING: { label: 'Cần chú ý', color: '#f0bf70' },
  IDLE: { label: 'Tạm nghỉ', color: '#94bdd0' },
  DISCOVERED: { label: 'Có mặt', color: '#a8c7ba' },
  STOPPED: { label: 'Đã dừng', color: '#8e9aa8' },
  COMPLETED: { label: 'Hoàn tất', color: '#a5cc9c' },
  FAILED: { label: 'Lỗi', color: '#e68d81' },
  UNKNOWN: { label: 'Chưa rõ', color: '#aab0bb' },
};

const deskSpots = [
  [104, 205], [286, 205], [468, 205], [650, 205],
  [104, 390], [286, 390], [468, 390], [650, 390],
];
// Two seated on the sofa, two standing below the coffee table; exits stand by the door.
const loungeSpots = [[920, 312], [1030, 312], [920, 440], [1030, 440]];
const exitSpots = [[890, 568], [990, 568]];
/** A finished subagent rests in the lounge for a while before it is shown as gone. */
export const LOUNGE_MS = 15 * 60_000;

function stableNumber(value: string) {
  let n = 0;
  for (const char of value) n = (n * 31 + char.charCodeAt(0)) >>> 0;
  return n;
}

function rect(g: import('pixi.js').Graphics, x: number, y: number, w: number, h: number, color: string) {
  g.rect(x, y, w, h).fill(color);
}

function label(pixi: Pixi, parent: import('pixi.js').Container, value: string, x: number, y: number, size = 13, color = COLOR.cream, weight: 'normal' | 'bold' = 'normal') {
  const item = new pixi.Text({ text: value, style: { fontFamily: 'Courier New, monospace', fontSize: size, fontWeight: weight, fill: color } });
  item.x = x; item.y = y;
  parent.addChild(item);
  return item;
}

function plant(g: import('pixi.js').Graphics, x: number, y: number) {
  rect(g, x + 7, y + 21, 17, 18, COLOR.pot);
  rect(g, x + 4, y + 18, 23, 5, '#c7936a');
  rect(g, x + 12, y + 7, 7, 15, COLOR.leaf);
  rect(g, x + 1, y + 7, 13, 7, '#5c9481');
  rect(g, x + 18, y + 2, 13, 8, '#5c9481');
  rect(g, x + 5, y, 10, 8, '#3f6c61');
}

function workstation(g: import('pixi.js').Graphics, x: number, y: number, index: number) {
  rect(g, x - 9, y - 14, 162, 128, '#344157');
  rect(g, x - 4, y - 10, 152, 118, index % 2 ? '#40506a' : '#45536b');
  rect(g, x + 3, y + 22, 138, 69, COLOR.woodDark);
  rect(g, x + 3, y + 17, 138, 64, COLOR.wood);
  rect(g, x + 8, y + 21, 128, 7, COLOR.woodLight);
  rect(g, x + 48, y - 5, 46, 36, '#121c2d');
  rect(g, x + 52, y - 1, 38, 27, COLOR.screen);
  rect(g, x + 56, y + 3, 30, 4, '#7295a4');
  rect(g, x + 56, y + 11, 20, 3, '#486b82');
  rect(g, x + 65, y + 31, 12, 8, '#182133');
  rect(g, x + 43, y + 44, 57, 10, '#d1c5ae');
  rect(g, x + 49, y + 47, 45, 4, '#778697');
  rect(g, x + 118, y + 34, 10, 12, '#d9c7a9');
  rect(g, x + 119, y + 32, 8, 3, COLOR.cream);
  rect(g, x + 56, y + 93, 50, 13, '#26344a');
  rect(g, x + 62, y + 106, 38, 13, '#293749');
}

function background(pixi: Pixi, runtime: Runtime) {
  const stage = new pixi.Container();
  const g = new pixi.Graphics();
  rect(g, 0, 0, SIZE.width, SIZE.height, COLOR.wallEdge);
  rect(g, 10, 10, 1100, 630, COLOR.floor);
  for (let row = 0; row < 11; row++) for (let col = 0; col < 19; col++) {
    rect(g, 11 + col * 58, 142 + row * 45, 57, 44, (row + col) % 2 ? COLOR.floor : COLOR.floorAlt);
  }
  rect(g, 10, 10, 1100, 132, COLOR.wall);
  rect(g, 10, 10, 1100, 13, COLOR.wallTop);
  rect(g, 10, 135, 1100, 8, COLOR.wallEdge);
  rect(g, 837, 143, 8, 497, COLOR.wallEdge);
  rect(g, 844, 143, 266, 497, '#354359');
  for (let row = 0; row < 10; row++) for (let col = 0; col < 5; col++) {
    rect(g, 846 + col * 53, 145 + row * 49, 52, 48, (row + col) % 2 ? '#37475d' : '#3b4b62');
  }
  rect(g, 843, 142, 267, 7, COLOR.wallEdge);
  rect(g, 844, 488, 266, 8, COLOR.wallEdge);

  // Windows and evening skyline make the room read as a place, not a chart.
  for (const x of [273, 489, 705]) {
    rect(g, x, 32, 170, 85, '#131e31');
    rect(g, x + 6, 38, 158, 73, '#314562');
    rect(g, x + 8, 73, 158, 38, '#24364f');
    for (let i = 0; i < 7; i++) {
      const height = 13 + ((i * 17 + x) % 24);
      rect(g, x + 10 + i * 22, 111 - height, 17, height, '#1c2b43');
      if (i % 2) rect(g, x + 15 + i * 22, 101 - height, 3, 3, '#e3ae75');
    }
    rect(g, x + 82, 38, 5, 73, '#182439');
    rect(g, x + 6, 109, 158, 5, '#6d7d8c');
  }
  rect(g, 37, 35, 210, 70, '#16243a');
  rect(g, 43, 41, 198, 58, '#24364d');
  rect(g, 43, 41, 6, 58, runtime === 'codex' ? COLOR.teal : COLOR.amber);

  for (let i = 0; i < deskSpots.length; i++) workstation(g, deskSpots[i][0], deskSpots[i][1], i);

  // Break area: sofa, low table, notice board, plants.
  rect(g, 874, 215, 204, 245, COLOR.rug);
  rect(g, 886, 238, 175, 37, '#233750');
  rect(g, 886, 269, 175, 43, '#64788e');
  rect(g, 887, 273, 85, 33, '#7691a2');
  rect(g, 977, 273, 83, 33, '#7691a2');
  rect(g, 903, 374, 135, 35, '#4a3540');
  rect(g, 911, 366, 119, 30, COLOR.wood);
  rect(g, 955, 370, 24, 16, '#dfd4bd');
  rect(g, 896, 62, 172, 58, '#152337');
  rect(g, 901, 67, 162, 48, '#556372');
  rect(g, 920, 74, 3, 32, runtime === 'codex' ? COLOR.teal : COLOR.amber);
  // Exit door, so the gone corner reads as a way out.
  rect(g, 1068, 520, 34, 72, '#1a2638');
  rect(g, 1072, 524, 26, 68, '#5b4636');
  rect(g, 1092, 556, 3, 4, COLOR.amber);
  for (const [x, y] of [[55, 165], [799, 171], [873, 181], [1066, 180], [35, 574]]) plant(g, x, y);
  rect(g, 35, 610, 773, 7, '#243247');
  stage.addChild(g);
  label(pixi, stage, 'AGENT', 64, 52, 21, COLOR.cream, 'bold');
  label(pixi, stage, 'OFFICE', 64, 77, 17, runtime === 'codex' ? COLOR.teal : COLOR.amber, 'bold');
  label(pixi, stage, 'BÀN LÀM VIỆC', 43, 159, 15, COLOR.cream, 'bold');
  label(pixi, stage, 'KHU NGHỈ', 870, 162, 15, COLOR.cream, 'bold');
  label(pixi, stage, 'ĐÃ RỜI / MẤT TÍN HIỆU', 866, 507, 12, COLOR.muted);
  label(pixi, stage, 'CHỈ QUAN SÁT', 932, 80, 12, COLOR.cream, 'bold');
  label(pixi, stage, 'CHỈ HIỂN THỊ DỮ LIỆU QUAN SÁT', 43, 622, 11, COLOR.muted);
  return stage;
}

function drawAvatar(pixi: Pixi, agent: CanvasAgent, selected: boolean, onSelect: (id: string) => void) {
  const key = stableNumber(agent.id);
  const container = new pixi.Container();
  const g = new pixi.Graphics();
  const shirt = SHIRTS[key % SHIRTS.length];
  const hair = HAIR[Math.floor(key / 7) % HAIR.length];
  const skin = SKIN[Math.floor(key / 11) % SKIN.length];
  const status = STATUS[agent.status] ?? STATUS.UNKNOWN;
  rect(g, -15, 27, 38, 6, '#1b283a');
  rect(g, -3, 11, 10, 18, '#263147');
  rect(g, 10, 11, 10, 18, '#263147');
  rect(g, -7, -8, 31, 25, shirt);
  rect(g, -12, -4, 6, 21, shirt);
  rect(g, 24, -4, 6, 21, shirt);
  rect(g, -12, 14, 6, 5, skin);
  rect(g, 24, 14, 6, 5, skin);
  rect(g, -5, -29, 26, 24, skin);
  rect(g, -8, -34, 32, 11, hair);
  rect(g, -9, -27, 5, 12, hair);
  if (key % 3 === 0) rect(g, 19, -27, 5, 10, hair);
  if (key % 4 === 0) rect(g, 0, -38, 18, 6, hair);
  rect(g, 1, -19, 3, 3, '#293343');
  rect(g, 13, -19, 3, 3, '#293343');
  if (agent.type === 'MAIN') {
    rect(g, -10, -37, 36, 6, runtimeAccent(agent));
    rect(g, 2, -41, 12, 5, COLOR.cream);
  }
  if (agent.status === 'WORKING') {
    // Lit monitor behind a working agent: visible proof of current activity.
    rect(g, -9, -88, 38, 27, '#9fd8f0');
    rect(g, -5, -84, 22, 3, '#2d5a78');
    rect(g, -5, -78, 14, 3, '#2d5a78');
    rect(g, -16, 2, 6, 5, skin);
    rect(g, 25, 5, 6, 5, skin);
  }
  if (agent.status === 'WAITING' || agent.status === 'FAILED') {
    rect(g, 24, -28, 6, 24, shirt);
    rect(g, 24, -32, 6, 6, skin);
  }
  container.addChild(g);

  if (agent.status === 'FAILED' || agent.status === 'UNKNOWN') {
    const mark = new pixi.Graphics();
    rect(mark, 18, -57, 25, 24, status.color);
    container.addChild(mark);
    label(pixi, container, agent.status === 'UNKNOWN' ? '?' : '!', 25, -57, 18, '#182236', 'bold');
  }

  // Speech bubble: what the agent is doing, said by the agent itself. Only for states that need eyes.
  const say = agent.status === 'WAITING' ? `! ${agent.doing ?? 'Cần bạn duyệt'}` : agent.status === 'WORKING' ? agent.doing ?? 'Đang suy nghĩ…' : null;
  if (say) {
    const text = new pixi.Text({ text: say.length > 22 ? `${say.slice(0, 21)}…` : say, style: { fontFamily: 'Courier New, monospace', fontSize: 11, fontWeight: 'bold', fill: '#182236' } });
    const w = Math.ceil(text.width) + 14;
    const top = agent.status === 'WORKING' ? -122 : -78;
    const bubble = new pixi.Graphics();
    const fill = agent.status === 'WAITING' ? COLOR.amber : COLOR.cream;
    rect(bubble, 8 - w / 2, top, w, 22, fill);
    rect(bubble, 4, top + 22, 8, 5, fill);
    rect(bubble, 8 - w / 2, top + 22, w, 2, '#0e1625');
    container.addChild(bubble);
    text.x = 15 - w / 2; text.y = top + 4;
    container.addChild(text);
  }

  // Name tag with a status edge and a pixel context meter underneath.
  const name = (agent.displayName ?? (agent.type === 'MAIN' ? 'Agent chính' : 'Trợ lý')).slice(0, 16);
  const width = 104;
  const plate = new pixi.Graphics();
  rect(plate, -44, 37, width, 22, '#152235');
  rect(plate, -44, 37, 4, 22, status.color);
  if (agent.contextTokens != null && agent.contextLimit) {
    const ratio = Math.min(1, agent.contextTokens / agent.contextLimit);
    rect(plate, -40, 59, width - 4, 4, '#0e1625');
    rect(plate, -40, 59, Math.max(2, Math.round((width - 4) * ratio)), 4, ratio >= 0.85 ? '#e0705a' : ratio >= 0.6 ? '#e6c35c' : COLOR.teal);
  }
  if (selected) plate.rect(-47, 34, width + 6, 32).stroke({ color: COLOR.cream, width: 2 });
  container.addChild(plate);
  label(pixi, container, name, -35, 41, 11, COLOR.cream, 'bold');
  container.eventMode = 'static';
  container.cursor = 'pointer';
  container.hitArea = new pixi.Rectangle(-48, -45, width + 8, 112);
  container.on('pointertap', () => onSelect(agent.id));
  if (['STOPPED', 'UNKNOWN', 'COMPLETED'].includes(agent.status)) container.alpha = 0.76;
  return container;
}

function runtimeAccent(agent: OfficeAgent) {
  return agent.type === 'MAIN' ? COLOR.amber : COLOR.teal;
}

export function OfficeCanvas({ agents, selectedId, runtime, onSelect }: {
  agents: CanvasAgent[]; selectedId: string | null; runtime: Runtime; onSelect: (id: string) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const scene = useRef<Scene | null>(null);
  const latest = useRef({ agents, selectedId, onSelect });
  latest.current = { agents, selectedId, onSelect };

  useEffect(() => {
    let disposed = false;
    let app: import('pixi.js').Application | undefined;
    async function mount() {
      const pixi = await import('pixi.js');
      if (disposed || !holder.current) return;
      app = new pixi.Application();
      await app.init({ width: SIZE.width, height: SIZE.height, background: COLOR.wallEdge, antialias: false, resolution: Math.min(window.devicePixelRatio, 2) });
      if (disposed || !holder.current) { app.destroy(true); app = undefined; return; }
      app.canvas.style.width = '100%';
      app.canvas.style.height = 'auto';
      app.canvas.style.display = 'block';
      app.canvas.style.imageRendering = 'pixelated';
      holder.current.appendChild(app.canvas);
      app.stage.addChild(background(pixi, runtime));
      const layer = new pixi.Container();
      app.stage.addChild(layer);
      // gx/gy is where the agent stands on the floor now; x/y is where its zone wants it.
      type Walker = { item: import('pixi.js').Container; x: number; y: number; gx: number; gy: number; status: string };
      const animated: Walker[] = [];
      // Where each agent last stood, so a state change walks it to its new zone instead of teleporting.
      const placed = new Map<string, { x: number; y: number }>();
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
      // Keep the GPU quiet: 30fps while something moves, 4fps when the office is still, none while hidden.
      const ticker = app.ticker;
      ticker.maxFPS = 30;
      const onVisibility = () => { if (document.hidden) ticker.stop(); else ticker.start(); };
      document.addEventListener('visibilitychange', onVisibility);
      onVisibility();
      ticker.add(ticker => {
        const now = performance.now();
        let busy = false;
        const frame = Math.floor(now / 240);
        const step = Math.min(1, 0.08 * ticker.deltaTime);
        for (const e of animated) {
          const walking = !reduced.matches && Math.hypot(e.x - e.gx, e.y - e.gy) > 1;
          if (walking || e.status === 'WORKING' || e.status === 'WAITING') busy = true;
          if (walking) { e.gx += (e.x - e.gx) * step; e.gy += (e.y - e.gy) * step; } else { e.gx = e.x; e.gy = e.y; }
          // Footsteps while walking, a typing bob at the desk, a soft pulse while waiting for approval.
          const bob = reduced.matches ? 0 : walking ? (frame % 2 ? -3 : 0) : e.status === 'WORKING' && frame % 2 ? 2 : 0;
          e.item.x = e.gx; e.item.y = e.gy + bob;
          e.item.alpha = !reduced.matches && e.status === 'WAITING' ? 0.65 + 0.35 * Math.abs(Math.sin(now / 420)) : 1;
        }
        ticker.maxFPS = busy && !reduced.matches ? 30 : 4;
      });
      const paint = (items: CanvasAgent[], selected: string | null) => {
        for (const child of layer.removeChildren()) child.destroy({ children: true });
        animated.length = 0;
        // Zone = observed state: desks for active turns, lounge for resting, exit for gone/unknown.
        // Active agents first so they always get a desk; overflow per zone is summarized, never misplaced.
        const now = Date.now();
        const recent = (a: CanvasAgent) => !!a.lastSeenAt && now - Date.parse(a.lastSeenAt) < LOUNGE_MS;
        const zoneOf = (a: CanvasAgent) => a.status === 'IDLE' || (['COMPLETED', 'STOPPED'].includes(a.status) && a.type === 'SUBAGENT' && recent(a)) ? 'lounge'
          : ['STOPPED', 'COMPLETED', 'UNKNOWN', 'FAILED'].includes(a.status) ? 'exit' : 'desk';
        const spots = { desk: deskSpots, lounge: loungeSpots, exit: exitSpots } as const;
        const used = { desk: 0, lounge: 0, exit: 0 };
        const hidden = { desk: 0, lounge: 0, exit: 0 };
        const ordered = [...items].sort((a, b) => (a.id === selected ? -1 : b.id === selected ? 1 : 0) || (a.type === 'MAIN' ? -1 : b.type === 'MAIN' ? 1 : 0));
        for (const agent of ordered) {
          const zone = zoneOf(agent);
          if (used[zone] >= spots[zone].length) { hidden[zone]++; continue; }
          const spot = spots[zone][used[zone]++];
          const atDesk = zone === 'desk';
          const item = drawAvatar(pixi, agent, agent.id === selected, id => latest.current.onSelect(id));
          const x = spot[0] + (atDesk ? 56 : 0);
          const y = spot[1] + (atDesk ? 87 : 0);
          // Newcomers enter through the door on the right; known agents start where they stood.
          const from = placed.get(agent.id) ?? { x: SIZE.width - 60, y: y };
          item.x = from.x; item.y = from.y;
          placed.set(agent.id, { x, y });
          layer.addChild(item);
          animated.push({ item, x, y, gx: from.x, gy: from.y, status: agent.status });
        }
        const overflow: Array<[keyof typeof hidden, number, number]> = [['desk', 700, 600], ['lounge', 1000, 160], ['exit', 1030, 600]];
        for (const [zone, x, y] of overflow) if (hidden[zone]) {
          const tag = new pixi.Container();
          const bg = new pixi.Graphics();
          rect(bg, 0, 0, 70, 22, '#152235');
          tag.addChild(bg);
          label(pixi, tag, `+${hidden[zone]} agent`, 6, 4, 11, COLOR.cream, 'bold');
          tag.x = x; tag.y = y;
          layer.addChild(tag);
        }
      };
      scene.current = { paint, destroy: () => { document.removeEventListener('visibilitychange', onVisibility); app?.destroy(true); } };
      paint(latest.current.agents, latest.current.selectedId);
    }
    void mount().catch(() => {});
    return () => {
      disposed = true;
      scene.current?.destroy();
      scene.current = null;
    };
  }, [runtime]);

  useEffect(() => { scene.current?.paint(agents, selectedId); }, [agents, selectedId]);
  return <div ref={holder} className="office-canvas" aria-hidden="true" />;
}
