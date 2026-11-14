# CloudMind

**English** | [简体中文](README.zh-CN.md)

Edit your Markdown notes as **XMind-style mind maps** in Obsidian. Nothing is converted or exported: the map *is* the note. Headings and lists become branches, and every change is written straight back to the same `.md` file.

> Desktop only (Obsidian 1.5.0+). The plugin's interface is in Simplified Chinese; menu labels below are quoted as they appear, with an English translation.

![CloudMind: a Markdown note shown as a boxed mind map](docs/images/01-hero.png)

## Contents

- [Installation](#installation)
- [Create a mind map](#create-a-mind-map)
- [Features](#features)
- [How a note is stored](#how-a-note-is-stored)
- [Keyboard](#keyboard)
- [Notes and limitations](#notes-and-limitations)
- [Development](#development)

## Installation

### Where plugins are installed

Obsidian installs plugins **per vault**, not per note and not into the Obsidian app itself. There is no "install once for every vault" option; this is how all community plugins work. A plugin lives in `<vault>/.obsidian/plugins/<plugin-id>/`, so a vault looks like this:

```
your-vault/                        ← the folder you open in Obsidian
├─ notes…
└─ .obsidian/                      ← hidden settings folder
     └─ plugins/
          └─ cloudmind/            ← create this folder; the name must be cloudmind
               ├─ main.js
               ├─ manifest.json
               └─ styles.css
```

### From the community plugins list (once listed)

*Settings → Community plugins → Browse*, search for **CloudMind**, install and enable it. It is installed into the current vault.

### Manual installation (available now)

1. Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/Be1Human/obsidian-cloudmind/releases/latest). You do not need the source code archives.
2. In Obsidian, open *Settings → Community plugins* and click the **folder icon** next to "Installed plugins" (*Open plugins folder*). Your system file manager opens `<vault>/.obsidian/plugins`.
3. Create a folder named `cloudmind` there and put the three files in it.
4. Back in Obsidian, click the **reload** icon next to the folder icon, then switch **CloudMind** on.

![Settings → Community plugins](docs/images/obsidian/07-plugins-folder.png)

When it is enabled, a notice confirms it and a mind-map icon appears in the header of every note.

> **Can't find the folder?** Turn *Restricted mode* off first (top of the Community plugins page). You can also right-click any note → *Show in system explorer* to find the vault folder. `.obsidian` is hidden: on Windows enable *View → Hidden items*; on macOS press `⌘ ⇧ .` in Finder.

### Using it in several vaults

- **Install it in each vault** (simplest): repeat the steps above, or copy the whole `cloudmind` folder into the other vault's `.obsidian/plugins/` and switch it on there.
- **Share one copy** (update once, every vault gets it): link the folder into the other vaults. Tested with Obsidian on Windows:

  ```bat
  :: Windows (Command Prompt)
  mkdir "D:\Other vault\.obsidian\plugins"
  mklink /J "D:\Other vault\.obsidian\plugins\cloudmind" "D:\My vault\.obsidian\plugins\cloudmind"
  ```

  ```bash
  # macOS / Linux
  mkdir -p ~/OtherVault/.obsidian/plugins
  ln -s ~/MyVault/.obsidian/plugins/cloudmind ~/OtherVault/.obsidian/plugins/cloudmind
  ```

  Then reload plugins in the other vault and switch CloudMind on. Plugin settings are shared too; each map's theme and layout stay in its own note. Sync services (iCloud, Obsidian Sync, …) may not follow links; use separate copies in that case.

### Update and uninstall

- **Update**: replace the three files with the new ones, then reload plugins or restart Obsidian.
- **Uninstall**: switch CloudMind off or remove it in *Community plugins*, or delete `.obsidian/plugins/cloudmind`. Your notes are unaffected: they are plain Markdown.

## Create a mind map

Real screenshots from Obsidian with CloudMind installed. Red boxes mark where to click.

### A new mind map

**① Ribbon icon → `新建思维导图` (New mind map)**

![Ribbon icon menu](docs/images/obsidian/01-ribbon-menu.png)

**② Right-click a folder → `CloudMind：新建思维导图`** (creates the map inside that folder)

![Folder context menu](docs/images/obsidian/02-folder-menu.png)

**③ Command palette (`Ctrl+P`) → search "CloudMind"**

![Command palette](docs/images/obsidian/04-command-palette.png)

A new note `未命名导图.md` ("Untitled map") is created with a central topic and three branches, and opens as a mind map. Rename it like any other note.

![New mind map](docs/images/obsidian/05-new-mindmap.png)

### An existing note

**④ The mind-map button in the note header**, or **⑤ the CloudMind item in the status bar**, previews the open note as a mind map. Previewing never changes the file; it is only written after you edit the map.

![Note header button and status bar](docs/images/obsidian/03-header-button.png)

![An existing note previewed as a mind map](docs/images/obsidian/06-preview-existing.png)

To make a note always open as a map, add `cloudmind: true` to its front matter. New maps already have it.

## Features

- **Notes as mind maps**: headings (`#`) and nested lists (`-`) are the branches. Without the plugin, your notes are still plain, readable Markdown.
- **XMind-like editing**: `Tab` adds a child, `Enter` a sibling, `Shift+Tab` a parent; type to rename, `/` folds, `Ctrl+G` adds a summary, drag to reorder, undo and redo.
- **Dockable or floating toolbar**: top, bottom, left, right, floating (drag the grip, double-click to reset) or hidden.
- **Quick bar** next to the selected node, and a **status bar** with save state, node count, selection and hints.
- **Wikilinks**: type `[[` inside a node to search your notes. Linked nodes are underlined; `Ctrl`+click opens the note.
- **10 themes**, including four *box* themes where every node is framed, with a preview gallery.
- **8 structures**: mind map, logic chart (right / left), organization chart, catalog, timeline, vertical timeline, fishbone.
- **Rich nodes**: notes, hyperlinks, tags, icons, fill / text / border colours, shapes, summaries, outer frames and relation lines.
- **Smooth panning and zooming** with trackpad and mouse wheel.
- **Export** to PNG, SVG and `.xmind`, saved next to the note.

| | |
|---|---|
| ![Theme gallery](docs/images/02-themes.png) | ![Floating toolbar](docs/images/03-floating-toolbar.png) |
| Theme gallery with four box themes | Floating toolbar |
| ![Wikilink picker](docs/images/04-wikilinks.png) | ![Dark boxed theme](docs/images/05-dark-box.png) |
| Type `[[` in a node to link a note | Dark mode; custom fills stay readable |

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
| Layout and theme of the whole map | Front matter: `cloudmind-layout`, `cloudmind-theme`, `cloudmind-rainbow` |
| Open as a map automatically | Front matter: `cloudmind: true` |

## Keyboard

| Key | Action |
|---|---|
| `Tab` / `Enter` / `Shift+Tab` | Child / sibling / parent topic |
| Typing, `F2` | Edit the selected topic |
| `Del` / `Backspace` | Delete the topic and its children |
| `Shift+Backspace` | Delete only the topic, keep its children |
| `/` | Fold / unfold |
| `Ctrl+G` | Add summary |
| `Ctrl+B` | Bold |
| `Ctrl+↑` / `Ctrl+↓` | Move topic up / down |
| `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | Copy / cut / paste topics |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |
| `Ctrl+A` | Select all |
| `Ctrl+L` | Tidy layout |
| `Ctrl+I` | Fit to canvas |
| `Ctrl`+click | Open the note linked in a topic |
| `Ctrl`+wheel | Zoom |

On macOS use `⌘` instead of `Ctrl`.

## Notes and limitations

- Desktop only.
- The interface is in Simplified Chinese only for now.
- Notes with another mind-map plugin's front matter (for example `mindmap-plugin`) are left alone; CloudMind only looks at `cloudmind`.
- Not affiliated with XMind. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Development

```bash
npm ci
npm run dev           # watch build
npm run build         # production build -> main.js
npm run typecheck
npm test              # Markdown round-trip tests + headless-browser UI tests (needs a local Chromium)
npm run lint:review   # the Obsidian community review lint (install tools/obsidian-review first)
```

To release: `npm version <x.y.z>` (also updates `manifest.json` and `versions.json`), then push the commit and the tag. `.github/workflows/release.yml` builds and attaches `main.js`, `manifest.json` and `styles.css`.

## License

[MIT](LICENSE). Built on [simple-mind-map](https://github.com/wanglin2/mind-map) (MIT).
