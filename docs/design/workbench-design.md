# MultiTerm Design Instructions

## Settings menus

- Prefer a recognizable Lucide glyph to the left of each option in settings menus and dropdowns we create.
- Keep the text label visible; glyphs support recognition and do not replace accessible names.
- Reuse the same glyph for the same concept across settings, context menus, and toolbars.
- Treat glyphs as decorative with `aria-hidden="true"` unless the icon conveys information not present in the label.
- Omit a glyph when there is no clear, familiar symbol rather than adding arbitrary decoration.

## Workspace interactions

- Blank workspace background owns a real focus state; clicking it clears terminal input focus and active-pane treatment.
- While the workspace background is focused, wheel and trackpad pinch gestures adjust workspace zoom rather than terminal scroll or terminal font size.
- Keep workspace zoom configurable and persisted in Layout settings. Terminal-local Ctrl+wheel remains a separate per-terminal font adjustment after that terminal is focused.