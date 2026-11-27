/*
 * RiseUp panel styles. The panel lives in a shadow root, so none of this
 * touches Rise. Follows the Omniplex Learning brand: Dark grey surfaces,
 * white / light grey text, Poppins (regular and bold), and the red-orange
 * gradient only for small highlights.
 */
(function (root) {
  root.RiseUp = root.RiseUp || {};
  root.RiseUp.PANEL_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.ru {
  --bg: #2b2b2b; --surface: #393939; --surface-2: #444444; --line: #4a4a4a;
  --fg: #ffffff; --text: #f5f5f5; --muted: #b9b9b9;
  --grad: linear-gradient(45deg, #f04f4d, #ffa34a);
  --red: #f04f4d; --orange: #ffa34a; --ok: #3bcfab; --danger: #ff8a88;
  --radius: 12px;
  font: 13px/1.5 "RiseUp Poppins", Poppins, Calibri, system-ui, sans-serif; color: var(--text);
  -webkit-font-smoothing: antialiased;
}
button, input, select, textarea { font: inherit; color: inherit; }
:focus-visible { outline: 2px solid var(--orange); outline-offset: 2px; }

/* Launcher */
.launcher {
  position: fixed; z-index: 2147483646; display: flex; align-items: center; gap: 8px;
  padding: 6px 14px 6px 6px; border: 0; border-radius: 14px; background: var(--bg); color: var(--fg);
  font-weight: 700; font-size: 13px; cursor: grab; touch-action: none; user-select: none;
  box-shadow: 0 10px 30px rgba(0,0,0,.35), inset 0 0 0 1px rgba(255,255,255,.06);
}
.launcher:active { cursor: grabbing; }
.launcher.dragging { box-shadow: 0 18px 40px rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,255,255,.12); }
.mark { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; background: var(--grad); flex: none; }
.mark svg { width: 16px; height: 16px; }

/* Panel */
.panel {
  position: fixed; z-index: 2147483647; width: 400px; max-width: calc(100vw - 24px);
  height: min(680px, calc(100vh - 24px)); display: flex; flex-direction: column;
  background: var(--bg); border-radius: 18px; overflow: hidden;
  box-shadow: 0 24px 70px rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,255,255,.06);
}
.head { display: flex; align-items: center; gap: 10px; padding: 14px 14px 10px 16px; cursor: grab; user-select: none; touch-action: none; }
.head:active { cursor: grabbing; }
.head .titles { flex: 1; min-width: 0; }
.head h1 { margin: 0; font-size: 15px; font-weight: 700; color: var(--fg); line-height: 1.2; }
.head .course { display: block; font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.icon-btn { display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 9px; background: transparent; color: var(--muted); cursor: pointer; }
.icon-btn:hover { background: var(--surface); color: var(--fg); }
.icon-btn svg { width: 16px; height: 16px; }

.tabs { display: flex; gap: 2px; padding: 0 10px; border-bottom: 1px solid var(--line); }
.tab { position: relative; flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 8px 2px 10px; border: 0; background: none; color: var(--muted); cursor: pointer; font-size: 11px; }
.tab svg { width: 18px; height: 18px; }
.tab:hover { color: var(--text); }
.tab[aria-selected="true"] { color: var(--fg); font-weight: 700; }
.tab[aria-selected="true"]::after { content: ""; position: absolute; left: 22%; right: 22%; bottom: -1px; height: 3px; border-radius: 3px 3px 0 0; background: var(--grad); }

.body { flex: 1; overflow-y: auto; padding: 14px 14px 18px; scrollbar-width: thin; scrollbar-color: var(--surface-2) transparent; }
.foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--line); }

.lead { margin: 0 0 12px; color: var(--muted); font-size: 12px; }
.empty { margin: 4px 0 8px; color: var(--muted); font-size: 12px; }
.status { min-height: 0; margin: 10px 0 0; font-size: 12px; color: var(--muted); }
.status:empty { display: none; }
.status.ok { color: var(--ok); } .status.error { color: var(--danger); }

/* Accordion sections */
details.acc { border-radius: var(--radius); background: var(--surface); margin-bottom: 8px; }
details.acc > summary { list-style: none; display: flex; align-items: center; gap: 8px; padding: 11px 14px; cursor: pointer; font-weight: 700; color: var(--fg); border-radius: var(--radius); }
details.acc > summary::-webkit-details-marker { display: none; }
details.acc > summary::after { content: ""; margin-left: auto; width: 7px; height: 7px; border-right: 2px solid var(--muted); border-bottom: 2px solid var(--muted); transform: rotate(45deg); transition: transform .15s; }
details.acc details.acc { background: var(--bg); }
details.acc[open] > summary::after { transform: rotate(-135deg); }
details.acc > summary .count { color: var(--muted); font-weight: 400; font-size: 12px; }
details.acc > .acc-body { padding: 2px 14px 14px; }

