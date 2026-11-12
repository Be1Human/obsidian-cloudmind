export type ToolbarPos = "top" | "bottom" | "left" | "right" | "float" | "hidden";

export interface CloudMindSettings {
  /** 工具栏位置：四边停靠 / 悬浮可拖动 / 隐藏 */
  toolbarPos: ToolbarPos;
  /** 隐藏之前的位置，用来“显示工具栏”时恢复 */
  lastDock: Exclude<ToolbarPos, "hidden">;
  /** 悬浮工具栏在画布中的位置（像素），null = 顶部居中 */
  floatPos: { x: number; y: number } | null;
  /** 图标大小 */
  toolbarSize: "compact" | "normal";
  /** 工具栏按钮是否显示文字 */
  toolbarLabels: boolean;
  /** 选中节点时，在节点上方显示快捷条 */
  showNodeBar: boolean;
  /** 底部状态栏 */
  showStatus: boolean;
  /** 打开带 cloudmind 标记的笔记时自动用导图视图 */
  autoOpen: boolean;
}

export const DEFAULT_SETTINGS: CloudMindSettings = {
  toolbarPos: "top",
  lastDock: "top",
  floatPos: null,
  toolbarSize: "normal",
  toolbarLabels: false,
  showNodeBar: true,
  showStatus: true,
  autoOpen: true,
};

export const POS_LABELS: Record<ToolbarPos, string> = {
  top: "顶部",
  bottom: "底部",
  left: "左侧",
  right: "右侧",
  float: "悬浮（可拖动）",
  hidden: "隐藏",
};
