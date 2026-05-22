const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface NavGroup { label: string; items: [string, string][] }

const NAV: NavGroup[] = [
  { label: "Library", items: [["/skills", "Skills"], ["/mcp", "MCP Servers"]] },
  { label: "Workspaces", items: [["/projects", "Projects"], ["/discover", "Discover"]] },
  { label: "Configuration", items: [["/secrets", "Secrets"]] },
  { label: "System", items: [["/ides", "IDEs"], ["/settings", "Settings"]] },
];

const FAVICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABDElEQVR4nO2XOw7CMAyGXcTOwhDPLPQEvQQD9+MSDNylLMzO2hOUKZKb5uFEThFSvzVN/89O+gjAzo/pUoPGmFkryFobzDqmgomo1xJAxDkksrLi4Yg4agnw+3GJQ+5iLRBxDHV00QFjzFwSTkQTCzgJ5/SIOLouBDuwJdUCrnpXOe/GJgJaVAn41XNuT/o0F/BxIi68REJ1CR4DnAEAXne8NBNItb80vEogRu3TUCSQq76G4Mcow5uIUuNXIpqkkmIBVv0guU7Kf76IUpRuRpFAi81XJNCSrEBN9SXL8PMOZB/D2nWXzlt0wFrbxf7dNPB/x1YCjhYSoXCAyMGk0blgFR4V8EU0iJ2Mdr7jvZhqMtGEAQAAAABJRU5ErkJggg==";

