<div align="center">

# CloudMind

**在 Obsidian 里画 XMind 风格的思维导图，数据就是 Markdown。**

[English](README.md) · **简体中文**

</div>

![CloudMind](docs/images/01-hero.png)

**笔记本身就是导图。** 标题和列表的层级就是导图的分支，在导图里改，改的就是这份 `.md`，不用导入、导出、转换。

- **纯 Markdown**：关掉插件，笔记照样是能读的标题和列表；搜索、反向链接、关系图谱、同步都照常。
- **XMind 的手感**：`Tab`、`Enter`、拖拽、概要、外框、关联线，10 套主题、8 种结构。
- **支持双链**：节点里输入 `[[` 就能引用库里的笔记。

> 仅支持桌面版 · Obsidian 1.5.0 及以上 · 界面为简体中文

---

## 安装

Obsidian 的插件**装在“库”里**（就是你在 Obsidian 里打开的那个文件夹），不是装进 Obsidian 软件，也不是装在某篇笔记里。哪个库要用，就在哪个库里装一次。

**插件市场**（上架后）：设置 → 第三方插件 → 浏览，搜 **CloudMind** → 安装 → 启用。

**手动安装**（现在用这个）：

1. 在 [最新 Release](https://github.com/Be1Human/obsidian-cloudmind/releases/latest) 下载 `main.js`、`manifest.json`、`styles.css` 三个文件。
2. 设置 → 第三方插件 → 点「已安装插件」右边的**文件夹图标**（打开插件文件夹）。在打开的文件夹里**新建文件夹 `cloudmind`**，把 3 个文件放进去。
3. 点**刷新图标**（重新加载插件），再**打开 CloudMind 的开关**。

<img src="docs/images/obsidian/07-plugins-folder.png" width="640" alt="设置 → 第三方插件：打开插件文件夹、重新加载、打开开关">

<details>
<summary><b>找不到文件夹？/ 多个库 / 更新 / 卸载</b></summary>

**找不到文件夹？** 先关闭「安全模式」（第三方插件页最上面一项）。也可以右键任意笔记 →「在系统资源管理器中显示」，再进入 `.obsidian/plugins/`（隐藏文件夹：Windows 资源管理器勾选「查看 → 隐藏的项目」，Mac 访达按 `⌘ ⇧ .`）。放好后应该是这样：

```
你的库/.obsidian/plugins/cloudmind/
├─ main.js
├─ manifest.json
└─ styles.css
```

**多个库都要用。** 在每个库里重复上面的步骤，或把 `cloudmind` 文件夹整个复制过去。想多个库共用一份（更新一次全部生效），可以建目录链接（已在 Windows 上实测可用）：

```bat
mklink /J "D:\第二个库\.obsidian\plugins\cloudmind" "D:\我的库\.obsidian\plugins\cloudmind"
```

Mac / Linux：`ln -s ~/我的库/.obsidian/plugins/cloudmind ~/第二个库/.obsidian/plugins/cloudmind`。库在同步盘或用 Obsidian Sync 时，同步工具可能不认链接，请改用复制。

**更新。** 用新版 3 个文件覆盖旧文件，再点「重新加载插件」。

**卸载。** 在第三方插件里关掉或卸载即可。你的笔记都是普通 Markdown，不受影响。

</details>

---

## 创建导图

| | 怎么做 | |
|:-:|---|---|
| ① | **左侧栏 CloudMind 图标** → 新建思维导图 | <img src="docs/images/obsidian/crop-ribbon.png" width="380"> |
| ② | **右键文件夹** → CloudMind：新建思维导图 | <img src="docs/images/obsidian/crop-folder.png" width="380"> |
| ③ | **`Ctrl+P`** 命令面板搜 CloudMind | <img src="docs/images/obsidian/crop-palette.png" width="380"> |
| ④ | **已有笔记**：点笔记右上角的导图按钮 | <img src="docs/images/obsidian/crop-header.png" width="380"> |
| ⑤ | **已有笔记**：点底部状态栏的 CloudMind | <img src="docs/images/obsidian/crop-status.png" width="170"> |

①～③ 会新建 `未命名导图.md`（一个中心主题 + 三个分支）并以导图打开，像普通笔记一样改名即可。④⑤ 是把当前笔记预览成导图，**不编辑就不会改动文件**。

想让某篇笔记每次都以导图打开，在 frontmatter 里加 `cloudmind: true`，新建的导图已经自带。

---

## 功能

<table>
<tr>
<td width="50%"><img src="docs/images/02-themes.png"><br><b>10 套主题</b>，其中 4 套“方块风”，每个节点都有方框。</td>
<td width="50%"><img src="docs/images/04-wikilinks.png"><br><b>节点里写 [[双链]]</b>，显示为带下划线的笔记名，<code>Ctrl</code>+点击打开。</td>
</tr>
<tr>
<td><img src="docs/images/03-floating-toolbar.png"><br><b>工具栏随意放</b>：上下左右、悬浮拖动或隐藏。</td>
<td><img src="docs/images/05-dark-box.png"><br><b>深色模式</b>，自定义颜色的文字也看得清。</td>
</tr>
</table>

- **8 种结构**：思维导图、逻辑图（向右 / 向左）、组织结构图、目录组织图、时间轴、竖向时间轴、鱼骨图。
- **节点内容**：备注、超链接、标签、图标、颜色、形状、概要、外框、关联线。
- 选中节点时浮出**快捷条**，底部**状态栏**显示保存状态和操作提示。
- 触控板和滚轮**平滑**平移、缩放（`Ctrl` + 滚轮缩放）。
- **导出** PNG、SVG、`.xmind`，保存在笔记所在的文件夹。

---

## 笔记是怎么存的

```markdown
---
cloudmind: true
cloudmind-layout: logicalStructure
cloudmind-theme: cloudBox
---
# 中心主题
## 分支 <!--mm:{"fillColor":"#FFE9A8"}-->
- 子主题
  这一行是“子主题”的备注
```

| 内容 | 存在哪里 |
|---|---|
| 层级结构 | 标题和列表的嵌套 |
| 节点备注 | 节点下面的普通文字（备注里以 `-`、`1.`、`#` 开头的行会存成 `\-`、`1\.`、`\#`，避免被当成新节点，阅读模式显示不变） |
| 颜色、折叠、图标、链接等 | 行尾隐藏的 `<!--mm:{…}-->` 注释，阅读模式看不见 |
| 结构和主题 | frontmatter：`cloudmind-layout`、`cloudmind-theme` |

想边看边练？把 [docs/CloudMind使用教程.md](docs/CloudMind使用教程.md) 放进库里打开，它本身就是一张导图。

<details>
<summary><b>快捷键</b></summary>

| 按键 | 作用 |
|---|---|
| `Tab` / `Enter` / `Shift+Tab` | 子主题 / 同级主题 / 父主题 |
| 直接打字或 `F2` | 编辑节点 |
| `Del` / `Backspace` | 删除节点（含子节点） |
| `Shift+Backspace` | 只删当前节点 |
| `/` | 折叠 / 展开 |
| `Ctrl+G` | 概要 |
| `Ctrl+B` | 加粗 |
| `Ctrl+↑` / `Ctrl+↓` | 上移 / 下移 |
| `Ctrl+C` / `X` / `V` | 复制 / 剪切 / 粘贴 |
| `Ctrl+Z` / `Ctrl+Y` | 撤销 / 重做 |
| `Ctrl+L` / `Ctrl+I` | 整理布局 / 适应画布 |
| `Ctrl`+点击 | 打开引用的笔记 |

Mac 上把 `Ctrl` 换成 `⌘`。

</details>

<details>
<summary><b>设置</b></summary>

设置 → 第三方插件 → CloudMind：

| 设置 | 默认 |
|---|---|
| 工具栏位置：顶部 / 底部 / 左侧 / 右侧 / 悬浮 / 隐藏 | 顶部 |
| 图标大小：标准 / 紧凑 | 标准 |
| 按钮显示文字 | 关 |
| 节点快捷条 | 开 |
| 底部状态栏 | 开 |
| 带 `cloudmind: true` 的笔记自动用导图打开 | 开 |

</details>

<details>
<summary><b>常见问题</b></summary>

**装好后看不到 CloudMind？** 检查：文件夹名是 `cloudmind`，3 个文件直接在里面（没有多套一层）；放在当前这个库的 `.obsidian/plugins/` 里；点了「重新加载插件」并打开了开关；安全模式已关闭。

**能不能装一次，所有库都能用？** 不能，Obsidian 的插件都是按库安装的。见上面「安装」里的“多个库都要用”。

**为什么笔记没有自动以导图打开？** 只有 frontmatter 带 `cloudmind: true` 的笔记会自动打开；其它笔记点右上角按钮预览。

**会不会改乱我的笔记？** 只预览不会改动。在导图里编辑后，会按“标题 + 列表”写回，并在行尾加样式注释。重要笔记建议先备份。

**手机上能用吗？** 暂不支持。

**删除键没反应？** 请更新到 0.4.2 及以上（旧版在中文输入法下 `Backspace` 会被当成打字）。

**其它问题** 请到 [Issues](https://github.com/Be1Human/obsidian-cloudmind/issues) 反馈，附上 Obsidian 和 CloudMind 的版本号。

</details>

---

## 开源协议

[MIT](LICENSE)。基于 [simple-mind-map](https://github.com/wanglin2/mind-map)。与 XMind 公司无关（[说明](THIRD_PARTY_NOTICES.md)）。
