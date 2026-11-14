/**
 * 拖拽换位置更灵敏。
 *
 * simple-mind-map 自带的拖拽判定有三个问题：
 *  1. 判定 300ms 才算一次，松手时也不重算，拖到位后很快松手用的是旧位置；
 *  2. “插到某节点上面 / 下面”只认节点之间的缝隙（小于 10px 视为没有）或节点边缘 1/4，
 *     节点中间大部分区域都会被当成“成为它的子节点”；
 *  3. 鼠标横向必须正好落在目标节点的宽度内，短节点很难对准。
 *
 * 这里替换“判定落点”这一步：
 *  - 逻辑图（左右）和思维导图结构：用更宽的感应区自己选出目标节点和位置（上 / 下 / 子节点），
 *    再构造一个落在库的判定区内的坐标，调用库原来的判定，让库自己画占位框、执行插入。
 *  - 其它结构保持库的规则，只是判定更及时。
 */

type Zone = "before" | "after" | "child";

/** 使用新规则的结构（兄弟节点上下排列） */
const VERTICAL_LAYOUTS = new Set(["logicalStructure", "logicalStructureLeft", "mindMap"]);

/** 横向容差（屏幕像素）：鼠标在节点左右这个范围内都算对准 */
const X_TOLERANCE = 56;
/** 节点上 / 下各多少比例算“插到上面 / 下面”，中间算“作为子节点” */
const EDGE_RATIO = 0.3;

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function siblingsOf(drag: any, node: any, layout: string): any[] {
  if (!node.parent) return [];
  return node.parent.children.filter((item: any) => {
    if (layout === "mindMap" && node.layerIndex === 1 && item.dir !== node.dir) return false;
    return !drag.checkIsInBeingDragNodeList(item);
  });
}

/** 选出落点：目标节点 + 位置。找不到返回 null */
export function pickDropTarget(drag: any, layout: string): { node: any; zone: Zone } | null {
  const x: number = drag.mouseMoveX;
  const y: number = drag.mouseMoveY;
  const scale: number = drag.drawTransform?.scaleY ?? 1;
  let best: { node: any; zone: Zone; score: number } | null = null;

  for (const node of drag.nodeList as any[]) {
    if (node.isGeneralization) continue;
    const r: Rect = drag.getNodeRect(node);
    const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
    if (dx > X_TOLERANCE) continue;
    const h = r.bottom - r.top;

    let top = r.top;
    let bottom = r.bottom;
    if (!node.isRoot) {
      // 向上 / 向下各延伸到与相邻兄弟节点的一半间距；没有相邻兄弟时延伸一段固定距离
      const sibs = siblingsOf(drag, node, layout);
      const i = sibs.indexOf(node);
      const free = Math.max(18 * scale, Math.min(h * 0.6, 28 * scale));
      const prev = i > 0 ? (drag.getNodeRect(sibs[i - 1]) as Rect) : null;
      const next = i >= 0 && i < sibs.length - 1 ? (drag.getNodeRect(sibs[i + 1]) as Rect) : null;
      top -= prev ? Math.max(0, (r.top - prev.bottom) / 2) : free;
      bottom += next ? Math.max(0, (next.top - r.bottom) / 2) : free;
    }
    if (y < top || y > bottom) continue;

    let zone: Zone = "child";
    if (!node.isRoot) {
      const band = Math.max(h * EDGE_RATIO, 5);
      if (y < r.top + band) zone = "before";
      else if (y > r.bottom - band) zone = "after";
    }
    const cy = (r.top + r.bottom) / 2;
    // 横向对准优先，其次离节点中心近
    const score = dx * 4 + Math.abs(y - cy);
    if (!best || score < best.score) best = { node, zone, score };
  }
  return best ? { node: best.node, zone: best.zone } : null;
}

/** 把选好的落点换成库能识别的坐标（落在库自己的判定区里） */
function syntheticPoint(drag: any, layout: string, node: any, zone: Zone): { x: number; y: number } {
  const r: Rect = drag.getNodeRect(node);
  const cx = (r.left + r.right) / 2;
  const h = r.bottom - r.top;
  if (zone === "child") return { x: cx, y: (r.top + r.bottom) / 2 };
  const { prevBrotherOffset, nextBrotherOffset } = drag.getNodeDistanceToSiblingNode(siblingsOf(drag, node, layout), node, r, "v");
  if (zone === "before") return { x: cx, y: prevBrotherOffset > 0 ? r.top - prevBrotherOffset / 2 : r.top + h / 8 };
  return { x: cx, y: nextBrotherOffset > 0 ? r.bottom + nextBrotherOffset / 2 : r.bottom - h / 8 };
}

/** 安装到 Drag 插件的原型上（全局只需一次） */
export function improveDrag(Drag: any) {
  // 仅供测试对比修复前的行为
  if ((window as unknown as { __CM_DRAG_LEGACY?: boolean }).__CM_DRAG_LEGACY) return;
  const proto = Drag.prototype;
  if (proto.__cmImproved) return;
  proto.__cmImproved = true;
  const origCheck = proto.checkOverlapNode;
  const origBind = proto.bindEvent;
  const origMouseup = proto.onMouseup;

  /** 立即判定一次落点 */
  proto.cmCheckNow = function (this: any) {
    if (!this.drawTransform || !this.placeholder || !this.nodeList) return;
    const layout: string = this.mindMap.opt.layout;
    if (!VERTICAL_LAYOUTS.has(layout)) return origCheck.call(this);
    const pick = pickDropTarget(this, layout);
    const mx = this.mouseMoveX;
    const my = this.mouseMoveY;
    if (pick) {
      const p = syntheticPoint(this, layout, pick.node, pick.zone);
      this.mouseMoveX = p.x;
      this.mouseMoveY = p.y;
    } else {
      // 没对准任何节点：放到画布外，库会清掉占位框
      this.mouseMoveX = -1e6;
      this.mouseMoveY = -1e6;
    }
    try {
      origCheck.call(this);
    } finally {
      this.mouseMoveX = mx;
      this.mouseMoveY = my;
    }
    // 极少数情况下库的判定区和我们选的不一致：以我们选的为准，保证松手后放到预期的位置
    if (pick) {
      const want = pick.zone;
      const got = this.overlapNode === pick.node ? "child" : this.prevNode === pick.node ? "after" : this.nextNode === pick.node ? "before" : null;
      if (got !== want) {
        this.overlapNode = want === "child" ? pick.node : null;
        this.prevNode = want === "after" ? pick.node : null;
        this.nextNode = want === "before" ? pick.node : null;
      }
    }
    this.cmLastPick = pick;
  };

  proto.bindEvent = function (this: any) {
    origBind.call(this);
    // 原来是 300ms 节流；改成每帧最多判定一次
    let raf = 0;
    this.checkOverlapNode = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        if (this.isDragging) this.cmCheckNow();
      });
    };
  };

  proto.onMouseup = function (this: any, e: MouseEvent) {
    // 松手时按最终位置再判定一次
    if (this.isMousedown && this.isDragging) {
      try {
        const { x, y } = this.mindMap.toPos(e.clientX, e.clientY);
        this.mouseMoveX = x;
        this.mouseMoveY = y;
        this.drawTransform = this.mindMap.draw.transform();
        this.cmCheckNow();
      } catch {
        /* 判定失败时沿用拖动过程中的结果 */
      }
    }
    return origMouseup.call(this, e);
  };
}