const CSS = `
:root{
  --space-1:4px;--space-2:8px;--space-3:12px;--space-4:16px;--space-5:20px;--space-6:24px;--space-8:32px;
  --radius-sm:6px;--radius-md:8px;--radius-lg:10px;
  --font-xs:11px;--font-sm:13px;--font-base:14px;--font-lg:16px;--font-xl:20px;
  --bg:#f5f5f7;--sidebar-bg:#f0f0f2;--surface:#fff;--surface-alt:#f9f9fb;
  --surface-hover:#ececee;--surface-active:#e4e4e8;
  --stroke:#d1d1d6;--stroke-light:#e5e5ea;
  --text:#1d1d1f;--text-secondary:#86868b;--text-tertiary:#aeaeb2;
  --accent:#007aff;--accent-hover:#0071e3;--accent-text:#fff;
  --danger:#ff3b30;--danger-bg:rgba(255,59,48,.08);
  --success:#34c759;--success-bg:rgba(52,199,89,.1);
  --warning:#ff9500;--warning-bg:rgba(255,149,0,.1);
  --tag-bg:#ececee;--tag-text:#636366;
  --shadow-sm:0 1px 2px rgba(0,0,0,.04);
}
html.dark{
  --bg:#161618;--sidebar-bg:#1c1c1e;--surface:#2c2c2e;--surface-alt:#3a3a3c;
  --surface-hover:#3a3a3c;--surface-active:#48484a;
  --stroke:#38383a;--stroke-light:#2c2c2e;
  --text:#f5f5f7;--text-secondary:#8e8e93;--text-tertiary:#636366;
  --accent:#0a84ff;--accent-hover:#409cff;--accent-text:#fff;
  --danger:#ff453a;--danger-bg:rgba(255,69,58,.12);
  --success:#30d158;--success-bg:rgba(48,209,88,.12);
  --warning:#ff9f0a;--warning-bg:rgba(255,159,10,.12);
  --tag-bg:#38383a;--tag-text:#8e8e93;
  --shadow-sm:0 1px 2px rgba(0,0,0,.18);
}
html,body{margin:0;padding:0;background:var(--bg);color:var(--text)}
body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,"PingFang SC","Microsoft YaHei",sans-serif;font-size:var(--font-base);-webkit-font-smoothing:antialiased;line-height:1.47}
html[lang="zh-CN"] body{letter-spacing:0;line-height:1.55}
*{box-sizing:border-box}
a{color:inherit;text-decoration:none}
button{font:inherit;cursor:pointer}
input,select,textarea{color-scheme:dark light}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:var(--radius-sm)}
.app-shell{display:flex;height:100vh;overflow:hidden}
.sidebar{width:224px;min-width:224px;background:var(--sidebar-bg);border-right:1px solid var(--stroke-light);display:flex;flex-direction:column;height:100vh}
.sidebar-header{padding:var(--space-5) var(--space-4) var(--space-3);font-size:var(--font-lg);font-weight:700;letter-spacing:0;color:var(--text)}
.sidebar-nav{flex:1;padding:0 var(--space-2);overflow-y:auto;scrollbar-gutter:stable}
.sidebar-footer{padding:var(--space-2) var(--space-2) var(--space-3);border-top:1px solid var(--stroke-light)}
.nav-group{margin-bottom:var(--space-3)}
.nav-group-label{font-size:var(--font-xs);font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-tertiary);padding:var(--space-2) var(--space-3) var(--space-1)}
.nav-item{display:flex;align-items:center;gap:var(--space-2);min-height:30px;padding:5px var(--space-3);border-radius:var(--radius-sm);font-size:var(--font-sm);color:var(--text-secondary);transition:background .12s,color .12s;cursor:pointer;border:0;background:transparent;width:100%;text-align:left}
.nav-item:hover{background:var(--surface-hover);color:var(--text)}
.nav-item.active{background:var(--surface-hover);color:var(--text);font-weight:600}
.sidebar-button{justify-content:flex-start}
.conn-status{display:flex;align-items:center;gap:var(--space-2);font-size:var(--font-xs);color:var(--text-tertiary);padding:var(--space-1) var(--space-3);margin-bottom:var(--space-1)}
.conn-dot{width:6px;height:6px;border-radius:50%;background:var(--text-tertiary);flex-shrink:0}
.conn-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#connection-dot.live{background:var(--success)!important;box-shadow:0 0 4px var(--success)}
#connection-dot.dead{background:var(--danger)!important}
.lang-switch{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:var(--space-2) var(--space-3) 0;padding:3px;border:1px solid var(--stroke-light);border-radius:var(--radius-sm);background:var(--surface);box-shadow:var(--shadow-sm)}
.lang-btn{border:0;background:transparent;color:var(--text-secondary);border-radius:5px;min-height:24px;font-size:var(--font-xs);font-weight:600;cursor:pointer}
.lang-btn:hover{background:var(--surface-hover);color:var(--text)}
.lang-btn.active{background:var(--accent);color:var(--accent-text)}
.main-content{flex:1;min-width:0;display:flex;flex-direction:column;height:100vh;overflow:hidden}
.page-body{flex:1;overflow-y:auto;scrollbar-gutter:stable;background:var(--bg)}
.page-body::-webkit-scrollbar,.sidebar-nav::-webkit-scrollbar,.check-list::-webkit-scrollbar{width:10px;height:10px}
.page-body::-webkit-scrollbar-thumb,.sidebar-nav::-webkit-scrollbar-thumb,.check-list::-webkit-scrollbar-thumb{background:rgba(120,120,128,.35);border:3px solid transparent;border-radius:999px;background-clip:content-box}
.page-body::-webkit-scrollbar-thumb:hover,.sidebar-nav::-webkit-scrollbar-thumb:hover,.check-list::-webkit-scrollbar-thumb:hover{background:rgba(120,120,128,.55);border:3px solid transparent;background-clip:content-box}
.toolbar{display:flex;align-items:center;justify-content:space-between;padding:var(--space-3) var(--space-6);border-bottom:1px solid var(--stroke-light);background:color-mix(in srgb,var(--bg) 92%,transparent);min-height:54px;gap:var(--space-4);position:sticky;top:0;z-index:10;backdrop-filter:saturate(180%) blur(12px)}
.toolbar-copy{min-width:0}
.toolbar-title{font-size:var(--font-lg);font-weight:650;margin:0;line-height:1.3;letter-spacing:0}
.toolbar-sub{font-size:var(--font-xs);color:var(--text-secondary);margin:2px 0 0}
.toolbar-actions{display:flex;align-items:center;gap:var(--space-2);flex-wrap:wrap;justify-content:flex-end}
.content-padding{padding:var(--space-6);max-width:1280px}
.skills-content,.wide-content{max-width:none}
.mcp-content{width:100%;box-sizing:border-box}
.mcp-content #mcp-list,.mcp-content .group-panel{width:100%;max-width:none}
.mcp-content #mcp-list>.group-panel{overflow-x:auto}
.mcp-content #mcp-list table.aiem{min-width:960px}
.toast-area{position:fixed;top:var(--space-4);right:var(--space-4);z-index:100;width:min(340px,calc(100vw - 32px));pointer-events:none}
.toast-area>*+*{margin-top:var(--space-2)}
.toast{background:var(--surface);border:1px solid var(--stroke);color:var(--text);padding:var(--space-3) var(--space-4);border-radius:var(--radius-md);font-size:var(--font-sm);box-shadow:0 8px 32px rgba(0,0,0,.12);pointer-events:auto;opacity:0;transform:translateY(-6px);transition:opacity .2s,transform .2s}
.toast.show{opacity:1;transform:translateY(0)}
.toast.toast-success{border-left:3px solid var(--success)}
.toast.toast-error{border-left:3px solid var(--danger)}
.toast.toast-info{border-left:3px solid var(--accent)}
.toast.toast-warn{border-left:3px solid var(--warning)}
.group-panel{background:var(--surface);border:1px solid var(--stroke-light);border-radius:var(--radius-md);overflow:hidden;margin-bottom:var(--space-4);box-shadow:var(--shadow-sm)}
.group-panel-title{padding:var(--space-3) var(--space-4) var(--space-2);font-size:var(--font-xs);font-weight:650;text-transform:uppercase;letter-spacing:.04em;color:var(--text-secondary)}
.settings-row{display:flex;align-items:center;justify-content:space-between;padding:var(--space-3) var(--space-4);border-bottom:1px solid var(--stroke-light);gap:var(--space-4);min-height:48px}
.settings-row:last-child{border-bottom:none}
.settings-row-label{flex:1;min-width:0}
.settings-row-label .label-text{font-size:var(--font-sm);font-weight:500;color:var(--text)}
.settings-row-label .label-desc{font-size:var(--font-xs);color:var(--text-secondary);margin-top:1px}
.settings-row-control{flex-shrink:0;display:flex;align-items:center;gap:var(--space-2)}
.danger-zone{border:1px solid var(--danger);border-radius:var(--radius-md);padding:var(--space-4);margin-bottom:var(--space-4);background:var(--danger-bg)}
.danger-zone-title{font-size:var(--font-sm);font-weight:600;color:var(--danger);margin-bottom:var(--space-2)}
.aiem-card{background:var(--surface);border:1px solid var(--stroke-light);border-radius:var(--radius-md);padding:var(--space-4);margin-bottom:var(--space-4);box-shadow:var(--shadow-sm)}
.empty-state{padding:var(--space-8) var(--space-4);text-align:center;color:var(--text-secondary)}
.empty-state-title{font-size:var(--font-sm);font-weight:500}
.empty-state-sub{font-size:var(--font-xs);margin-top:4px;color:var(--text-tertiary)}
.group-box{border:1px solid var(--stroke-light);background:var(--surface);border-radius:var(--radius-md);margin-bottom:var(--space-3);overflow:hidden;box-shadow:var(--shadow-sm)}
.group-box>summary{list-style:none;cursor:pointer;padding:var(--space-3) var(--space-4);font-weight:600;font-size:var(--font-sm);display:flex;align-items:center;gap:var(--space-2)}
.group-box>summary::-webkit-details-marker{display:none}
.group-box>summary:hover{background:var(--surface-hover)}
.group-box>summary .chev{transition:transform .15s;display:inline-block;color:var(--text-secondary);font-size:10px}
.group-box[open]>summary .chev{transform:rotate(90deg)}
.group-box[open]>summary{border-bottom:1px solid var(--stroke-light)}
.group-actions{padding:var(--space-2) var(--space-4);background:var(--surface-alt);border-bottom:1px solid var(--stroke-light);display:flex;flex-wrap:wrap;gap:var(--space-2);align-items:center}
.group-body{padding:0}
table.aiem{width:100%;border-collapse:separate;border-spacing:0}
table.aiem th{text-align:left;font-size:var(--font-xs);font-weight:650;text-transform:uppercase;letter-spacing:.04em;color:var(--text-secondary);padding:var(--space-2) var(--space-3);border-bottom:1px solid var(--stroke)}
table.aiem td{padding:var(--space-2) var(--space-3);border-bottom:1px solid var(--stroke-light);font-size:var(--font-sm);vertical-align:middle}
table.aiem tr:last-child td{border-bottom:none}
table.aiem tbody tr:hover>td{background:var(--surface-hover)}
.btn,.btn-primary,.btn-secondary,.btn-danger,.btn-ghost{display:inline-flex;align-items:center;justify-content:center;gap:4px;min-height:30px;padding:4px 12px;font-size:var(--font-sm);font-weight:500;border-radius:var(--radius-sm);border:0;cursor:pointer;transition:background .12s,border-color .12s,opacity .12s,color .12s;white-space:nowrap;line-height:1.2;text-align:center;vertical-align:middle}
.btn-primary{background:var(--accent);color:var(--accent-text)}
.btn-primary:hover{background:var(--accent-hover)}
.btn-primary:active{opacity:.85}
.btn-primary:disabled,.btn-secondary:disabled,.btn-danger:disabled{opacity:.42;cursor:not-allowed}
.btn,.btn-secondary{background:var(--surface);color:var(--text);border:1px solid var(--stroke)}
.btn:hover,.btn-secondary:hover{background:var(--surface-hover)}
.btn-danger{background:transparent;color:var(--danger);border:1px solid var(--stroke)}
.btn-danger:hover{background:var(--danger-bg);border-color:var(--danger)}
.btn-ghost{background:var(--surface);color:var(--text-secondary);border:1px solid var(--stroke);min-height:30px;padding:4px 10px;font-size:var(--font-xs)}
.btn-ghost:hover{color:var(--text);background:var(--surface-hover);border-color:var(--stroke)}
.tag{display:inline-flex;align-items:center;justify-content:center;padding:2px 8px;font-size:var(--font-xs);font-weight:500;border-radius:999px;line-height:1.5;background:var(--tag-bg);color:var(--tag-text);white-space:nowrap}
.tag-success{background:var(--success-bg);color:var(--success)}
.tag-danger{background:var(--danger-bg);color:var(--danger)}
.tag-neutral{background:var(--tag-bg);color:var(--tag-text)}
.field,select.field,textarea.field{width:100%;background:var(--surface);border:1px solid var(--stroke);color:var(--text);border-radius:var(--radius-sm);padding:6px 10px;font-size:var(--font-sm);line-height:1.4;transition:border-color .12s,background .12s;min-height:32px}
.field:focus,textarea.field:focus,select.field:focus{outline:none;border-color:var(--accent)}
.field::placeholder{color:var(--text-tertiary)}
textarea.field{font-family:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;font-size:var(--font-sm)}
.label{display:block;font-size:var(--font-xs);color:var(--text-secondary);margin-bottom:3px;font-weight:500}
.check-list{display:grid;gap:4px;max-height:260px;overflow:auto;padding:var(--space-2);border:1px solid var(--stroke-light);border-radius:var(--radius-sm);background:var(--surface-alt);scrollbar-gutter:stable}
.check-list label{display:flex;align-items:center;gap:6px;font-size:var(--font-sm);color:var(--text);padding:4px 6px;border-radius:var(--radius-sm)}
.check-list label:hover{background:var(--surface-hover)}
.project-picker-grid{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);align-items:stretch}
.project-picker{display:flex;min-width:0;flex-direction:column}
.project-check-list{height:300px;min-height:300px;max-height:300px;align-content:start;overflow:auto;scrollbar-gutter:auto}
.detail-split{display:grid;grid-template-columns:minmax(320px,420px) minmax(560px,1fr);gap:16px;align-items:stretch;width:100%}
.detail-stack{display:flex;flex-direction:column;height:360px;min-height:360px;gap:12px}
.skills-detail-stack{height:382px;min-height:382px}
.deployment-records-panel{display:flex;flex:1;min-height:0;flex-direction:column}
.deployment-records-panel .deploy-records{flex:1;min-height:0;max-height:none}
.skill-row-actions{display:flex;gap:4px;justify-content:flex-end;align-items:center}
.skill-row-actions form{display:inline-flex;gap:4px;align-items:center}
.skill-row-actions .field,.detail-action-row .field{height:30px;min-height:30px!important;padding:4px 10px!important;font-size:var(--font-xs)!important;line-height:1.2}
.skill-row-actions .btn,.skill-row-actions .btn-primary,.skill-row-actions .btn-secondary,.skill-row-actions .btn-danger,.skill-row-actions .btn-ghost,
.detail-action-row .btn,.detail-action-row .btn-primary,.detail-action-row .btn-secondary,.detail-action-row .btn-danger,.detail-action-row .btn-ghost{height:30px;min-height:30px!important;padding:4px 10px!important;line-height:1.2}
.detail-action-row{margin-top:auto;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.detail-action-row form{display:inline-flex;gap:4px;align-items:center}
.detail-action-row-linked{display:grid;grid-template-columns:minmax(0,1fr) auto auto;width:100%;gap:6px;flex-wrap:nowrap}
.detail-action-row-linked .skill-undeploy-form{display:grid;grid-template-columns:minmax(82px,1fr) minmax(72px,.9fr) auto;gap:4px;min-width:0}
.detail-action-row-linked .skill-undeploy-form .field{width:100%!important;min-width:0!important}
.detail-action-row-linked .skill-undeploy-form .btn-secondary{min-width:62px}
.detail-action-row-linked>.btn-ghost{min-width:82px}
.detail-action-row-linked>form:last-child{display:flex}
.detail-action-row-linked>form:last-child .btn-danger{min-width:54px}
.skill-md-slot{height:360px;min-height:360px}
.skill-md-preview{width:100%;height:360px;min-height:360px;max-height:360px;overflow:auto;background:var(--surface-alt);border:1px solid var(--stroke-light);border-radius:var(--radius-sm);padding:12px;font-family:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.58;white-space:pre-wrap;word-break:break-word;color:var(--text)}
.skill-md-rendered{width:100%;height:360px;min-height:360px;max-height:360px;overflow:auto;background:var(--surface-alt);border:1px solid var(--stroke-light);border-radius:var(--radius-sm);padding:16px 20px;font-size:13px;line-height:1.65;color:var(--text);word-break:break-word}
.skill-md-rendered h1{font-size:18px;font-weight:700;margin:0 0 8px;border-bottom:1px solid var(--stroke-light);padding-bottom:6px}
.skill-md-rendered h2{font-size:16px;font-weight:650;margin:14px 0 6px}
.skill-md-rendered h3{font-size:14px;font-weight:600;margin:12px 0 4px}
.skill-md-rendered h4,.skill-md-rendered h5,.skill-md-rendered h6{font-size:13px;font-weight:600;margin:10px 0 4px}
.skill-md-rendered p{margin:0 0 8px}
.skill-md-rendered ul,.skill-md-rendered ol{margin:0 0 8px;padding-left:20px}
.skill-md-rendered li{margin-bottom:3px}
.skill-md-rendered pre{background:var(--surface);border:1px solid var(--stroke-light);border-radius:var(--radius-sm);padding:10px 12px;overflow-x:auto;font-family:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.5;margin:0 0 8px}
.skill-md-rendered code{font-family:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}
.skill-md-rendered :not(pre)>code{background:var(--surface);border:1px solid var(--stroke-light);border-radius:3px;padding:1px 4px}
.skill-md-rendered a{color:var(--accent);text-decoration:none}
.skill-md-rendered a:hover{text-decoration:underline}
.skill-md-rendered hr{border:none;border-top:1px solid var(--stroke-light);margin:12px 0}
.skill-md-rendered blockquote{border-left:3px solid var(--stroke);padding-left:12px;margin:0 0 8px;color:var(--text-secondary)}
.btn-loading{opacity:.65;pointer-events:none;cursor:wait}
.deploy-records{border:1px solid var(--stroke-light);border-radius:var(--radius-sm);overflow:auto;background:linear-gradient(180deg,var(--surface) 0%,var(--surface-alt) 100%);width:100%;max-width:none;min-height:172px;max-height:242px;scrollbar-gutter:auto;box-shadow:inset 0 1px 0 rgba(255,255,255,.04);scrollbar-width:thin;scrollbar-color:rgba(120,120,128,.36) transparent}
.deploy-records::-webkit-scrollbar{width:8px;height:8px}
.deploy-records::-webkit-scrollbar-track{background:color-mix(in srgb,var(--surface-alt) 84%,transparent);border-radius:999px;margin:6px 2px}
.deploy-records::-webkit-scrollbar-thumb{background:rgba(120,120,128,.34);border:2px solid transparent;border-radius:999px;background-clip:content-box}
.deploy-records::-webkit-scrollbar-thumb:hover{background:rgba(120,120,128,.52);border:2px solid transparent;background-clip:content-box}
.deploy-records-empty{display:flex;align-items:center;justify-content:center}
.deploy-records table{width:100%;border-collapse:separate;border-spacing:0}
.deploy-records th,.deploy-records td{padding:8px 10px;border-bottom:1px solid var(--stroke-light);font-size:var(--font-xs);text-align:left;vertical-align:middle}
.deploy-records th{color:var(--text-secondary);font-weight:650;background:var(--surface-alt);position:sticky;top:0;z-index:1}
.deploy-records tr:last-child td{border-bottom:0}
.mcp-action-bar{display:inline-flex;gap:4px;align-items:center;justify-content:flex-end;flex-wrap:nowrap}
.mcp-action-bar .field{font-size:11px;padding:3px 6px;min-height:24px}
.mcp-action-bar button{min-height:24px;padding:2px 8px;font-size:11px}
.meta{font-size:var(--font-xs);color:var(--text-secondary)}
.mono{font-family:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;font-size:var(--font-sm)}
.row-gap{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.flex{display:flex}.grid{display:grid}.items-center{align-items:center}.items-end{align-items:flex-end}.gap-2{gap:var(--space-2)}.gap-3{gap:var(--space-3)}
.htmx-indicator{opacity:0;transition:opacity .2s}
.htmx-request .htmx-indicator{opacity:1}
.settings-grid{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-5);align-items:start}
.settings-col{display:flex;flex-direction:column;gap:var(--space-4)}
.settings-card{background:var(--surface);border:1px solid var(--stroke-light);border-radius:var(--radius-md);box-shadow:var(--shadow-sm);overflow:hidden}
.settings-card-compact .settings-card-body{padding-top:0}
.settings-card-header{display:flex;align-items:center;gap:var(--space-3);padding:var(--space-4);border-bottom:1px solid var(--stroke-light)}
.settings-card-compact .settings-card-header{border-bottom:none}
.settings-card-icon{font-size:20px;line-height:1;flex-shrink:0;width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:var(--surface-alt);border-radius:var(--radius-sm)}
.settings-card-title{font-size:var(--font-sm);font-weight:600;color:var(--text)}
.settings-card-desc{font-size:var(--font-xs);color:var(--text-secondary);margin-top:1px}
.settings-card-badge{margin-left:auto;flex-shrink:0}
.settings-card-body{padding:var(--space-4)}
.settings-section{margin-bottom:var(--space-4)}.settings-section:last-child{margin-bottom:0}
.settings-section-label{font-size:var(--font-xs);font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-secondary);margin-bottom:var(--space-2)}
.settings-form-row{display:flex;gap:8px;align-items:center}
.settings-input-wide{max-width:320px}
.settings-input-med{max-width:240px}
.settings-field-group{margin-bottom:8px}
.settings-field-group .label{margin-bottom:3px}
.settings-field-group .field{max-width:320px}
.info-grid{display:grid;gap:0}
.info-item{display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--stroke-light)}.info-item:last-child{border-bottom:none}
.info-label{font-size:var(--font-xs);color:var(--text-secondary);font-weight:500}
.info-value{font-size:var(--font-xs);color:var(--text);text-align:right;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media(max-width:900px){
  .toolbar{align-items:flex-start;flex-direction:column;padding-left:var(--space-4);padding-right:var(--space-4)}
  .toolbar-actions{justify-content:flex-start}
  .content-padding{padding:var(--space-4)}
  .detail-split{grid-template-columns:1fr}
  .detail-stack{height:320px;min-height:320px}
  .skills-detail-stack{height:342px;min-height:342px}
  .skill-md-slot,.skill-md-preview{height:320px;min-height:320px;max-height:320px}
  .project-picker-grid{grid-template-columns:1fr}
  .settings-grid{grid-template-columns:1fr}
  .settings-input-wide,.settings-input-med{max-width:100%}
  .settings-field-group .field{max-width:100%}
  .info-value{max-width:180px}
}
@media(max-width:768px){
  .sidebar{width:60px;min-width:60px}
  .sidebar-header,.nav-group-label,.conn-label,.nav-item-text{display:none}
  .lang-switch{grid-template-columns:1fr;margin:var(--space-2) 4px 0}
  .lang-btn{font-size:10px;padding:0}
  .nav-item{font-size:0;padding:10px;justify-content:center}
  .nav-item::first-letter{font-size:var(--font-base)}
  .toolbar{padding-left:var(--space-3);padding-right:var(--space-3)}
  .content-padding{padding:var(--space-3)}
  .mcp-content #mcp-list>.group-panel{overflow-x:visible}
  .mcp-content #mcp-list table.aiem{min-width:0;table-layout:fixed}
  .mcp-content #mcp-list table.aiem thead{display:none}
  .mcp-content #mcp-list table.aiem th,.mcp-content #mcp-list table.aiem td{padding:8px 10px}
  .mcp-content #mcp-list table.aiem th:nth-child(1){width:28%}
  .mcp-content #mcp-list table.aiem th:nth-child(2){width:19%}
  .mcp-content #mcp-list table.aiem th:nth-child(3){width:37%}
  .mcp-content #mcp-list table.aiem th:nth-child(5){width:16%}
  .mcp-content #mcp-list table.aiem th:nth-child(4),
  .mcp-content #mcp-list tbody>tr:not([id^="mcp-detail"])>td:nth-child(4){display:none}
  .mcp-content #mcp-list tbody>tr:not([id^="mcp-detail"])>td:nth-child(5) form{display:none!important}
  .mcp-content #mcp-list tbody>tr:not([id^="mcp-detail"])>td:nth-child(5)>div{justify-content:flex-start}
  .mcp-content #mcp-list tbody>tr:not([id^="mcp-detail"])>td:nth-child(5) .btn-ghost{padding:4px 8px}
  .mcp-detail-panels{grid-template-columns:1fr!important}
}
`;

