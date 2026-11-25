import { MAPS } from '../../../shared/maps/index';
import type { MapId } from '../../../shared/types';
import type { MinimapBlip } from '../../engine/engineTypes';

/**
 * Minimap (seen from above): a few landmarks of the room and one blip per plane — our own as a
 * yellow arrow pointing where we fly, the others as dots in their team colour.
 */
export function drawMinimap(canvas: HTMLCanvasElement, mapId: MapId, blips: readonly MinimapBlip[]): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const activeMap = MAPS[mapId] ?? MAPS.desk;
  ctx.clearRect(0, 0, w, h);

  // Floor backdrop per map
  ctx.fillStyle = mapId === 'garden' ? '#14532D' : '#0F172A';
  ctx.fillRect(0, 0, w, h);

  const hb = activeMap.hardBounds;
  const toMx = (wx: number) => ((wx - hb.minX) / (hb.maxX - hb.minX)) * w;
  const toMy = (wz: number) => ((wz - hb.minZ) / (hb.maxZ - hb.minZ)) * h;

  if (mapId === 'kitchen') {
    ctx.fillStyle = '#334155';
    ctx.fillRect(toMx(-225), toMy(-182), toMx(110) - toMx(-225), toMy(-102) - toMy(-182));
    ctx.fillRect(toMx(-94), toMy(10), toMx(94) - toMx(-94), toMy(78) - toMy(10));
    ctx.fillStyle = '#E0F2FE';
    ctx.fillRect(toMx(158), toMy(-178), toMx(244) - toMx(158), toMy(-92) - toMy(-178));
    // Stove heat & Blender hazard markers
    ctx.fillStyle = '#FB923C';
    ctx.beginPath();
    ctx.arc(toMx(8), toMy(-142), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.arc(toMx(44), toMy(44), 4.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (mapId === 'garden') {
    ctx.fillStyle = '#D97706';
    ctx.fillRect(toMx(-164), toMy(-138), toMx(-96) - toMx(-164), toMy(-68) - toMy(-138));
    ctx.fillStyle = '#FDE68A';
    ctx.fillRect(toMx(-185), toMy(55), toMx(-85) - toMx(-185), toMy(145) - toMy(55));
    ctx.fillStyle = '#38BDF8';
    ctx.beginPath();
    ctx.arc(toMx(18), toMy(18), 4.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#92400E';
    ctx.fillRect(toMx(-195), toMy(-120), toMx(145) - toMx(-195), toMy(35) - toMy(-120));
    ctx.strokeStyle = '#FDE68A';
    ctx.lineWidth = 1;
    ctx.strokeRect(toMx(-195), toMy(-120), toMx(145) - toMx(-195), toMy(35) - toMy(-120));
  }

  // Blips
  for (const b of blips) {
    ctx.save();
    ctx.translate(toMx(b.x), toMy(b.z));
    ctx.rotate(-b.yaw);
    ctx.beginPath();
    if (b.isLocal) {
      ctx.fillStyle = '#FACC15';
      ctx.moveTo(0, -6);
      ctx.lineTo(4.5, 5);
      ctx.lineTo(-4.5, 5);
    } else {
      ctx.fillStyle = b.team === 'red' ? '#EF4444' : b.team === 'blue' ? '#38BDF8' : '#FB7185';
      ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
