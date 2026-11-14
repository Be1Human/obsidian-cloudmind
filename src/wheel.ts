/**
 * 平滑的滚轮 / 触控板处理，替换 simple-mind-map 自带的实现。
 *
 * 库自带实现的问题：
 *  1. 判断“触控板”的条件是 |deltaY| <= 10。Windows 精密触控板单个事件经常 > 10，会被当成鼠标滚轮，
 *     每个事件固定平移 100px，触控板一秒几十个事件，画面一大步一大步地跳。
 *  2. 鼠标滚轮每一格直接瞬移 100px，没有过渡；Ctrl+滚轮缩放是线性 ±0.2，缩小时一格就减掉一半。
 *
 * 这里的做法：
 *  - 按事件真实的滑动距离平移（兼容按行 / 按页滚动的 deltaMode），触控板跟手；
 *  - 同一帧内的多个事件合并成一次更新，一帧最多触发一次重绘；
 *  - 鼠标滚轮的“一格”用缓动分摊到几帧里；
 *  - 缩放按对数连续变化，围绕鼠标位置，同样每帧合并 + 缓动。
 */

interface ViewLike {
  scale: number;
  translateXY(x: number, y: number): void;
  setScale(scale: number, cx?: number, cy?: number): void;
}

interface MindMapLike {
  view: ViewLike;
  opt: { minZoomRatio?: number; maxZoomRatio?: number };
  toPos(x: number, y: number): { x: number; y: number };
  height: number;
}

const LINE_PX = 40;
/** 缩放灵敏度：deltaY=100（鼠标滚轮一格）约放大/缩小 15% */
const ZOOM_K = 0.0015;

export class SmoothWheel {
  private px = 0; // 待平移（屏幕像素，已取反：正数 = 内容向右/下移）
  private py = 0;
  private zoomLog = 0; // 待缩放（对数）
  private zx = 0;
  private zy = 0;
  private smooth = false;
  private raf = 0;

  constructor(private getMM: () => MindMapLike | null) {}

  /** 作为 simple-mind-map 的 customHandleMousewheel 使用 */
  handle = (e: WheelEvent) => {
    const mm = this.getMM();
    if (!mm) return;

    const unit = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? mm.height : 1;
    let dx = e.deltaX * unit;
    let dy = e.deltaY * unit;

    // 一格一格的鼠标滚轮：整数、较大、没有横向分量；其余视为触控板的连续滑动
    const discrete = e.deltaMode !== 0 || (Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY) && e.deltaX === 0);

    if (e.ctrlKey || e.metaKey) {
      // 缩放（含触控板双指捏合：浏览器会带 ctrlKey）
      const p = mm.toPos(e.clientX, e.clientY);
      this.zx = p.x;
      this.zy = p.y;
      this.zoomLog += -Math.max(-300, Math.min(300, dy)) * ZOOM_K;
      this.smooth = this.smooth || discrete;
    } else {
      if (e.shiftKey && dx === 0) {
        dx = dy;
        dy = 0;
      }
      // 内容跟着手指方向走：向下滚（deltaY>0）内容上移
      this.px += -dx;
      this.py += -dy;
      this.smooth = this.smooth || discrete;
    }
    this.schedule();
  };

  cancel() {
    if (this.raf) window.cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.px = this.py = this.zoomLog = 0;
    this.smooth = false;
  }

  private schedule() {
    if (this.raf) return;
    this.raf = window.requestAnimationFrame(this.tick);
  }

  private tick = () => {
    this.raf = 0;
    const mm = this.getMM();
    if (!mm) return this.cancel();
    const v = mm.view;

    // 平移
    let mx = 0;
    let my = 0;
    if (this.px !== 0 || this.py !== 0) {
      if (this.smooth) {
        mx = this.ease(this.px);
        my = this.ease(this.py);
      } else {
        mx = this.px;
        my = this.py;
      }
      this.px -= mx;
      this.py -= my;
      if (Math.abs(this.px) < 0.4) this.px = 0;
      if (Math.abs(this.py) < 0.4) this.py = 0;
    }

    // 缩放
    let dz = 0;
    if (this.zoomLog !== 0) {
      dz = this.smooth ? this.ease(this.zoomLog, 0.3, 0.002) : this.zoomLog;
      this.zoomLog -= dz;
      if (Math.abs(this.zoomLog) < 0.002) this.zoomLog = 0;
    }

    // 一帧最多各应用一次，避免重复触发重绘
    if (dz !== 0) {
      const min = (mm.opt.minZoomRatio ?? 20) / 100;
      const max = (mm.opt.maxZoomRatio ?? 400) / 100;
      const next = Math.max(min, Math.min(max, v.scale * Math.exp(dz)));
      if (next !== v.scale) v.setScale(next, this.zx, this.zy);
    }
    if (mx !== 0 || my !== 0) v.translateXY(mx, my);

    if (this.px !== 0 || this.py !== 0 || this.zoomLog !== 0) this.schedule();
    else this.smooth = false;
  };

  /** 每帧走剩余距离的一部分，至少走 minStep，直到走完 */
  private ease(remaining: number, rate = 0.3, minStep = 1.5): number {
    const abs = Math.abs(remaining);
    if (abs <= minStep) return remaining;
    return Math.sign(remaining) * Math.max(minStep, abs * rate);
  }
}