const JS = `
(function(){
  const KEY='aiem.theme';
  function apply(mode){
    document.documentElement.classList.toggle('dark', mode==='dark');
    try{localStorage.setItem(KEY,mode)}catch(e){}
  }
  try{const s=localStorage.getItem(KEY);if(s)apply(s)}catch(e){}
  document.addEventListener('click',e=>{
    const btn=e.target&&e.target.closest?e.target.closest('#theme-toggle'):null;
    if(btn){
      apply(document.documentElement.classList.contains('dark')?'light':'dark');
    }
  });
})();

(function(){
  const KEY='aiem.lang';
  const COOKIE='aiem_lang';
  const textOrigins=new WeakMap();
  const attrOrigins=new WeakMap();
  const attrNames=['placeholder','title','aria-label','hx-confirm'];
  const zh={'Library':'\\u8d44\\u6e90\\u5e93','Workspaces':'\\u5de5\\u4f5c\\u533a','Configuration':'\\u914d\\u7f6e','System':'\\u7cfb\\u7edf','Skills':'\\u6280\\u80fd','MCP Servers':'MCP \\u670d\\u52a1','MCP':'MCP','Projects':'\\u9879\\u76ee','Discover':'\\u53d1\\u73b0','Secrets':'\\u5bc6\\u94a5','IDEs':'IDE','Settings':'\\u8bbe\\u7f6e','Toggle theme':'\\u5207\\u6362\\u4e3b\\u9898','Clear global':'\\u6e05\\u7a7a\\u5168\\u5c40','New local':'\\u65b0\\u5efa\\u672c\\u5730','Add from GitHub':'\\u4ece GitHub \\u6dfb\\u52a0','Filter skills\\u2026':'\\u7b5b\\u9009\\u6280\\u80fd...','Filter servers\\u2026':'\\u7b5b\\u9009\\u670d\\u52a1...','Add skill from GitHub':'\\u4ece GitHub \\u6dfb\\u52a0\\u6280\\u80fd','Create a new local skill':'\\u65b0\\u5efa\\u672c\\u5730\\u6280\\u80fd','Source *':'\\u6765\\u6e90 *','Subdir (optional)':'\\u5b50\\u76ee\\u5f55\\uff08\\u53ef\\u9009\\uff09','Ref (optional)':'\\u5f15\\u7528\\uff08\\u53ef\\u9009\\uff09','Display name (optional)':'\\u663e\\u793a\\u540d\\u79f0\\uff08\\u53ef\\u9009\\uff09','Download & install':'\\u4e0b\\u8f7d\\u5e76\\u5b89\\u88c5','Cancel':'\\u53d6\\u6d88','Skill name *':'\\u6280\\u80fd\\u540d\\u79f0 *','SKILL.md content *':'SKILL.md \\u5185\\u5bb9 *','Create skill':'\\u521b\\u5efa\\u6280\\u80fd','No skills installed':'\\u6682\\u65e0\\u6280\\u80fd','No matches':'\\u6ca1\\u6709\\u5339\\u914d\\u7ed3\\u679c','Deploy all':'\\u5168\\u90e8\\u90e8\\u7f72','Undeploy all':'\\u5168\\u90e8\\u53d6\\u6d88','Update all':'\\u5168\\u90e8\\u66f4\\u65b0','Remove all':'\\u5168\\u90e8\\u5220\\u9664','Deploy':'\\u90e8\\u7f72','Undeploy':'\\u53d6\\u6d88\\u90e8\\u7f72','Update':'\\u66f4\\u65b0','Remove':'\\u79fb\\u9664','Delete':'\\u5220\\u9664','More':'\\u66f4\\u591a','Global':'\\u5168\\u5c40','Save':'\\u4fdd\\u5b58','Name *':'\\u540d\\u79f0 *','Actions':'\\u64cd\\u4f5c','Name':'\\u540d\\u79f0','Status':'\\u72b6\\u6001','Transport':'\\u4f20\\u8f93','Targets':'\\u76ee\\u6807','Path':'\\u8def\\u5f84','Version':'\\u7248\\u672c','Deployed':'\\u90e8\\u7f72','Deployment records':'\\u90e8\\u7f72\\u8bb0\\u5f55','Deploy project':'\\u90e8\\u7f72\\u9879\\u76ee','Target IDE':'\\u76ee\\u6807 IDE','Deployment status':'\\u90e8\\u7f72\\u72b6\\u6001','No deployment records.':'\\u6682\\u65e0\\u90e8\\u7f72\\u8bb0\\u5f55\\u3002','Synced':'\\u5df2\\u540c\\u6b65','Not synced':'\\u672a\\u540c\\u6b65','Disabled':'\\u5df2\\u7981\\u7528','Enable':'\\u542f\\u7528','Disable':'\\u7981\\u7528','Sync':'\\u540c\\u6b65','Sync all IDEs':'\\u540c\\u6b65\\u6240\\u6709 IDE','Add server':'\\u6dfb\\u52a0\\u670d\\u52a1','Bundles':'\\u670d\\u52a1\\u5305','Register':'\\u6ce8\\u518c','Configure':'\\u914d\\u7f6e','Close':'\\u5173\\u95ed','Save & Deploy':'\\u4fdd\\u5b58\\u5e76\\u90e8\\u7f72','Save only':'\\u4ec5\\u4fdd\\u5b58','Import':'\\u5bfc\\u5165','Set secret':'\\u8bbe\\u7f6e\\u5bc6\\u94a5','Save config':'\\u4fdd\\u5b58\\u914d\\u7f6e','Push to GitHub':'\\u63a8\\u9001\\u5230 GitHub','Pull from GitHub':'\\u4ece GitHub \\u62c9\\u53d6','Loading\\u2026':'\\u52a0\\u8f7d\\u4e2d...','View all files':'\\u67e5\\u770b\\u6240\\u6709\\u6587\\u4ef6','Link GitHub':'\\u5173\\u8054 GitHub','local':'\\u672c\\u5730',
    'GitHub Token':'GitHub \\u4ee4\\u724c','Personal access token for GitHub API':'\\u7528\\u4e8e GitHub API \\u7684\\u4e2a\\u4eba\\u8bbf\\u95ee\\u4ee4\\u724c','configured':'\\u5df2\\u914d\\u7f6e','not set':'\\u672a\\u8bbe\\u7f6e','Clear':'\\u6e05\\u9664','Backup & Restore':'\\u5907\\u4efd\\u4e0e\\u6062\\u590d','Local snapshots and GitHub sync':'\\u672c\\u5730\\u5feb\\u7167\\u4e0e GitHub \\u540c\\u6b65','Auto-backup interval':'\\u81ea\\u52a8\\u5907\\u4efd\\u95f4\\u9694','Local snapshot':'\\u672c\\u5730\\u5feb\\u7167','Snapshot now':'\\u7acb\\u5373\\u5feb\\u7167','Export / Restore':'\\u5bfc\\u51fa / \\u6062\\u590d','Export':'\\u5bfc\\u51fa','Restore':'\\u6062\\u590d','GitHub backup':'GitHub \\u5907\\u4efd','Repo URL (HTTPS)':'\\u4ed3\\u5e93\\u5730\\u5740 (HTTPS)','Proxy (optional)':'\\u4ee3\\u7406\\uff08\\u53ef\\u9009\\uff09','Verify':'\\u9a8c\\u8bc1','Host Info':'\\u4e3b\\u673a\\u4fe1\\u606f','Runtime environment details':'\\u8fd0\\u884c\\u73af\\u5883\\u8be6\\u60c5','Hostname':'\\u4e3b\\u673a\\u540d','User':'\\u7528\\u6237','Trash':'\\u56de\\u6536\\u7ad9','Removed items are moved to trash, not hard-deleted':'\\u79fb\\u9664\\u7684\\u9879\\u76ee\\u4f1a\\u79fb\\u5230\\u56de\\u6536\\u7ad9\\uff0c\\u4e0d\\u4f1a\\u786c\\u5220\\u9664','Open trash':'\\u6253\\u5f00\\u56de\\u6536\\u7ad9','About':'\\u5173\\u4e8e','empty trash':'\\u6e05\\u7a7a\\u56de\\u6536\\u7ad9','Overwrite current config from this snapshot?':'\\u4ece\\u6b64\\u5feb\\u7167\\u8986\\u76d6\\u5f53\\u524d\\u914d\\u7f6e\\uff1f','Restore config from GitHub? This overwrites current data.':'\\u4ece GitHub \\u6062\\u590d\\u914d\\u7f6e\\uff1f\\u8fd9\\u5c06\\u8986\\u76d6\\u5f53\\u524d\\u6570\\u636e\\u3002','Take local snapshot':'\\u521b\\u5efa\\u672c\\u5730\\u5feb\\u7167','Saves registries into':'\\u5c06\\u6ce8\\u518c\\u8868\\u4fdd\\u5b58\\u5230',
    'From GitHub':'\\u4ece GitHub \\u5bfc\\u5165','Import from GitHub':'\\u4ece GitHub \\u5bfc\\u5165','Paste a GitHub repo URL or owner/repo. Looks for MCP config in the repo root (mcp.json, .mcp.json, etc.).':'\\u7c98\\u8d34 GitHub \\u4ed3\\u5e93\\u5730\\u5740\\u6216 owner/repo\\u3002\\u81ea\\u52a8\\u5728\\u4ed3\\u5e93\\u4e2d\\u67e5\\u627e MCP \\u914d\\u7f6e\\u6587\\u4ef6\\u3002','GitHub source':'GitHub \\u6765\\u6e90','Fetch & import':'\\u62c9\\u53d6\\u5e76\\u5bfc\\u5165','Fetch & preview':'\\u62c9\\u53d6\\u5e76\\u9884\\u89c8','Confirm import':'\\u786e\\u8ba4\\u5bfc\\u5165','Confirm install':'\\u786e\\u8ba4\\u5b89\\u88c5','Ref (optional)':'\\u5206\\u652f\\uff08\\u53ef\\u9009\\uff09','Quick form':'\\u5feb\\u901f\\u586b\\u5199','Add MCP server \\u2014 paste JSON':'\\u6dfb\\u52a0 MCP \\u670d\\u52a1 \\u2014 \\u7c98\\u8d34 JSON','Supports a single server or a map of name \\u2192 config.':'\\u652f\\u6301\\u5355\\u4e2a\\u670d\\u52a1\\u6216\\u540d\\u79f0 \\u2192 \\u914d\\u7f6e\\u7684\\u6620\\u5c04\\u3002','Stdio server':'Stdio \\u670d\\u52a1','Add stdio':'\\u6dfb\\u52a0 stdio','Add URL server':'\\u6dfb\\u52a0 URL \\u670d\\u52a1','SSE / HTTP server':'SSE / HTTP \\u670d\\u52a1','Add server':'\\u6dfb\\u52a0\\u670d\\u52a1','Bundles':'\\u670d\\u52a1\\u5305','MCP Bundles':'MCP \\u670d\\u52a1\\u5305','Sync all IDEs':'\\u540c\\u6b65\\u6240\\u6709 IDE','No MCP servers yet':'\\u6682\\u65e0 MCP \\u670d\\u52a1','Filter servers\\u2026':'\\u7b5b\\u9009\\u670d\\u52a1...','Undeploy from the selected IDE/scope?':'\\u4ece\\u9009\\u5b9a\\u7684 IDE/\\u4f5c\\u7528\\u57df\\u53d6\\u6d88\\u90e8\\u7f72\\uff1f','Remove this MCP server?':'\\u79fb\\u9664\\u6b64 MCP \\u670d\\u52a1\\uff1f','Remove from the selected IDE/scope?':'\\u4ece\\u9009\\u5b9a\\u7684 IDE/\\u4f5c\\u7528\\u57df\\u79fb\\u9664\\uff1f','Project scope':'\\u9879\\u76ee\\u4f5c\\u7528\\u57df','No projects deployed.':'\\u6682\\u65e0\\u90e8\\u7f72\\u9879\\u76ee\\u3002',
    'Detected skills':'\\u68c0\\u6d4b\\u5230\\u7684\\u6280\\u80fd','Detected MCP servers':'\\u68c0\\u6d4b\\u5230\\u7684 MCP \\u670d\\u52a1','Also import MCP servers':'\\u540c\\u65f6\\u5bfc\\u5165 MCP \\u670d\\u52a1','Config file':'\\u914d\\u7f6e\\u6587\\u4ef6','No servers detected':'\\u672a\\u68c0\\u6d4b\\u5230\\u670d\\u52a1','No skills detected':'\\u672a\\u68c0\\u6d4b\\u5230\\u6280\\u80fd','Command / URL':'\\u547d\\u4ee4/ URL','Description':'\\u63cf\\u8ff0','Subdir':'\\u5b50\\u76ee\\u5f55','Files':'\\u6587\\u4ef6','Installed!':'\\u5df2\\u5b89\\u88c5\\uff01','Imported!':'\\u5df2\\u5bfc\\u5165\\uff01','files':'\\u4e2a\\u6587\\u4ef6','Pushing to GitHub...':'\\u6b63\\u5728\\u63a8\\u9001\\u5230 GitHub...','Pulling from GitHub...':'\\u6b63\\u5728\\u4ece GitHub \\u62c9\\u53d6...','Pushed to GitHub successfully':'\\u5df2\\u6210\\u529f\\u63a8\\u9001\\u5230 GitHub','Pulled from GitHub and restored':'\\u5df2\\u4ece GitHub \\u62c9\\u53d6\\u5e76\\u6062\\u590d','Push failed':'\\u63a8\\u9001\\u5931\\u8d25','Pull failed':'\\u62c9\\u53d6\\u5931\\u8d25','No GitHub repo configured':'\\u672a\\u914d\\u7f6e GitHub \\u4ed3\\u5e93','target(s)':'\\u4e2a\\u76ee\\u6807','server(s)':'\\u4e2a\\u670d\\u52a1',
    'Remote Repo Management':'\\u8fdc\\u7a0b\\u4ed3\\u5e93\\u7ba1\\u7406','View and delete skills/MCPs from your GitHub backup repo':'\\u67e5\\u770b\\u548c\\u5220\\u9664 GitHub \\u5907\\u4efd\\u4ed3\\u5e93\\u4e2d\\u7684 Skills/MCPs','Manage remote':'\\u7ba1\\u7406\\u8fdc\\u7a0b\\u4ed3\\u5e93','Configure repo first':'\\u8bf7\\u5148\\u914d\\u7f6e\\u4ed3\\u5e93','Sync from remote':'\\u4ece\\u8fdc\\u7a0b\\u540c\\u6b65','Delete selected':'\\u5220\\u9664\\u5df2\\u9009','Remote repo is empty':'\\u8fdc\\u7a0b\\u4ed3\\u5e93\\u4e3a\\u7a7a','Syncing remote repo...':'\\u6b63\\u5728\\u540c\\u6b65\\u8fdc\\u7a0b\\u4ed3\\u5e93...','Remote contents synced':'\\u8fdc\\u7a0b\\u5185\\u5bb9\\u5df2\\u540c\\u6b65','Deleting selected items...':'\\u6b63\\u5728\\u5220\\u9664\\u9009\\u4e2d\\u9879\\u76ee...','GITHUB_TOKEN saved':'GitHub \\u4ee4\\u724c\\u5df2\\u4fdd\\u5b58','Token is required':'\\u4ee4\\u724c\\u4e0d\\u80fd\\u4e3a\\u7a7a','MCP Bundles':'MCP \\u670d\\u52a1\\u5305',
    'Scan local':'\\u626b\\u63cf\\u672c\\u5730','Scan local directory':'\\u626b\\u63cf\\u672c\\u5730\\u76ee\\u5f55','Scan a local directory for skills (SKILL.md) and MCP servers.':'\\u626b\\u63cf\\u672c\\u5730\\u76ee\\u5f55\\u67e5\\u627e\\u6280\\u80fd (SKILL.md) \\u548c MCP \\u670d\\u52a1\\u3002','Directory path *':'\\u76ee\\u5f55\\u8def\\u5f84 *','Scan':'\\u626b\\u63cf','Scan local directory for MCP servers':'\\u626b\\u63cf\\u672c\\u5730\\u76ee\\u5f55\\u67e5\\u627e MCP \\u670d\\u52a1'};
  const patterns=[
    [/^Remove all (\\d+) skills from this group\\?$/,m=>\`\\u5220\\u9664\\u8be5\\u7ec4\\u4e2d\\u7684 \${m[1]} \\u4e2a\\u6280\\u80fd\\uff1f\`],
    [/^(\\d+) IDE$/,m=>\`\${m[1]} \\u4e2a IDE\`],
    [/^(\\d+) project\\(s\\)$/,m=>\`\${m[1]} \\u4e2a\\u9879\\u76ee\`],
    [/^(\\d+) target\\(s\\)$/,m=>\`\${m[1]} \\u4e2a\\u76ee\\u6807\`]
  ];
  function cookieLang(){
    const m=document.cookie.match(new RegExp('(?:^|; )'+COOKIE+'=([^;]+)'));
    return m?decodeURIComponent(m[1]):'';
  }
  function getLang(){
    try{return localStorage.getItem(KEY)||cookieLang()||'en'}catch(e){return cookieLang()||'en'}
  }
  function tr(s){
    if(getLang()!=='zh')return s;
    if(zh[s])return zh[s];
    for(const [re,fn] of patterns){const m=s.match(re);if(m)return fn(m);}
    return s;
  }
  window.aiemTranslate=tr;
  function preserveReplace(raw,translated){
    const pre=(raw.match(/^\\s*/)||[''])[0];
    const post=(raw.match(/\\s*$/)||[''])[0];
    return pre+translated+post;
  }
  function translateTextNodes(root,lang){
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{
      acceptNode(node){
        const p=node.parentElement;
        if(!p||p.closest('script,style,textarea,code,.mono'))return NodeFilter.FILTER_REJECT;
        if(!node.nodeValue.trim())return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(node=>{
      const raw=textOrigins.get(node)||node.nodeValue;
      if(!textOrigins.has(node))textOrigins.set(node,raw);
      const text=raw.trim();
      node.nodeValue=lang==='zh'?preserveReplace(raw,tr(text)):raw;
    });
  }
  function attrStore(el){
    let store=attrOrigins.get(el);
    if(!store){store={};attrOrigins.set(el,store)}
    return store;
  }
  function translateAttrs(root,lang){
    root.querySelectorAll('[placeholder],[title],[aria-label],[hx-confirm]').forEach(el=>{
      const store=attrStore(el);
      attrNames.forEach(attr=>{
        const val=el.getAttribute(attr);
        if(!val)return;
        if(store[attr]===undefined)store[attr]=val;
        const raw=store[attr];
        el.setAttribute(attr,lang==='zh'?tr(raw.trim()):raw);
      });
    });
  }
  function applyLang(lang,root){
    lang=lang==='zh'?'zh':'en';
    document.documentElement.lang=lang==='zh'?'zh-CN':'en';
    document.querySelectorAll('.lang-btn').forEach(btn=>btn.classList.toggle('active',btn.dataset.aiemLang===lang));
    const scope=root||document;
    translateTextNodes(scope,lang);
    translateAttrs(scope,lang);
  }
  function setLang(lang){
    lang=lang==='zh'?'zh':'en';
    try{localStorage.setItem(KEY,lang)}catch(e){}
    document.cookie=COOKIE+'='+encodeURIComponent(lang)+'; Path=/; Max-Age=31536000; SameSite=Lax';
    applyLang(lang,document);
  }
  document.addEventListener('click',e=>{
    const target=e.target instanceof Element?e.target:null;
    const btn=target&&target.closest('[data-aiem-lang]');
    if(btn)setLang(btn.dataset.aiemLang);
  });
  document.addEventListener('DOMContentLoaded',()=>applyLang(getLang(),document));
  if(document.body)applyLang(getLang(),document);
  if(document.body)document.body.addEventListener('htmx:afterSwap',ev=>applyLang(getLang(),ev.detail&&ev.detail.target?ev.detail.target:document));
})();

(function(){
  if(window.htmx)return;
  function fire(target,name,detail){
    const ev=new CustomEvent(name,{bubbles:true,detail:detail||{}});
    (target||document.body).dispatchEvent(ev);
    return ev;
  }
  function targetFor(elt){
    const sel=elt.getAttribute('hx-target');
    return sel?document.querySelector(sel):elt;
  }
  function afterHook(elt,ev){
    const code=elt.getAttribute('hx-on--after-request')||elt.getAttribute('hx-on::after-request');
    if(!code)return;
    try{Function('event',code).call(elt,ev)}catch(e){console.error(e)}
  }
  function addControl(params,el){
    if(!el||!el.name||el.disabled)return;
    const tag=(el.tagName||'').toLowerCase();
    const type=(el.type||'').toLowerCase();
    if((type==='checkbox'||type==='radio')&&!el.checked)return;
    if(tag==='select'&&el.multiple){
      Array.from(el.selectedOptions||[]).forEach(opt=>params.append(el.name,opt.value));
      return;
    }
    params.append(el.name,el.value==null?'':el.value);
  }
  function addControls(params,root){
    if(!root)return;
    if(root.matches&&root.matches('input,select,textarea,button'))addControl(params,root);
    root.querySelectorAll&&root.querySelectorAll('input,select,textarea').forEach(el=>addControl(params,el));
  }
  function includeRoots(elt){
    const spec=elt.getAttribute('hx-include');
    if(!spec)return [];
    return spec.split(',').map(s=>s.trim()).filter(Boolean).flatMap(sel=>{
      if(sel.startsWith('closest ')){
        const root=elt.closest(sel.slice(8).trim());
        return root?[root]:[];
      }
      if(sel==='this')return [elt];
      return Array.from(document.querySelectorAll(sel));
    });
  }
  function bodyFor(elt,submitter){
    const params=new URLSearchParams();
    const form=elt&&elt.matches&&elt.matches('form')?elt:(elt&&elt.closest?elt.closest('form'):null);
    if(form)addControls(params,form);
    includeRoots(elt).forEach(root=>addControls(params,root));
    if(submitter&&submitter.name)addControl(params,submitter);
    return params.toString();
  }
  async function send(elt,method,url,body){
    method=(method||'get').toLowerCase();
    let requestUrl=url;
    const init={method:method.toUpperCase(),headers:{}};
    if(method==='get'){
      if(body)requestUrl+=((requestUrl.indexOf('?')>=0?'&':'?')+body);
    }else{
      init.headers['Content-Type']='application/x-www-form-urlencoded;charset=UTF-8';
      init.body=body||'';
    }
    var submitBtn=null;var origHtml='';
    if(method!=='get'&&elt){
      submitBtn=elt.querySelector('button[type="submit"]')||((elt.tagName||'').toLowerCase()==='button'?elt:null);
      if(submitBtn&&!submitBtn.classList.contains('btn-loading')){
        origHtml=submitBtn.innerHTML;
        submitBtn.classList.add('btn-loading');
        submitBtn.innerHTML='\\u23f3 '+origHtml;
      }else{submitBtn=null}
    }
    let xhr={status:0,statusText:'',responseText:''};
    try{
      const resp=await fetch(requestUrl,init);
      const text=await resp.text();
      xhr={status:resp.status,statusText:resp.statusText,responseText:text};
      const detail={xhr:xhr,elt:elt,requestConfig:{verb:method}};
      if(!resp.ok){
        const ev=fire(elt,'htmx:responseError',detail);
        afterHook(elt,ev);
        return;
      }
      const swap=(elt.getAttribute('hx-swap')||'innerHTML').toLowerCase();
      const target=targetFor(elt);
      if(swap!=='none'&&target){
        if(swap.indexOf('outerhtml')>=0)target.outerHTML=text;
        else target.innerHTML=text;
        fire(target,'htmx:afterSwap',{target:target,elt:elt,xhr:xhr});
      }
      const ev=fire(elt,'htmx:afterRequest',detail);
      afterHook(elt,ev);
    }catch(e){
      xhr={status:0,statusText:e&&e.message?e.message:'Network error',responseText:''};
      const ev=fire(elt,'htmx:responseError',{xhr:xhr,elt:elt,requestConfig:{verb:method}});
      afterHook(elt,ev);
    }finally{
      if(submitBtn){submitBtn.classList.remove('btn-loading');submitBtn.innerHTML=origHtml}
    }
  }
  window.__aiemSend=send;
  document.addEventListener('submit',ev=>{
    const form=ev.target&&ev.target.closest?ev.target.closest('form[hx-post],form[hx-get]'):null;
    if(!form)return;
    const submitter=ev.submitter;
    const confirmText=(submitter&&submitter.getAttribute&&submitter.getAttribute('hx-confirm'))||form.getAttribute('hx-confirm');
    if(confirmText&&!window.confirm(confirmText)){ev.preventDefault();return;}
    const post=form.getAttribute('hx-post');
    const get=form.getAttribute('hx-get');
    if(!post&&!get)return;
    ev.preventDefault();
    send(form,post?'post':'get',post||get,bodyFor(form,submitter));
  });
  document.addEventListener('click',ev=>{
    const target=ev.target instanceof Element?ev.target:null;
    if(!target)return;
    var clickedBtn=target.closest?target.closest('button'):null;
    if(clickedBtn&&clickedBtn.type==='button'&&!clickedBtn.getAttribute('hx-post')&&!clickedBtn.getAttribute('hx-get'))return;
    const elt=target.closest('[hx-post],[hx-get]');
    if(!elt||elt.matches('form'))return;
    var htTrigger=elt.getAttribute('hx-trigger')||'';
    if(htTrigger&&htTrigger.indexOf('click')<0&&htTrigger.indexOf('submit')<0)return;
    const confirmText=elt.getAttribute('hx-confirm');
    if(confirmText&&!window.confirm(confirmText)){ev.preventDefault();return;}
    const post=elt.getAttribute('hx-post');
    const get=elt.getAttribute('hx-get');
    if(!post&&!get)return;
    ev.preventDefault();
    send(elt,post?'post':'get',post||get,bodyFor(elt,elt));
  });
  const inputTimers=new WeakMap();
  document.addEventListener('input',ev=>{
    const el=ev.target instanceof Element?ev.target:null;
    const form=el&&el.closest?el.closest('form[hx-get]'):null;
    if(!form||!(form.getAttribute('hx-trigger')||'').includes('input'))return;
    if(inputTimers.has(form))clearTimeout(inputTimers.get(form));
    inputTimers.set(form,setTimeout(()=>send(form,'get',form.getAttribute('hx-get'),bodyFor(form,null)),220));
  });
  window.htmx={trigger:function(elt,name){
    if(name==='refresh'&&elt&&elt.getAttribute&&elt.getAttribute('hx-get')){
      let body='';
      const id=elt.getAttribute('id');
      if(id){
        const form=document.querySelector('form[hx-target="#'+id.replace(/"/g,'\\"')+'"]');
        if(form)body=bodyFor(form,null);
      }
      send(elt,'get',elt.getAttribute('hx-get'),body);
    }
    else fire(elt||document.body,name,{elt:elt});
  }};
  if(window.EventSource&&document.body&&document.body.getAttribute('sse-connect')){
    try{
      const es=new EventSource(document.body.getAttribute('sse-connect'));
      es.onopen=()=>fire(document.body,'htmx:sseOpen',{source:es});
      es.onerror=()=>fire(document.body,'htmx:sseError',{source:es});
      es.onmessage=ev=>fire(document.body,'htmx:sseMessage',{data:ev.data,source:es});
    }catch(e){}
  }
})();

(function(){
  var obs=new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if(!entry.isIntersecting)return;
      var el=entry.target;
      obs.unobserve(el);
      if(el.__aiemLoaded)return;
      el.__aiemLoaded=true;
      var get=el.getAttribute('hx-get');
      if(get&&window.__aiemSend)window.__aiemSend(el,'get',get,'');
    });
  },{threshold:0.05});
  function setup(root){
    (root||document).querySelectorAll('[hx-trigger]').forEach(function(el){
      if(el.__aiemObs)return;
      var trigger=el.getAttribute('hx-trigger')||'';
      if(trigger.indexOf('intersect')>=0){
        el.__aiemObs=true;
        obs.observe(el);
      }
      if(trigger.indexOf('load')>=0&&!el.__aiemLoaded){
        el.__aiemObs=true;
        el.__aiemLoaded=true;
        var get=el.getAttribute('hx-get');
        if(get&&window.__aiemSend){
          setTimeout(function(){window.__aiemSend(el,'get',get,'')},10);
        }
      }
    });
  }
  window.__aiemToggleDetail=function(id){
    var el=document.getElementById(id);
    if(!el)return;
    el.toggleAttribute('hidden');
    if(!el.hidden){
      setTimeout(function(){
        el.querySelectorAll('[hx-trigger]').forEach(function(slot){
          var trigger=slot.getAttribute('hx-trigger')||'';
          if(trigger.indexOf('intersect')<0)return;
          if(slot.__aiemLoaded)return;
          slot.__aiemLoaded=true;
          var get=slot.getAttribute('hx-get');
          if(get&&window.__aiemSend)window.__aiemSend(slot,'get',get,'');
        });
      },50);
    }
  };
  if(document.body)setup(document);
  document.addEventListener('DOMContentLoaded',function(){setup(document)});
  if(document.body)document.body.addEventListener('htmx:afterSwap',function(ev){setup(ev.detail&&ev.detail.target?ev.detail.target:document)});
})();

(function(){
  function toast(level,msg){
    const root=document.getElementById('toasts');
    if(!root)return;
    const el=document.createElement('div');
    el.className='toast toast-'+(level||'info');
    el.textContent=window.aiemTranslate?window.aiemTranslate(msg):msg;
    root.appendChild(el);
    requestAnimationFrame(()=>el.classList.add('show'));
    setTimeout(()=>{el.classList.remove('show');setTimeout(()=>el.remove(),250)},4000);
  }
  window.aiemToast=toast;
  function dot(){return document.getElementById('connection-dot')}
  function setTaskLine(s){
    const t=document.getElementById('global-task-indicator');
    if(t)t.textContent=window.aiemTranslate?window.aiemTranslate(s||''):(s||'');
  }
  const refreshTimers=new Map();
  function refreshResource(resource){
    if(!resource||typeof htmx==='undefined')return;
    if(refreshTimers.has(resource))clearTimeout(refreshTimers.get(resource));
    refreshTimers.set(resource,setTimeout(()=>{
      refreshTimers.delete(resource);
      document.querySelectorAll('[data-resource="'+resource+'"][hx-get]').forEach(el=>htmx.trigger(el,'refresh'));
    },40));
  }
  function refreshCurrentResources(){
    const seen=new Set();
    document.querySelectorAll('[data-resource]').forEach(el=>{
      const resource=el.getAttribute('data-resource');
      if(resource&&!seen.has(resource)){seen.add(resource);refreshResource(resource)}
    });
  }
  document.body.addEventListener('htmx:sseOpen',()=>{const d=dot();if(d){d.classList.remove('dead');d.classList.add('live')}});
  document.body.addEventListener('htmx:sseError',()=>{const d=dot();if(d){d.classList.remove('live');d.classList.add('dead')}});
  document.body.addEventListener('htmx:sseMessage',function(ev){
    try{
      const data=JSON.parse(ev.detail.data);
      if(data.kind==='toast')toast(data.level||'info',data.msg);
      else if(data.kind==='task_started'){toast('info',data.label);setTaskLine(data.label)}
      else if(data.kind==='task_progress')setTaskLine(data.note);
      else if(data.kind==='task_finished'){toast(data.ok?'success':'error',data.msg);setTaskLine('')}
      else if(data.kind==='invalidate')refreshResource(data.resource);
    }catch(e){}
  });
  document.body.addEventListener('htmx:afterRequest',function(ev){
    const d=ev.detail||{};
    const xhr=d.xhr;
    const elt=d.elt;
    const verb=((d.requestConfig&&d.requestConfig.verb)||(elt&&elt.getAttribute&&elt.getAttribute('hx-post')?'post':'')).toLowerCase();
    if(!xhr||verb!=='post'||xhr.status<200||xhr.status>=300)return;
    if((xhr.responseText||'').trim()==='ok')refreshCurrentResources();
  });
  document.body.addEventListener('htmx:responseError',function(ev){
    toast('error','HTTP '+ev.detail.xhr.status+': '+(ev.detail.xhr.responseText||ev.detail.xhr.statusText));
  });
})();
`;

