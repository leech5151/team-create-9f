import {
  avgLabel,
  periodMonths,
  periodRange,
  type RegistryMember,
  type SheetPeriod,
} from '../meetup/registry';
import {
  HIGH_AVG,
  HIGH_COLOR,
  ICON_PATHS,
  LEGEND_FIRST_ROW,
  RANKS,
  gamesLabel,
  rangeLabel,
  rankOf,
  scored,
  type Rank,
} from '../meetup/ranks';
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

const BADGE_H = 24;
const LEGEND_ROW_H = 32;
const LEGEND_GAP = 16;

/** Pill width for `rank` — icon, label, padding. Needs the badge font set. */
const badgeWidth = (ctx: CanvasRenderingContext2D, rank: Rank) =>
  8 + 13 + 4 + ctx.measureText(rank.label).width + 10;

/** Icon-and-label pill, vertically centred on `mid`; returns its width. */
function drawBadge(ctx: CanvasRenderingContext2D, rank: Rank, x: number, mid: number): number {
  ctx.font = font(13, 800);
  ctx.textBaseline = 'middle';
  const bw = badgeWidth(ctx, rank);
  ctx.fillStyle = `${rank.color}1F`;
  pill(ctx, x, mid - BADGE_H / 2, bw, BADGE_H);
  ctx.fill();
  ctx.save();
  ctx.translate(x + 8, mid - 6.5);
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
  ctx.fillText(rank.label, x + 8 + 13 + 4, mid + 0.5);
  return bw;
}

interface LegendItem {
  rank: Rank;
  range: string;
  x: number;
  row: number;
}

/** 등급 기준표 — 챌린저~플래티넘 한 줄, 골드~브론즈 한 줄. */
function layoutLegend(ctx: CanvasRenderingContext2D): LegendItem[] {
  const out: LegendItem[] = [];
  let x = PAD;
  RANKS.forEach((rank, i) => {
    if (i === LEGEND_FIRST_ROW) x = PAD;
    const range = rangeLabel(i);
    ctx.font = font(13, 800);
    const bw = badgeWidth(ctx, rank);
    ctx.font = font(13, 700);
    out.push({ rank, range, x, row: i < LEGEND_FIRST_ROW ? 0 : 1 });
    x += bw + 5 + ctx.measureText(range).width + LEGEND_GAP;
  });
  return out;
}

/** `ranked` must already be in 점수관리 order. */
export async function scoreImageBlob(
  ranked: readonly RegistryMember[],
  period: SheetPeriod | null,
): Promise<Blob> {
  const perCol = Math.ceil(ranked.length / 2);
  // 캔버스 크기를 정하기 전에 기준표가 몇 줄인지 재 둔다.
  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) throw new Error('이미지를 만들 수 없어요');
  const legend = layoutLegend(measure);
  const legendH = (Math.max(...legend.map((l) => l.row)) + 1) * LEGEND_ROW_H + 14;
  const top = HEAD_H + legendH;
  const height = top + Math.max(1, perCol) * ROW_H + FOOT_H;
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
    [
      todayLabel(),
      `회원 ${ranked.length}명`,
      period ? `최근 ${periodMonths(period)}개월 평균 (${periodRange(period)})` : '게임 평균',
    ].join(' · '),
    PAD,
    90,
  );

  for (const { rank, range, x, row } of legend) {
    const mid = HEAD_H - 4 + row * LEGEND_ROW_H + LEGEND_ROW_H / 2;
    const bw = drawBadge(ctx, rank, x, mid);
    ctx.fillStyle = MUTED;
    ctx.font = font(13, 700);
    ctx.fillText(range, x + bw + 5, mid + 0.5);
  }
  ctx.textBaseline = 'alphabetic';

  const colW = (W - PAD * 2 - COL_GAP) / 2;

  if (ranked.length > perCol) {
    const lineX = PAD + colW + COL_GAP / 2;
    ctx.strokeStyle = DIVIDER;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(lineX, top - 8);
    ctx.lineTo(lineX, top + perCol * ROW_H);
    ctx.stroke();
  }
  ranked.forEach((m, i) => {
    const col = i < perCol ? 0 : 1;
    const x = PAD + col * (colW + COL_GAP);
    const y = top + (i % perCol) * ROW_H;
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
      drawBadge(ctx, rank, x + colW - 56 - badgeWidth(ctx, rank), mid);
      ctx.textBaseline = 'middle';
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
export async function downloadScoreImage(
  ranked: readonly RegistryMember[],
  period: SheetPeriod | null,
): Promise<void> {
  const blob = await scoreImageBlob(ranked, period);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `scores-${new Date().toISOString().slice(0, 10)}.png`;
  a.click();
  // 일부 브라우저는 클릭 직후 해제하면 저장이 끊긴다.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
