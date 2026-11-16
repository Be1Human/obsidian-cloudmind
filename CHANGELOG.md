# Changelog

## 0.4.10

- Fixed: `Backspace` / `Delete` could stop working after typing Chinese (or another IME language) for a while. If the input method's "composing" state got stuck, every later key press was treated as editing pinyin and ignored. The composing state is now only respected when the cursor is actually in a text field.
- Fixed: double-clicking a topic could hit the quick bar that had just appeared after the first click (for example opening the "hyperlink" dialog). The quick bar now waits until the double-click window has passed and avoids covering the selected topic.
- Diagnostics: when a delete key press on a selected topic is not handled, the reason and the recent events are written to `.obsidian/plugins/cloudmind/delete-debug.log` (local only, last 300 entries) to help track down any remaining cases.

## 0.4.9

- Fixed: `Backspace` / `Delete` could stop deleting topics until the map was reopened. The plugin relied on internal "editing" / "popover open" flags that could get stuck (for example when the note was changed by Sync or in another tab while a topic was being edited, which also left an orphan edit box on screen). Deleting now checks what is actually on screen: it only types into the edit box when the cursor really is in a visible edit box; otherwise it closes any leftover edit box or popover and deletes the selected topic.
- When the note is changed from outside while editing, the edit box and popovers are closed before the map is rebuilt.

## 0.4.8

- Fixed: typing on a selected topic wiped its text and dropped the first key. Typing now keeps the text and appends what you type.
- Fixed: `F2` did not start editing (Obsidian's own F2 hotkey took it).
- Fixed: `Esc` did not leave the edit box, so a following `Backspace` deleted characters instead of the topic. `Esc` now cancels the edit and restores the text; `Enter` confirms.
- Dragging: the drop preview is only redrawn when the drop position changes (about 15× less work while dragging), and small jitter at a zone boundary no longer makes the preview jump.

## 0.4.7

- Topics no longer show the `[[ ]]` brackets of wikilinks: `[[Note]]` is shown as an underlined "Note", `[[Note|alias]]` as "alias", and `[[Note#Heading]]` as "Note > Heading", like Obsidian's reading view. Editing a topic still shows the raw link, and the file keeps the standard `[[Note]]`.

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
