import type { Lane, Tier } from '../types';
import { TIERS } from '../types';
import { TIER_COLOR } from '../theme';
import { todayLabel, type GameLanes } from './format';

/**
 * Renders the lane assignment as a PNG for the clipboard or a share sheet.
 *
 * Drawn straight onto a canvas rather than screenshotting the DOM: a
 * html-to-canvas library is a large dependency, and it would capture the sheet
 * at whatever size the phone happens to be. This produces the same card at the
 * same size every time, wide enough to stay legible when a chat app scales it
 * down in a thread.
 */

/** Card geometry, in CSS px before the device-pixel-ratio upscale. */
const W = 720;
const PAD = 40;
const HEAD_H = 116;
const ROW_H = 74;
/** Taller than the 9FRAME line alone, to seat the tier legend beside it. */
const FOOT_H = 62;

/** Tier dot before each name, and the swatches in the legend. */
const DOT_R = 5;
/** Gap between a dot and its name, and between one name and the next dot. */
const DOT_GAP = 9;
const NAME_GAP = 20;

/*
 * 다크 팔레트 — 공유 팝업(#14161a)과 같은 결. 채팅앱 말풍선은 대개 밝은
 * 바탕이라, 어두운 카드가 스레드 안에서 한 덩어리로 또렷하게 떨어진다.
 * 캔버스에는 투명도를 겹칠 배경이 없으므로 앱의 rgba 대신 불투명 색을 쓴다.
 */
const INK = '#ffffff';
const MUTED = '#9aa2ad';
const ACCENT = '#ff4a21';
const SURFACE = '#1b1f26';
const BG = '#0f1115';

/**
 * The stack the app itself renders in. Named families only — a canvas cannot
 * wait for a webfont, so this has to be something already on the device.
 */
const FONT = '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

const font = (size: number, weight: number) => `${weight} ${size}px ${FONT}`;

/** Rounded rect — `roundRect` is recent enough to still need a fallback. */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, tier: Tier): void {
  ctx.fillStyle = TIER_COLOR[tier];
  ctx.beginPath();
  ctx.arc(x, y, DOT_R, 0, Math.PI * 2);
  ctx.fill();
}

/** Heading above each game's block when more than one is drawn. */
const GAME_HEAD_H = 42;

/**
 * Draws the card and hands back a PNG blob.
 *
 * Takes a list of games so a whole night's 기록 shares as one image: several
 * separate PNGs would arrive in a chat out of order, and the reader wants to
 * compare the games anyway. A single game is just a list of one.
 *
 * Rejects when the browser gives no 2d context or refuses to encode — callers
 * fall back to the text share rather than failing silently.
 */
export async function laneImageBlob(games: readonly GameLanes[]): Promise<Blob> {
  const multi = games.length > 1;
  const laneRows = games.reduce((n, g) => n + g.lanes.length, 0);
  const height =
    HEAD_H + laneRows * ROW_H + (multi ? games.length * GAME_HEAD_H : 0) + FOOT_H;
  const scale = Math.min(3, Math.max(2, Math.round(window.devicePixelRatio || 1)));

  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이미지를 만들 수 없어요');
  ctx.scale(scale, scale);
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, height);

  // ── Header ──
  ctx.fillStyle = INK;
  ctx.font = font(34, 800);
  ctx.fillText(
    multi ? '레인 배정 기록' : `GAME ${games[0]?.game ?? 1} 레인 배정`,
    PAD,
    62,
  );
  ctx.fillStyle = MUTED;
  ctx.font = font(20, 600);
  ctx.fillText(
    multi
      ? `${todayLabel()} 정기모임 · ${games.length}게임`
      : `${todayLabel()} 정기모임 · ${games[0]?.lanes.length ?? 0}레인`,
    PAD,
    92,
  );

  // ── One card per lane, grouped by game ──
  let y = HEAD_H;
  for (const { game, lanes } of games) {
    if (multi) {
      ctx.fillStyle = INK;
      ctx.font = font(22, 800);
      ctx.fillText(`GAME ${game}`, PAD, y + 26);
      ctx.fillStyle = MUTED;
      ctx.font = font(16, 700);
      ctx.textAlign = 'right';
      ctx.fillText(`${lanes.length}레인 · ${lanes.reduce((n, l) => n + l.members.length, 0)}명`, W - PAD, y + 26);
      ctx.textAlign = 'left';
      y += GAME_HEAD_H;
    }
    y = drawLanes(ctx, lanes, y);
  }

  drawFooter(ctx, height);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('이미지 변환에 실패했어요'))),
      'image/png',
    );
  });
}