export function page(title: string, active: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" type="image/png" href="${FAVICON}">
  <title>aiem \u00b7 ${esc(title)}</title>
  <style>${CSS}</style>
</head>
<body hx-ext="sse" sse-connect="/events">
  <div class="app-shell">
    <aside class="sidebar">
      <div class="sidebar-header">aiem</div>
      <nav class="sidebar-nav">
        ${NAV.map((g) => `
          <div class="nav-group">
            <div class="nav-group-label">${esc(g.label)}</div>
            ${g.items.map(([p, l]) => `<a href="${p}" class="nav-item${active === p ? " active" : ""}"><span class="nav-item-text">${esc(l)}</span></a>`).join("")}
          </div>
        `).join("")}
      </nav>
      <div class="sidebar-footer">
        <div class="conn-status">
          <span id="connection-dot" class="conn-dot"></span>
          <span id="global-task-indicator" class="conn-label"></span>
        </div>
        <button id="theme-toggle" type="button" class="nav-item sidebar-button">
          <span class="nav-item-text">Toggle theme</span>
        </button>
        <div class="lang-switch" aria-label="Language">
          <button type="button" class="lang-btn" data-aiem-lang="en">EN</button>
          <button type="button" class="lang-btn" data-aiem-lang="zh">\u4e2d\u6587</button>
        </div>
      </div>
    </aside>
    <main class="main-content">
      <div id="toasts" class="toast-area"></div>
      <section class="page-body">${body}</section>
    </main>
  </div>
  <script>${JS}</script>
</body>
</html>`;
}

export function pageHeader(title: string, subtitle: string, actions: string): string {
  return `<div class="toolbar">
    <div class="toolbar-copy">
      <h1 class="toolbar-title">${esc(title)}</h1>
      ${subtitle ? `<p class="toolbar-sub">${esc(subtitle)}</p>` : ""}
    </div>
    <div class="toolbar-actions">${actions}</div>
  </div>`;
}

export function settingsGroup(title: string, inner: string): string {
  return `<div class="group-panel">
    ${title ? `<div class="group-panel-title">${esc(title)}</div>` : ""}
    ${inner}
  </div>`;
}

export function settingsRow(label: string, desc: string, control: string): string {
  return `<div class="settings-row">
    <div class="settings-row-label">
      <div class="label-text">${esc(label)}</div>
      ${desc ? `<div class="label-desc">${esc(desc)}</div>` : ""}
    </div>
    <div class="settings-row-control">${control}</div>
  </div>`;
}

export function card(inner: string): string {
  return `<div class="aiem-card">${inner}</div>`;
}

export function emptyState(title: string, sub: string): string {
  return `<div class="empty-state">
    <div class="empty-state-title">${esc(title)}</div>
    ${sub ? `<div class="empty-state-sub">${esc(sub)}</div>` : ""}
  </div>`;
}

export function btnPrimary(label: string): string {
  return `<button type="submit" class="btn-primary">${esc(label)}</button>`;
}
export function btnSecondary(label: string): string {
  return `<button type="submit" class="btn-secondary">${esc(label)}</button>`;
}
export function btnDanger(label: string): string {
  return `<button type="submit" class="btn-danger">${esc(label)}</button>`;
}

export type TagKind = "neutral" | "success" | "danger";
export function tag(label: string, kind: TagKind): string {
  const cls = kind === "success" ? "tag tag-success" : kind === "danger" ? "tag tag-danger" : "tag tag-neutral";
  return `<span class="${cls}">${esc(label)}</span>`;
}

export function ideOptions(selected?: string): string {
  return IDES.map((i) => `<option value="${i.id}"${i.id === selected ? " selected" : ""}>${esc(i.displayName)}</option>`).join("");
}

import { IDES } from "../core/ide.js";

export { esc };
