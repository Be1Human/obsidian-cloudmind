import { App, PluginSettingTab, Setting } from "obsidian";
import type CloudMindPlugin from "./main";
import { POS_LABELS, ToolbarPos } from "./settings";

export class CloudMindSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: CloudMindPlugin) {
    super(app, plugin);
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;

    new Setting(containerEl)
      .setName("工具栏位置")
      .setDesc("导图界面里的专属工具栏。悬浮模式下可以用鼠标拖动抓手，位置会被记住。")
      .addDropdown((d) => {
        (Object.keys(POS_LABELS) as ToolbarPos[]).forEach((k) => d.addOption(k, POS_LABELS[k]));
        d.setValue(s.toolbarPos).onChange(async (v) => {
          await this.plugin.updateSettings({ toolbarPos: v as ToolbarPos });
        });
      });

    new Setting(containerEl)
      .setName("图标大小")
      .addDropdown((d) =>
        d
          .addOption("normal", "标准")
          .addOption("compact", "紧凑")
          .setValue(s.toolbarSize)
          .onChange(async (v) => this.plugin.updateSettings({ toolbarSize: v as "normal" | "compact" }))
      );

    new Setting(containerEl)
      .setName("按钮显示文字")
      .setDesc("在图标旁边显示按钮名称，初次使用更容易找到功能。")
      .addToggle((t) => t.setValue(s.toolbarLabels).onChange((v) => this.plugin.updateSettings({ toolbarLabels: v })));

    new Setting(containerEl)
      .setName("节点快捷条")
      .setDesc("选中一个节点时，在它上方浮出常用操作（加子主题、颜色、加粗、备注等）。")
      .addToggle((t) => t.setValue(s.showNodeBar).onChange((v) => this.plugin.updateSettings({ showNodeBar: v })));

    new Setting(containerEl)
      .setName("底部状态栏")
      .setDesc("显示保存状态、节点数、当前选中、操作提示、结构、主题和缩放。")
      .addToggle((t) => t.setValue(s.showStatus).onChange((v) => this.plugin.updateSettings({ showStatus: v })));

    new Setting(containerEl)
      .setName("自动用导图打开")
      .setDesc("frontmatter 里带 cloudmind: true 的笔记，打开时自动显示为导图。关闭后只能手动预览。")
      .addToggle((t) => t.setValue(s.autoOpen).onChange((v) => this.plugin.updateSettings({ autoOpen: v })));

    new Setting(containerEl)
      .setName("恢复默认")
      .addButton((b) =>
        b.setButtonText("恢复默认设置").onClick(async () => {
          await this.plugin.resetSettings();
          this.display();
        })
      );
  }
}
