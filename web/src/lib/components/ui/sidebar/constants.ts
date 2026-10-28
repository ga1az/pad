// The widths live in ui.css as --ui-sidebar-width / --ui-sidebar-width-icon
// (SPEC-24 / TASK-27): app.css already owns --sidebar-width. There is no
// cookie and no keyboard shortcut here: the app keeps the sidebar's open state
// in uiStore, and Mod+B is the editor's bold (Mod+\ toggles the chrome).
export {};
