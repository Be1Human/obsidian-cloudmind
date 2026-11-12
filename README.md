# CloudMind

Edit your Markdown notes as **XMind-style mind maps** in Obsidian. Nothing is converted or exported: the map *is* the note. Headings and lists become branches, and every change is written straight back to the same `.md` file.

> Desktop only. The interface is currently in Chinese (简体中文) only.

[中文说明见下方](#中文说明)

## Features

- **Notes as mind maps** – headings (`#`) and nested lists (`-`) are the branches. Close the plugin and your notes are still plain, readable Markdown.
- **XMind-like editing** – `Tab` adds a child, `Enter` adds a sibling, `Shift+Tab` adds a parent, type to rename, `/` folds, `Ctrl+G` adds a summary, drag to reorder, undo and redo.
- **Dockable or floating toolbar** – top, bottom, left, right, floating (drag the grip, double-click to reset) or hidden.
- **Quick bar on the selected node** and a **status bar** showing the save state, node count, selection and hints.
- **Wikilinks** – type `[[` inside a node to search your notes. Nodes that contain links are underlined; `Ctrl`+click opens the note in a new tab.
- **10 themes** – including four *box* themes where every node is enclosed in a square frame – with a preview gallery.
- **8 structures** – mind map, logic chart (right/left), organization chart, catalog, timeline, vertical timeline, fishbone.
- **Rich nodes** – notes, hyperlinks, tags, icons, fill/text/border colours, shapes, summaries, outer frames and relation lines.
- **Smooth panning and zooming** – follows trackpad fingers, eases mouse-wheel steps, zooms around the pointer.
- **Export** – PNG, SVG and `.xmind`.

## How a note is stored

Everything lives in the note. There are no side-car files.

```markdown
---
cloudmind: true
cloudmind-layout: logicalStructure
cloudmind-theme: cloudBox
---
# Central topic
## Branch <!--mm:{"fillColor":"#FFE9A8"}-->
- Leaf
  - Deeper leaf
Text under a topic is its note.
```

| What | Where |
|---|---|
| Structure | Heading and list nesting |
| Topic note | Plain text lines under the topic |
| Style, fold state, icons, summaries, links… | A hidden `<!--mm:{…}-->` comment at the end of the line (invisible in reading view) |
| Structure and theme of the whole map | Front matter: `cloudmind-layout`, `cloudmind-theme`, `cloudmind-rainbow` |

A note opens as a mind map when its front matter contains `cloudmind: true`. Any other note can be previewed with the **CloudMind** button in the note header, the ribbon menu or the command palette. Previewing never modifies the file; it is only written after you edit something in the map.

## Usage

- Ribbon icon, note-header button, status-bar item, file context menu and command palette all open CloudMind.
- Commands: *New mind map*, *Preview current note as mind map*, *Switch current mind map back to text*, *Cycle toolbar position*.
- Settings: toolbar position, icon size, button labels, node quick bar, status bar and auto-open.

### Keyboard

| Key | Action |
|---|---|
| `Tab` / `Enter` / `Shift+Tab` | Child / sibling / parent topic |
| typing, `F2` | Edit the selected topic |
| `/` | Fold / unfold |
| `Ctrl+G` | Add summary |
| `Ctrl+B` | Bold |
| `Ctrl+↑` / `Ctrl+↓` | Move topic up / down |
| `Ctrl+C` / `X` / `V` | Copy / cut / paste topics |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |
| `Ctrl+A` | Select all |
| `Ctrl+L` | Tidy layout |
| `Ctrl+I` | Fit to canvas |
| `Del` | Delete (`Shift+Backspace` deletes only the topic, keeping children) |
| `Ctrl`+click | Open the note linked in a topic |

## Installation

### From the community plugins list

Open *Settings → Community plugins*, search for **CloudMind**, install and enable it.

### Manual

Download `main.js`, `manifest.json` and `styles.css` from the latest release into `<vault>/.obsidian/plugins/cloudmind/`, then enable the plugin.

## Notes and limitations

- Desktop only (it uses a browser-based mind map engine that bundles Node's `stream`).
- The interface is Chinese only for now.
- Notes that contain another mind-map plugin's front matter (for example `mindmap-plugin`) are left alone; CloudMind only looks at `cloudmind`.
- Not affiliated with XMind. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Development

```bash
npm ci
npm run dev        # watch build
npm run build      # production build -> main.js
npm run typecheck
npm test           # Markdown round-trip tests + headless-browser UI tests (needs a local Chromium)
```

To release: bump `version` in `package.json` with `npm version <x.y.z>` (this also updates `manifest.json` and `versions.json`), push the commit and the tag. The workflow in `.github/workflows/release.yml` builds and attaches `main.js`, `manifest.json` and `styles.css`.

## License

[MIT](LICENSE). Built on [simple-mind-map](https://github.com/wanglin2/mind-map) (MIT).

---

## 中文说明

CloudMind 把 Obsidian 里的 Markdown 笔记直接当成 **XMind 风格的思维导图**来编辑。不转换、不导出：导图就是笔记本身，标题和列表的层级就是分支，改动会直接写回同一个 `.md` 文件。

- 笔记 frontmatter 里写 `cloudmind: true`，打开时自动显示为导图；其它笔记可以点笔记右上角的 CloudMind 按钮预览（预览不会改动文件，编辑后才会写回）。
- 工具栏可停靠在上下左右、悬浮拖动或隐藏；选中节点时上方有快捷条，底部有状态栏。
- 编辑节点时输入 `[[` 可搜索并引用笔记，`Ctrl`+点击打开链接的笔记。
- 10 套主题（含 4 套"每个节点都有方块围住"的方块主题）、8 种结构，支持备注、图标、标签、概要、外框、关联线，可导出 PNG / SVG / `.xmind`。
- 样式、折叠状态等信息保存在节点行尾的隐藏注释 `<!--mm:{…}-->` 里，阅读视图看不到；整张图的结构和主题保存在 frontmatter。
- 仅支持桌面端；目前界面只有简体中文。