/** Draws one game's lane cards from `top`, returning the y it finished at. */
function drawLanes(
  ctx: CanvasRenderingContext2D,
  lanes: readonly Lane[],
  top: number,
): number {
  lanes.forEach((lane, i) => {
    const y = top + i * ROW_H;
    const h = ROW_H - 10;

    ctx.fillStyle = SURFACE;
    roundRect(ctx, PAD, y, W - PAD * 2, h, 16);
    ctx.fill();

    // Lane number in an accent block, so the eye can jump to a lane.
    ctx.fillStyle = ACCENT;
    roundRect(ctx, PAD + 10, y + 10, 84, h - 20, 11);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = font(24, 800);
    ctx.textAlign = 'center';
    ctx.fillText(`${lane.no}번`, PAD + 10 + 42, y + h / 2 + 9);
    ctx.textAlign = 'left';

    /*
     * Names one at a time, each behind its tier dot — a single joined string
     * would give the whole lane one colour and lose which tier each player is.
     * The colours match the app's tier accents, decoded by the legend below.
     */
    ctx.font = font(23, 700);
    const mid = y + h / 2;
    let x = PAD + 110;
    const namesRight = W - PAD - 110;
    for (const m of lane.members) {
      const width = ctx.measureText(m.name).width;
      // Out of room — say how many are left rather than drawing over the AVG.
      if (x + DOT_R + DOT_GAP + width > namesRight) {
        ctx.fillStyle = MUTED;
        ctx.fillText(`+${lane.members.length - lane.members.indexOf(m)}`, x, mid + 8);
        break;
      }
      dot(ctx, x + DOT_R, mid - 1, m.tier);
      ctx.fillStyle = INK;
      ctx.fillText(m.name, x + DOT_R * 2 + DOT_GAP, mid + 8);
      x += DOT_R * 2 + DOT_GAP + width + NAME_GAP;
    }

    ctx.fillStyle = MUTED;
    ctx.font = font(19, 700);
    ctx.textAlign = 'right';
    ctx.fillText(`AVG ${lane.avg}`, W - PAD - 14, y + h / 2 + 7);
    ctx.textAlign = 'left';
  });
  return top + lanes.length * ROW_H;
}

/** Tier legend and the mark, along the bottom. */
function drawFooter(ctx: CanvasRenderingContext2D, height: number): void {
  ctx.font = font(17, 700);
  let lx = PAD;
  for (const t of TIERS) {
    dot(ctx, lx + DOT_R, height - 26, t);
    ctx.fillStyle = MUTED;
    const label = `${t}티어`;
    ctx.fillText(label, lx + DOT_R * 2 + 6, height - 20);
    lx += DOT_R * 2 + 6 + ctx.measureText(label).width + 16;
  }

  ctx.fillStyle = MUTED;
  ctx.font = font(17, 600);
  ctx.textAlign = 'right';
  ctx.fillText('9FRAME', W - PAD, height - 20);
  ctx.textAlign = 'left';
}

export type ImageShareResult = 'copied' | 'shared' | 'downloaded';

/**
 * Puts the card wherever this browser will take it.
 *
 * Clipboard images first, since 복사 is what was asked for. Phones often refuse
 * that but do support sharing a file, and everything else gets a download —
 * three different capabilities, so the caller is told which one happened rather
 * than being left to guess what the user should look for.
 */
export async function shareLaneImage(games: readonly GameLanes[]): Promise<ImageShareResult> {
  const blob = await laneImageBlob(games);
  const name =
    games.length === 1 ? `game${games[0]!.game}-lanes.png` : 'lanes.png';

  if (typeof ClipboardItem === 'function' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return 'copied';
    } catch {
      // Safari needs the write inside the click gesture, Firefox refuses images.
    }
  }

  const file = new File([blob], name, { type: 'image/png' });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      const title =
        games.length === 1 ? `GAME ${games[0]!.game} 레인 배정` : '레인 배정 기록';
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      // A cancelled share is the user's decision — do not then download a file.
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  return 'downloaded';
}