/* Fields */
.field { display: grid; grid-template-columns: 1fr 160px; align-items: center; gap: 10px; margin: 8px 0; }
.field > span { color: var(--text); }
.field.stack { grid-template-columns: 1fr; gap: 5px; }
input[type=text], input[type=number], input[type=url], select, textarea {
  width: 100%; height: 32px; padding: 0 10px; border: 1px solid transparent; border-radius: 9px; background: var(--surface); color: var(--fg);
}
/* Controls sit one step darker than the card they're on. */
details.acc input, details.acc select, details.acc textarea, .lf-item input, .lf-item select, .lf-item textarea { background-color: var(--bg); }
details.acc details.acc input, details.acc details.acc select { background-color: var(--surface); }
textarea { height: auto; min-height: 64px; padding: 8px 10px; resize: vertical; }
textarea.code { min-height: 110px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
input:hover, select:hover, textarea:hover { border-color: var(--line); }
input::placeholder, textarea::placeholder { color: #8d8d8d; }
select { appearance: none; padding-right: 26px; background-image: linear-gradient(45deg, transparent 50%, var(--muted) 50%), linear-gradient(135deg, var(--muted) 50%, transparent 50%); background-position: calc(100% - 15px) 14px, calc(100% - 10px) 14px; background-size: 5px 5px; background-repeat: no-repeat; }
.colorfield { display: flex; align-items: center; gap: 6px; }
.colorfield input[type=text] { flex: 1; min-width: 0; }
input[type=color] { flex: none; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 9px; background: none; cursor: pointer; }
input[type=color]::-webkit-color-swatch-wrapper { padding: 0; }
input[type=color]::-webkit-color-swatch { border: 2px solid var(--line); border-radius: 9px; }
input[type=color].unset { opacity: .3; }
.check { display: flex; align-items: center; gap: 8px; margin: 8px 0; cursor: pointer; }
.check input { accent-color: var(--orange); width: 15px; height: 15px; }

/* Buttons */
.row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.row > input[type=text] { flex: 1; min-width: 0; }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 32px; padding: 0 12px; border: 0; border-radius: 9px; background: var(--surface-2); color: var(--fg); font-weight: 700; cursor: pointer; white-space: nowrap; }
.btn:hover { background: #4f4f4f; }
.btn.primary { background: #ffffff; color: #2b2b2b; }
.btn.primary:hover { background: #f5f5f5; }
.btn.ghost { background: transparent; color: var(--muted); padding: 0 8px; font-weight: 400; }
.btn.ghost:hover { color: var(--fg); background: var(--surface); }
.btn.danger { color: var(--danger); }
.btn:disabled { opacity: .4; cursor: default; }
.btn svg { width: 14px; height: 14px; }
.link { border: 0; background: none; padding: 0; color: var(--orange); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }

/* Lists */
.list { list-style: none; margin: 6px 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.item { display: flex; align-items: center; gap: 8px; padding: 8px 8px 8px 12px; border-radius: 10px; background: var(--surface); }
details.acc .item { background: var(--bg); }
.item .grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item .sub { display: block; color: var(--muted); font-size: 11px; }
.item.selected { box-shadow: inset 3px 0 0 var(--orange); }
.item button.grow { border: 0; background: none; text-align: left; cursor: pointer; padding: 0; color: var(--fg); }

/* Block gallery */
.gallery { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 8px 0 4px; }
.tile { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 12px; border: 0; border-radius: 12px; background: var(--surface); color: var(--fg); text-align: left; cursor: pointer; transition: transform .12s, background .12s; }
.tile:hover { background: var(--surface-2); transform: translateY(-1px); }
.tile .glyph { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; background: var(--bg); }
.tile:hover .glyph { background: var(--grad); }
.tile .glyph svg { width: 16px; height: 16px; }
.tile strong { font-size: 12.5px; }
.tile small { color: var(--muted); font-size: 11px; line-height: 1.35; }
.group-label { margin: 14px 0 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
.group-label::before { content: ""; display: inline-block; width: 3px; height: 10px; margin-right: 7px; border-radius: 2px; background: var(--grad); vertical-align: -1px; }

/* Block editor */
.back { display: inline-flex; align-items: center; gap: 4px; margin-bottom: 10px; }
.code-box { display: flex; align-items: center; gap: 8px; padding: 10px 10px 10px 12px; border-radius: 12px; background: var(--surface); margin-bottom: 10px; }
.code-box code { flex: 1; min-width: 0; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--fg); overflow-wrap: anywhere; }
.howto { margin: 0 0 12px; color: var(--muted); font-size: 12px; }
.preview { position: relative; margin: 0 0 12px; padding: 14px; border-radius: 12px; background: #ffffff; color: #2b2b2b; font: 13px/1.5 system-ui, sans-serif; max-height: 360px; overflow: auto; }
.preview .ru-bleed { width: auto !important; margin-left: 0 !important; border-radius: var(--ru-radius) !important; }
.preview-label { position: sticky; top: -14px; z-index: 5; display: block; margin: -14px -14px 10px; padding: 4px 10px; background: #f5f5f5; color: #393939; font: 700 10px/1.6 "RiseUp Poppins", Poppins, sans-serif; text-transform: uppercase; letter-spacing: .1em; }
.preview.pickable .ru-hs-stage { cursor: crosshair; }
.preview-start { padding: 0; overflow: hidden; }
.preview-start .preview-label { position: absolute; top: 0; left: 0; right: 0; margin: 0; z-index: 3; }
.preview .ru-c.ru-sp { position: relative; inset: auto; min-height: 300px; font-size: 7.5px; animation: none; z-index: 1; }
.preview .ru-c.ru-sp .ru-sp-copy { padding: 34px 26px 26px; }
.listfield { margin: 10px 0; }
.listfield > .lf-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; font-weight: 700; color: var(--fg); }
.lf-item { padding: 8px 12px 10px; border-radius: 10px; background: var(--surface); margin-bottom: 6px; }
.lf-item-head { display: flex; align-items: center; gap: 4px; color: var(--muted); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
.lf-item-head span { flex: 1; }
.lf-item .field { grid-template-columns: 1fr; gap: 4px; margin: 6px 0; }
.lf-item .field > span { font-size: 12px; color: var(--muted); }
.imgfield { display: flex; align-items: center; gap: 8px; }
.imgfield .thumb { width: 44px; height: 32px; border-radius: 7px; background: var(--bg) center/cover no-repeat; flex: none; border: 1px solid var(--line); }
.imgfield input[type=text] { flex: 1; min-width: 0; }

/* Colors */
.swatch-big { height: 56px; border-radius: 12px; margin-bottom: 8px; box-shadow: inset 0 0 0 1px rgba(255,255,255,.08); }
.swatches { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
.swatch { width: 28px; height: 28px; padding: 0; border: 0; border-radius: 8px; cursor: pointer; box-shadow: inset 0 0 0 1px rgba(255,255,255,.12); }
.swatch:hover { transform: scale(1.08); }
.contrast-sample { padding: 12px 14px; border-radius: 10px; margin: 8px 0; }
.contrast-sample .lg { font-size: 18px; font-weight: 700; }
.ratio { font-size: 24px; font-weight: 700; color: var(--fg); }
.grades { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 10px; margin-top: 6px; font-size: 12px; }
.pass { color: var(--ok); } .fail { color: var(--danger); }

/* Find */
.result { cursor: pointer; }
.result .grow { white-space: normal; }
.result mark { background: var(--orange); color: #2b2b2b; border-radius: 3px; padding: 0 2px; }
.sample { padding: 12px; margin: 10px 0 0; border-radius: 10px; background: #ffffff; color: #2b2b2b; font-size: 20px; }

/* Switch */
.switch { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; color: var(--muted); font-size: 12px; }
.switch input { appearance: none; width: 32px; height: 18px; margin: 0; border-radius: 999px; background: var(--surface-2); position: relative; cursor: pointer; transition: background .15s; }
.switch input::after { content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform .15s; }
.switch input:checked { background: var(--grad); }
.switch input:checked::after { transform: translateX(14px); }

/* Chips next to RiseUp codes in the editor */
.chip { position: fixed; z-index: 2147483645; display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px 0 4px; border: 0; border-radius: 8px; background: var(--bg); color: var(--fg); font-size: 12px; font-weight: 700; cursor: pointer; box-shadow: 0 6px 18px rgba(0,0,0,.3); white-space: nowrap; }
.chip .mark { width: 20px; height: 20px; border-radius: 6px; }
.chip .mark svg { width: 11px; height: 11px; }
.chip.unknown { background: #5a2a2a; }
`;
})(globalThis);
