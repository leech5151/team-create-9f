import { RECENT_GAMES, avgLabel, type RegistryMember } from '../meetup/registry';
import { HIGH_AVG, HIGH_COLOR, ICON_PATHS, gamesLabel, rankOf, scored } from '../meetup/ranks';
import { todayLabel } from './format';

/**
 * 점수관리 전체 목록을 PNG 한 장으로.
 *
 * 260명을 한 줄로 세우면 휴대폰에서 끝없이 길어지므로 두 단으로 나눈다.
 * 공유 이미지와 같은 이유로 DOM 캡처 대신 캔버스에 직접 그린다.
 */

const W = 860;
const PAD = 28;
/** 두 단 사이 — 가운데에 세로 구분선을 긋는다. */
const COL_GAP = 44;
const HEAD_H = 120;
const ROW_H = 40;
const FOOT_H = 48;

const INK = '#14161a';
const MUTED = '#8a8f98';
const LINE = '#ecebe7';
const DIVIDER = '#d6d4cf';
const BG = '#ffffff';

/** iOS Safari 는 캔버스 면적이 약 16.7M 픽셀을 넘으면 그리지 않는다. */
const MAX_PIXELS = 16_000_000;

const FONT =
  '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const font = (size: number, weight: number) => `${weight} ${size}px ${FONT}`;

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** `ranked` must already be in 점수관리 order. */
export async function scoreImageBlob(ranked: readonly RegistryMember[]): Promise<Blob> {
  const perCol = Math.ceil(ranked.length / 2);
  const height = HEAD_H + Math.max(1, perCol) * ROW_H + FOOT_H;
  const scale = Math.min(2, Math.sqrt(MAX_PIXELS / (W * height)));

  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(W * scale);
  canvas.height = Math.floor(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이미지를 만들 수 없어요');
  ctx.scale(scale, scale);

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, height);

  ctx.fillStyle = INK;
  ctx.font = font(34, 800);
  ctx.fillText('회원 점수', PAD, 58);
  ctx.fillStyle = MUTED;
  ctx.font = font(18, 600);
  ctx.fillText(
    `${todayLabel()} · 회원 ${ranked.length}명 · 최근 ${RECENT_GAMES}게임 평균`,
    PAD,
    90,
  );

  const colW = (W - PAD * 2 - COL_GAP) / 2;

  if (ranked.length > perCol) {
    const lineX = PAD + colW + COL_GAP / 2;
    ctx.strokeStyle = DIVIDER;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(lineX, HEAD_H - 8);
    ctx.lineTo(lineX, HEAD_H + perCol * ROW_H);
    ctx.stroke();
  }
  ranked.forEach((m, i) => {
    const col = i < perCol ? 0 : 1;
    const x = PAD + col * (colW + COL_GAP);
    const y = HEAD_H + (i % perCol) * ROW_H;
    const mid = y + ROW_H / 2;
    const has = scored(m);

    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + ROW_H - 0.5);
    ctx.lineTo(x + colW, y + ROW_H - 0.5);
    ctx.stroke();

    ctx.textBaseline = 'middle';
    ctx.fillStyle = MUTED;
    ctx.font = font(14, 700);
    ctx.fillText(has ? String(i + 1) : '', x, mid);

    ctx.fillStyle = INK;
    ctx.font = font(17, 700);
    const name = m.name;
    ctx.fillText(name, x + 30, mid);
    const nameW = ctx.measureText(name).width;
    ctx.fillStyle = MUTED;
    ctx.font = font(12, 600);
    ctx.fillText(gamesLabel(m), x + 30 + nameW + 6, mid + 1);

    // 등급 뱃지 — 화면처럼 단의 가운데쯤.
    if (has) {
      const rank = rankOf(m.avg);
      ctx.font = font(13, 800);
      const labelW = ctx.measureText(rank.label).width;
      const bw = 8 + 13 + 4 + labelW + 10;
      const bx = x + colW - 56 - bw;
      ctx.fillStyle = `${rank.color}1F`;
      pill(ctx, bx, mid - 12, bw, 24);
      ctx.fill();
      ctx.save();
      ctx.translate(bx + 8, mid - 6.5);
      ctx.scale(13 / 16, 13 / 16);
      ctx.fillStyle = rank.color;
      ctx.strokeStyle = rank.color;
      const path = new Path2D(ICON_PATHS[rank.icon]);
      ctx.fill(path);
      if (rank.icon === 'gem') {
        ctx.lineWidth = 0.8;
        ctx.stroke(path);
      }
      ctx.restore();
      ctx.fillStyle = rank.color;
      ctx.fillText(rank.label, bx + 8 + 13 + 4, mid + 0.5);
    }

    ctx.textAlign = 'right';
    ctx.fillStyle = has && m.avg >= HIGH_AVG ? HIGH_COLOR : INK;
    ctx.font = font(17, 800);
    ctx.fillText(has ? avgLabel(m.avg) : '–', x + colW, mid);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  });

  ctx.fillStyle = MUTED;
  ctx.font = font(15, 600);
  ctx.textAlign = 'right';
  ctx.fillText('9FRAME', W - PAD, height - 18);
  ctx.textAlign = 'left';

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('이미지 변환에 실패했어요'))),
      'image/png',
    );
  });
}

/** Saves the PNG as a file — `scores-2026-10-28.png`. */
export async function downloadScoreImage(ranked: readonly RegistryMember[]): Promise<void> {
  const blob = await scoreImageBlob(ranked);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `scores-${new Date().toISOString().slice(0, 10)}.png`;
  a.click();
  // 일부 브라우저는 클릭 직후 해제하면 저장이 끊긴다.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
