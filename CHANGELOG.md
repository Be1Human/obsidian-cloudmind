# Changelog

## 0.4.6

- Fixed: a topic note containing lines that start with `-`, `1.` or `#` turned into new topics after reopening the note, and the note text was lost. Such lines are now saved with a Markdown escape (`\-`, `1\.`, `\#`), which looks the same in reading view; code blocks inside notes are left untouched.

## 0.4.5

- Improved: dragging a topic to reorder is much easier to aim. The top / bottom 30% of a topic now means insert above / below (the middle makes it a child), the drop zone extends half-way to the neighbouring topics and about 56px to the left and right, and the drop position is re-evaluated on release instead of every 300ms. In tests, 24 of 24 drops land where intended (4 of 24 before). Applies to the mind map and logic chart layouts; other layouts keep the previous rules but react faster.

## 0.4.4

- Fixed: the icon picker only listed numbers (1, 2, 3…) instead of the icons. It is now a visual panel showing all icons by group (priority, progress, emoji, markers); click to add, click again to remove, one icon per group, plus 
## 0.4.3

- Passes the Obsidian community automated review rules (eslint-plugin-obsidianmd): no plugin name in settings headings, popout-window safe document/window/timer usage, `setCssStyles` instead of inline style assignments, no deprecated `execCommand` / `keyCode`.
- The welcome notice is shown only after install or update, not on every start.

## 0.4.2

- Fixed: Backspace and Delete did not delete the selected node while a Chinese (or other) input method was active. Those keys arrive with `keyCode` 229 and were mistaken for typing, so the node entered text editing instead. Deletion now uses the physical key, and `Ctrl`+Backspace also deletes.
- Fixed: deleting the central topic (keyboard, trash button or context menu) wiped every other node in the map. The central topic can no longer be deleted.
- Backspace is ignored while a node is being edited, while composing text, and while the note picker is open.

## 0.4.1

- Fixed: in dark and blueprint themes, a node with a light custom fill showed white text on a light background. Text colour is now chosen automatically for contrast (display only, never written to the note; an explicit text colour is always respected).
- Improved: the quick bar above the selected node picks the position (above, below, aligned left or right) that covers the fewest other nodes.
- Added screenshots to the README.

## 0.4.0

- Ten themes with a preview gallery, including four *box* themes where every node is framed.
- Smooth wheel and trackpad panning and zooming.
- Wikilinks: type `[[` in a node to search notes, `Ctrl`+click to open.
- Dockable or floating toolbar, node quick bar and status bar.
- Notes are stored entirely in the Markdown file.
