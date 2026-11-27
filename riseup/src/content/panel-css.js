/* Styles for the RiseUp panel. It lives in a shadow root, so none of this touches Rise. */
(function (root) {
  root.RiseUp = root.RiseUp || {};
  root.RiseUp.PANEL_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.ru {
  --bg: #ffffff; --fg: #1d2330; --muted: #5b6475; --line: #e3e6ec; --soft: #f5f6f9;
  --accent: #5b3df5; --accent-fg: #ffffff; --danger: #c62f2f; --ok: #1d7a46;
  font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--fg);
}
@media (prefers-color-scheme: dark) {
  .ru { --bg: #1b1e26; --fg: #e9ecf2; --muted: #a2a9b8; --line: #343946; --soft: #242833; --accent: #8f7bff; --accent-fg: #14121f; --danger: #ff7a7a; --ok: #5fd08f; }
}
.launcher {
  position: fixed; right: 18px; bottom: 18px; z-index: 2147483646;
  display: flex; align-items: center; gap: 6px; padding: 9px 14px; border: 0; border-radius: 999px;
  background: var(--accent); color: var(--accent-fg); font: 600 13px/1 system-ui, sans-serif;
  box-shadow: 0 6px 20px rgba(40, 20, 120, .35); cursor: pointer;
}
.launcher:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.panel {
  position: fixed; right: 18px; bottom: 70px; z-index: 2147483647; width: 380px; max-width: calc(100vw - 36px);
  height: min(640px, calc(100vh - 100px)); display: flex; flex-direction: column;
  background: var(--bg); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 18px 50px rgba(0,0,0,.25); overflow: hidden;
}
.panel[hidden] { display: none; }
header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px 0; }
header h1 { margin: 0; font-size: 15px; font-weight: 700; letter-spacing: -.01em; }
header h1 + .course { flex: 1; margin: 0 8px; }
header .course { color: var(--muted); font-size: 11px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tabs { display: flex; gap: 2px; padding: 8px 8px 0; border-bottom: 1px solid var(--line); }
.tabs button { flex: 1; padding: 7px 4px 9px; border: 0; background: none; color: var(--muted); font: inherit; font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent; }
.tabs button[aria-selected="true"] { color: var(--fg); border-bottom-color: var(--accent); }
.body { flex: 1; overflow-y: auto; padding: 12px; }
footer { display: flex; gap: 6px; padding: 8px 12px; border-top: 1px solid var(--line); background: var(--soft); }
section + section { margin-top: 16px; }
h2 { margin: 0 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
p.hint { margin: 0 0 8px; color: var(--muted); font-size: 12px; }
label.field { display: grid; grid-template-columns: 1fr 150px; align-items: center; gap: 8px; margin: 6px 0; }
label.check { display: flex; align-items: center; gap: 6px; margin: 6px 0; }
input[type=text], input[type=number], select, textarea {
  width: 100%; padding: 6px 8px; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); color: var(--fg); font: inherit;
}
textarea { min-height: 90px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; resize: vertical; }
input[type=color].unset { opacity: .35; }
input[type=color] { width: 34px; height: 30px; padding: 0; border: 1px solid var(--line); border-radius: 7px; background: none; cursor: pointer; }
.row { display: flex; gap: 6px; align-items: center; }
.row > input[type=text] { flex: 1; }
button.btn { padding: 6px 10px; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); color: var(--fg); font: inherit; font-weight: 600; cursor: pointer; white-space: nowrap; }
button.btn.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); }
button.btn.danger { color: var(--danger); }
button.btn:disabled { opacity: .5; cursor: default; }
button.link { border: 0; background: none; color: var(--accent); padding: 0; font: inherit; cursor: pointer; text-decoration: underline; }
.list { display: flex; flex-direction: column; gap: 4px; margin: 6px 0; padding: 0; list-style: none; }
.list li { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--soft); }
.list li .grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.list li.selected { border-color: var(--accent); }
.list li button.x { border: 0; background: none; color: var(--muted); cursor: pointer; font-size: 15px; line-height: 1; padding: 0 2px; }
.result { cursor: pointer; }
.result mark { background: #ffe27a; color: #1d2330; border-radius: 2px; }
.empty { color: var(--muted); font-style: italic; margin: 6px 0; }
.status { min-height: 18px; margin-top: 6px; font-size: 12px; color: var(--muted); }
.status.error { color: var(--danger); }
.status.ok { color: var(--ok); }
.swatches { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
.swatch { width: 28px; height: 28px; border-radius: 7px; border: 1px solid rgba(0,0,0,.15); cursor: pointer; position: relative; padding: 0; }
.big-swatch { width: 100%; height: 44px; border-radius: 9px; border: 1px solid var(--line); margin-bottom: 8px; }
.sample { padding: 10px; border: 1px dashed var(--line); border-radius: 8px; margin: 8px 0; font-size: 18px; }
.contrast-sample { padding: 10px 12px; border-radius: 8px; margin: 8px 0; }
.contrast-sample .lg { font-size: 19px; font-weight: 700; }
.grades { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 12px; }
.pass { color: var(--ok); font-weight: 600; }
.fail { color: var(--danger); font-weight: 600; }
.ratio { font-size: 22px; font-weight: 700; }
.editor { border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; margin-top: 8px; }
`;
})(globalThis);
