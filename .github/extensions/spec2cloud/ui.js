"use strict";

// ---------------------------------------------------------------------------
// Spec2Cloud Cockpit — front-end controller.
// ---------------------------------------------------------------------------

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
};

let STATE = null;
let selectedEnv = null;
let userPickedEnv = false;
// Active details view so auto-refresh keeps it current.
let detail = null; // { kind: 'env'|'resources'|'doc', env?, stage? }

const STAGE_ICONS = {
    completed: "✓",
    running: "↻",
    stopped: "▮▮",
    waiting: "?",
    pending: "•",
};

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
function fmtDuration(ms) {
    if (ms == null || !isFinite(ms) || ms < 0) return "—";
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
function fmtShort(ms) {
    if (ms == null || ms < 0) return "";
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
}
function fmtNum(n) {
    if (n == null) return "0";
    if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
    return String(n);
}
function esc(s) {
    return String(s == null ? "" : s).replace(
        /[&<>"']/g,
        (c) =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
}

// ---------------------------------------------------------------------------
// Minimal markdown renderer (headings, lists, code, links, emphasis, hr, quote)
// ---------------------------------------------------------------------------
function renderMarkdown(src) {
    const lines = src.replace(/\r\n/g, "\n").split("\n");
    let html = "";
    let inCode = false;
    let listType = null;
    const closeList = () => {
        if (listType) {
            html += `</${listType}>`;
            listType = null;
        }
    };
    const inline = (t) =>
        esc(t)
            .replace(/`([^`]+)`/g, "<code>$1</code>")
            .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
            .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    for (const raw of lines) {
        if (/^```/.test(raw)) {
            if (inCode) {
                html += "</code></pre>";
                inCode = false;
            } else {
                closeList();
                html += "<pre><code>";
                inCode = true;
            }
            continue;
        }
        if (inCode) {
            html += esc(raw) + "\n";
            continue;
        }
        if (/^\s*$/.test(raw)) {
            closeList();
            continue;
        }
        let m;
        if ((m = /^(#{1,6})\s+(.*)$/.exec(raw))) {
            closeList();
            const lvl = Math.min(m[1].length, 3);
            html += `<h${lvl}>${inline(m[2])}</h${lvl}>`;
        } else if (/^\s*[-*+]\s+/.test(raw)) {
            if (listType !== "ul") {
                closeList();
                html += "<ul>";
                listType = "ul";
            }
            html += `<li>${inline(raw.replace(/^\s*[-*+]\s+/, ""))}</li>`;
        } else if (/^\s*\d+\.\s+/.test(raw)) {
            if (listType !== "ol") {
                closeList();
                html += "<ol>";
                listType = "ol";
            }
            html += `<li>${inline(raw.replace(/^\s*\d+\.\s+/, ""))}</li>`;
        } else if (/^>\s?/.test(raw)) {
            closeList();
            html += `<blockquote>${inline(raw.replace(/^>\s?/, ""))}</blockquote>`;
        } else if (/^(-{3,}|\*{3,})$/.test(raw.trim())) {
            closeList();
            html += "<hr/>";
        } else {
            closeList();
            html += `<p>${inline(raw)}</p>`;
        }
    }
    if (inCode) html += "</code></pre>";
    closeList();
    return html;
}

// ---------------------------------------------------------------------------
// Details panel
// ---------------------------------------------------------------------------
function openDetails(title) {
    $("#details-title").textContent = title;
    $("#details").hidden = false;
}
function closeDetails() {
    detail = null;
    $("#details").hidden = true;
    syncDetailButtons();
}
$("#details-close").addEventListener("click", closeDetails);

function syncDetailButtons() {
    $("#btn-env")?.classList.toggle("active", detail?.kind === "env");
    $("#btn-rg")?.classList.toggle("active", detail?.kind === "resources");
    $("#btn-session")?.classList.toggle("active", detail?.kind === "session");
    $("#btn-todos")?.classList.toggle("active", detail?.kind === "todos");
    $("#stat-mcp")?.classList.toggle("active", detail?.kind === "stat" && detail.stat === "mcp");
    $("#stat-skills")?.classList.toggle("active", detail?.kind === "stat" && detail.stat === "skills");
    $("#stat-tokens")?.classList.toggle("active", detail?.kind === "stat" && detail.stat === "tokens");
    document.querySelectorAll(".stage").forEach((s) => {
        s.classList.toggle(
            "selected",
            detail?.kind === "doc" && s.dataset.stage === detail.stage,
        );
    });
}

async function showEnvFile(env, { silent } = {}) {
    detail = { kind: "env", env };
    openDetails(`.env · ${env}`);
    syncDetailButtons();
    const body = $("#details-body");
    if (!silent) body.innerHTML = '<div class="loading">Reading .env…</div>';
    try {
        const r = await fetch(`/api/envfile?env=${encodeURIComponent(env)}`);
        const data = await r.json();
        if (detail?.kind !== "env" || detail.env !== env) return;
        if (!data.exists) {
            body.innerHTML = `<div class="err">No .env file for "${esc(env)}".</div>`;
            return;
        }
        body.innerHTML = `<pre class="mono">${esc(data.raw)}</pre>`;
    } catch (e) {
        body.innerHTML = `<div class="err">${esc(e.message || e)}</div>`;
    }
}

async function showResources(env, { force } = {}) {
    detail = { kind: "resources", env };
    openDetails(`Azure resources · ${env}`);
    syncDetailButtons();
    const body = $("#details-body");
    body.innerHTML = '<div class="loading">Querying Azure Resource Manager…</div>';
    try {
        const r = await fetch(`/api/resources?env=${encodeURIComponent(env)}`);
        const data = await r.json();
        if (detail?.kind !== "resources" || detail.env !== env) return;
        if (data.error) {
            body.innerHTML =
                `<div class="err">${esc(data.error)}</div>` +
                (data.cliError ? `<div class="err">${esc(data.cliError)}</div>` : "");
            return;
        }
        const rows = (data.resources || [])
            .map(
                (x) => `<tr>
                    <td>${esc(x.name)}</td>
                    <td><code>${esc((x.type || "").replace(/^Microsoft\./, ""))}</code></td>
                    <td>${esc(x.location || "")}</td>
                    <td>${
                        x.provisioningState
                            ? `<span class="badge ${x.provisioningState === "Succeeded" ? "" : "gray"}">${esc(x.provisioningState)}</span>`
                            : ""
                    }</td>
                </tr>`,
            )
            .join("");
        const head = `<div style="margin-bottom:10px;font-size:12px;color:var(--s2c-muted)">
            <strong>${esc(data.resourceGroup || "")}</strong>
            · ${data.resources?.length || 0} resources
            · <span class="badge gray">${esc(data.source || "")}</span>
            ${data.location ? "· " + esc(data.location) : ""}
            <button class="iconbtn" id="rg-refresh" style="float:right;padding:2px 8px">↻ refresh</button>
        </div>`;
        body.innerHTML = data.resources?.length
            ? head +
              `<table><thead><tr><th>Name</th><th>Type</th><th>Location</th><th>State</th></tr></thead><tbody>${rows}</tbody></table>`
            : head + '<div class="hc-empty">No resources in this group yet.</div>';
        $("#rg-refresh")?.addEventListener("click", () => showResources(env, { force: true }));
    } catch (e) {
        body.innerHTML = `<div class="err">${esc(e.message || e)}</div>`;
    }
}

async function showDoc(stage, { silent } = {}) {
    detail = { kind: "doc", stage };
    const label = (STATE?.loop?.stages || []).find((s) => s.id === stage)?.label || stage;
    openDetails(`${label} · docs`);
    syncDetailButtons();
    const body = $("#details-body");
    if (!silent) body.innerHTML = '<div class="loading">Loading document…</div>';
    try {
        const r = await fetch(`/api/doc?stage=${encodeURIComponent(stage)}`);
        const data = await r.json();
        if (detail?.kind !== "doc" || detail.stage !== stage) return;
        if (!data.exists) {
            body.innerHTML = `<div class="hc-empty">Not generated yet — <code>${esc(data.path)}</code> does not exist.</div>`;
            return;
        }
        body.innerHTML = `<div class="md">${renderMarkdown(data.content)}</div>`;
    } catch (e) {
        body.innerHTML = `<div class="err">${esc(e.message || e)}</div>`;
    }
}

function refreshActiveDetail() {
    if (!detail) return;
    if (detail.kind === "env") showEnvFile(detail.env, { silent: true });
    else if (detail.kind === "doc") showDoc(detail.stage, { silent: true });
    else if (detail.kind === "session") showSession({ silent: true });
    else if (detail.kind === "todos") showTodos({ silent: true });
    else if (detail.kind === "stat") renderStatDetail();
    // resources are network-bound: refreshed manually.
}

const TODO_BADGE = {
    done: "",
    in_progress: "gray",
    pending: "gray",
    blocked: "gray",
};
const TODO_ICON = {
    done: "✓",
    in_progress: "◐",
    pending: "○",
    blocked: "✕",
};

async function showSession({ silent } = {}) {
    detail = { kind: "session" };
    openDetails("Session details");
    syncDetailButtons();
    const body = $("#details-body");
    if (!silent) body.innerHTML = '<div class="loading">Loading session…</div>';
    try {
        const r = await fetch("/api/session");
        const d = await r.json();
        if (detail?.kind !== "session") return;
        const started = d.startTime ? new Date(d.startTime).toLocaleString() : "—";
        const meta = [
            ["Session", esc((d.name || "—").split("\n")[0])],
            ["Session ID", `<code>${esc(d.sessionId || "—")}</code>`],
            ["Status", esc(d.status || "—")],
            ["Model", esc(d.model || "—")],
            ["Repository", esc(d.repository || "—")],
            ["Branch", esc(d.branch || "—")],
            ["Started", esc(started)],
            ["Working dir", `<code>${esc(d.cwd || "—")}</code>`],
            ["Workspace", `<code>${esc(d.workspacePath || "—")}</code>`],
        ]
            .map(
                ([k, v]) =>
                    `<tr><th style="width:120px">${esc(k)}</th><td>${v}</td></tr>`,
            )
            .join("");
        body.innerHTML = `<table class="env-table"><tbody>${meta}</tbody></table>`;
    } catch (e) {
        body.innerHTML = `<div class="err">${esc(e.message || e)}</div>`;
    }
}

async function showTodos({ silent } = {}) {
    detail = { kind: "todos" };
    openDetails("Session todos");
    syncDetailButtons();
    const body = $("#details-body");
    if (!silent) body.innerHTML = '<div class="loading">Loading todos…</div>';
    try {
        const r = await fetch("/api/session");
        const d = await r.json();
        if (detail?.kind !== "todos") return;
        const t = d.todos || {};
        if (!t.available) {
            body.innerHTML = `<div class="hc-empty">No session todos${t.error ? " (" + esc(t.error) + ")" : ""}.</div>`;
            return;
        }
        if (!t.todos.length) {
            body.innerHTML =
                '<div class="hc-empty">No todos recorded for this session.</div>';
            return;
        }
        const c = t.counts || {};
        const summary =
            `<div style="margin:0 0 12px;display:flex;gap:6px;flex-wrap:wrap">` +
            `<span class="badge">${c.done || 0} done</span>` +
            `<span class="badge gray">${c.in_progress || 0} in progress</span>` +
            `<span class="badge gray">${c.pending || 0} pending</span>` +
            (c.blocked ? `<span class="badge gray">${c.blocked} blocked</span>` : "") +
            `</div>`;
        const rows = t.todos
            .map(
                (x) => `<tr>
                    <td style="width:20px;text-align:center" title="${esc(x.status)}">${TODO_ICON[x.status] || "•"}</td>
                    <td>${esc(x.title)}${x.description ? `<div style="color:var(--s2c-muted);font-size:11px;margin-top:2px">${esc(x.description)}</div>` : ""}</td>
                    <td style="white-space:nowrap"><span class="badge ${TODO_BADGE[x.status] ?? "gray"}">${esc(x.status)}</span></td>
                </tr>`,
            )
            .join("");
        body.innerHTML = summary + `<table><tbody>${rows}</tbody></table>`;
    } catch (e) {
        body.innerHTML = `<div class="err">${esc(e.message || e)}</div>`;
    }
}

const STAT_TITLES = {
    mcp: "MCP / external tools",
    skills: "Skills invoked",
    tokens: "Token usage",
};

function showStat(kind) {
    detail = { kind: "stat", stat: kind };
    openDetails(STAT_TITLES[kind] || "Details");
    syncDetailButtons();
    renderStatDetail();
}

function statTable(label, breakdown, total) {
    const entries = Object.entries(breakdown || {}).sort((a, b) => b[1] - a[1]);
    const head = `<div style="margin:0 0 12px;font-size:12px;color:var(--s2c-muted)">
        <strong style="color:var(--s2c-fg,inherit);font-size:20px">${fmtNum(total)}</strong> total invocations`;
    if (!entries.length) {
        return head + `</div><div class="hc-empty">None recorded yet for this session.</div>`;
    }
    const rows = entries
        .map(
            ([name, n]) =>
                `<tr><td>${esc(name)}</td><td style="text-align:right;font-variant-numeric:tabular-nums">${fmtNum(n)}</td></tr>`,
        )
        .join("");
    return (
        head +
        ` · ${entries.length} distinct</div>` +
        `<table><thead><tr><th>${esc(label)}</th><th style="text-align:right">Count</th></tr></thead><tbody>${rows}</tbody></table>`
    );
}

function tokenTable(tk) {
    const avg = tk.assistantMessages ? Math.round(tk.output / tk.assistantMessages) : 0;
    const row = (k, v) =>
        `<tr><td>${esc(k)}</td><td style="text-align:right;font-variant-numeric:tabular-nums">${v}</td></tr>`;
    return (
        `<div style="margin:0 0 12px;font-size:12px;color:var(--s2c-muted)">
            <strong style="font-size:20px">${tk.output.toLocaleString()}</strong> output tokens</div>` +
        `<table><tbody>` +
        row("Output tokens", tk.output.toLocaleString()) +
        row("Assistant messages", tk.assistantMessages) +
        row("Avg tokens / message", avg.toLocaleString()) +
        row("Turns", tk.turns) +
        (tk.contextLimit ? row("Response limit", tk.contextLimit.toLocaleString()) : "") +
        `</tbody></table>` +
        `<p style="margin-top:12px;font-size:11px;color:var(--s2c-muted)">Input-token counts are not emitted to the session log, so only model output tokens are tracked.</p>`
    );
}

function renderStatDetail() {
    if (detail?.kind !== "stat") return;
    const st = STATE?.stats;
    const body = $("#details-body");
    if (!st) {
        body.innerHTML = '<div class="hc-empty">No stats yet.</div>';
        return;
    }
    if (detail.stat === "mcp") body.innerHTML = statTable("Tool", st.mcpTools.breakdown, st.mcpTools.count);
    else if (detail.stat === "skills") body.innerHTML = statTable("Skill", st.skills.breakdown, st.skills.count);
    else body.innerHTML = tokenTable(st.tokens);
}

function openExternal(uri) {
    try {
        window.open(uri, "_blank", "noopener,noreferrer");
    } catch {
        /* ignore */
    }
}

function showFrontend(uri) {
    detail = { kind: "frontend", uri };
    openDetails(`Frontend · ${selectedEnv || ""}`.trim());
    syncDetailButtons();
    const body = $("#details-body");
    body.innerHTML = `
        <div class="fe-bar">
            <code class="fe-url" title="${esc(uri)}">${esc(uri)}</code>
            <span class="fe-bar-actions">
                <button class="iconbtn" id="fe-reload" data-tip="Reload">↻</button>
                <button class="iconbtn" id="fe-open" data-tip="Open in external window">↗</button>
            </span>
        </div>
        <div class="fe-frame-wrap">
            <iframe class="fe-frame" id="fe-frame" src="${esc(uri)}"
                referrerpolicy="no-referrer" sandbox="allow-same-origin allow-scripts allow-forms allow-popups"></iframe>
            <div class="fe-note">If the page stays blank, the site likely blocks embedding — use
                <a href="#" id="fe-open2">open in an external window</a>.</div>
        </div>`;
    $("#fe-open")?.addEventListener("click", () => openExternal(uri));
    $("#fe-open2")?.addEventListener("click", (e) => {
        e.preventDefault();
        openExternal(uri);
    });
    $("#fe-reload")?.addEventListener("click", () => {
        const f = $("#fe-frame");
        if (f) f.src = uri;
    });
}

// ---------------------------------------------------------------------------
// Command dispatch
// ---------------------------------------------------------------------------
async function copyText(text) {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        /* fall through to legacy path */
    }
    try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
    } catch {
        return false;
    }
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------
function renderHeader(s) {
    const ws = s.workspace || {};
    const repo = ws.repository || ws.repoRoot || "—";
    $("#ws-repo").textContent = repo.includes("/") ? repo.split("/").pop() : repo;
    $("#ws-branch").textContent = ws.branch ? `⎇ ${ws.branch}` : "";
    $("#ws-branch").hidden = !ws.branch;
    $("#ws-model").textContent = s.session.model || "";
    $("#ws-model").hidden = !s.session.model;

    const st = s.session.status || "idle";
    const pill = $("#session-status");
    pill.className = "status-pill " + st;
    pill.querySelector(".status-label").textContent = st;
    $("#session-elapsed").textContent = fmtDuration(s.session.elapsedMs);
}

function renderEnv(s) {
    const row = $("#env-row");
    const envs = s.environments;
    if (!envs || !envs.available) {
        row.hidden = true;
        return;
    }
    row.hidden = false;
    const sel = $("#env-select");

    // Default selection: user pick > config default > single env > first.
    if (!userPickedEnv) {
        selectedEnv =
            (envs.defaultEnv && envs.list.includes(envs.defaultEnv) && envs.defaultEnv) ||
            (envs.list.length === 1 ? envs.list[0] : selectedEnv || envs.list[0]);
    }
    if (!envs.list.includes(selectedEnv)) selectedEnv = envs.list[0];

    const current = sel.value;
    const optsChanged =
        sel.options.length !== envs.list.length ||
        envs.list.some((n, i) => sel.options[i]?.value !== n);
    if (optsChanged) {
        sel.innerHTML = envs.list
            .map((n) => `<option value="${esc(n)}">${esc(n)}</option>`)
            .join("");
    }
    sel.value = selectedEnv;
    if (current !== sel.value && document.activeElement === sel) sel.value = current;

    const vars = envs.envs?.[selectedEnv]?.vars || {};
    const rg = vars.AZURE_RESOURCE_GROUP;
    $("#rg-label").textContent = rg || "resources";
    $("#btn-rg").dataset.tip = rg ? `Resource group: ${rg}` : "Resource group (not set)";
}

$("#env-select").addEventListener("change", (e) => {
    userPickedEnv = true;
    selectedEnv = e.target.value;
    renderEnv(STATE);
    if (detail?.kind === "env") showEnvFile(selectedEnv);
    else if (detail?.kind === "resources") showResources(selectedEnv);
});
$("#btn-env").addEventListener("click", () => selectedEnv && showEnvFile(selectedEnv));
$("#btn-rg").addEventListener("click", () => selectedEnv && showResources(selectedEnv));
$("#btn-session").addEventListener("click", () => showSession());
$("#btn-todos").addEventListener("click", () => showTodos());
$("#stat-mcp").addEventListener("click", () => showStat("mcp"));
$("#stat-skills").addEventListener("click", () => showStat("skills"));
$("#stat-tokens").addEventListener("click", () => showStat("tokens"));

function breakdownHtml(title, breakdown) {
    const keys = Object.keys(breakdown || {});
    if (!keys.length) return `<h4>${title}</h4><div class="hc-empty">None yet.</div>`;
    const rows = keys
        .sort((a, b) => breakdown[b] - breakdown[a])
        .map(
            (k) =>
                `<div class="hc-row"><span class="k">${esc(k)}</span><span class="v">${breakdown[k]}</span></div>`,
        )
        .join("");
    return `<h4>${title}</h4>${rows}`;
}

function renderStats(s) {
    const st = s.stats;
    $('[data-field="mcp"]').textContent = fmtNum(st.mcpTools.count);
    $('[data-field="skills"]').textContent = fmtNum(st.skills.count);
    $('[data-field="tokens"]').textContent = fmtNum(st.tokens.output);

    const todos = s.session.todos || { total: 0 };
    $("#todo-count").textContent = todos.total ?? 0;
    const c = todos.counts || {};
    $("#btn-todos").dataset.tip = todos.available
        ? `Todos · ${c.done || 0} done / ${todos.total} total`
        : "Session todos";

    $("#hc-mcp").innerHTML = breakdownHtml("MCP / external tools", st.mcpTools.breakdown);
    $("#hc-skills").innerHTML = breakdownHtml("Skills invoked", st.skills.breakdown);
    $("#hc-tokens").innerHTML =
        `<h4>Token usage</h4>` +
        `<div class="hc-row"><span class="k">Output tokens</span><span class="v">${st.tokens.output.toLocaleString()}</span></div>` +
        `<div class="hc-row"><span class="k">Assistant messages</span><span class="v">${st.tokens.assistantMessages}</span></div>` +
        `<div class="hc-row"><span class="k">Turns</span><span class="v">${st.tokens.turns}</span></div>` +
        (st.tokens.contextLimit
            ? `<div class="hc-row"><span class="k">Response limit</span><span class="v">${st.tokens.contextLimit.toLocaleString()}</span></div>`
            : "");
}

function getFrontendUri() {
    const vars = STATE?.environments?.envs?.[selectedEnv]?.vars || {};
    let u = (vars.FRONTEND_URI || "").trim();
    if (!u) return "";
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    return u;
}

function frontendTipHtml(uri) {
    return `<div class="tip-frontend">
        <p class="tip-frontend-label">Live frontend</p>
        <code class="tip-uri" title="${esc(uri)}">${esc(uri)}</code>
        <div class="tip-actions">
            <button class="fe-btn fe-preview" data-uri="${esc(uri)}">Integrated browser</button>
            <button class="fe-btn fe-ext" data-uri="${esc(uri)}">External window</button>
        </div>
    </div>`;
}

function stageTip(stage) {
    let inner;
    if (stage.status === "stopped") {
        inner = `<p>Stopped — continue in chat:</p>
            <code class="cmd-copy" data-cmd="${esc(stage.command)}" title="Click to copy">${esc(stage.command)}</code>`;
    } else if (stage.status === "waiting") {
        inner = `<p>Waiting for your input — answer in the chat to continue.</p>`;
    } else if (stage.status === "running") {
        inner = `<p>Running now…</p>`;
    } else if (stage.status === "completed") {
        inner = `<p>Completed${stage.elapsedMs != null ? " in " + fmtShort(stage.elapsedMs) : ""}. Click to view <code>${esc(stage.file)}</code>.</p>`;
    } else {
        inner = `<p>Waiting on previous stage.</p>`;
    }
    let extra = "";
    if (stage.id === "deploy") {
        const uri = getFrontendUri();
        if (uri) extra = frontendTipHtml(uri);
    }
    return `<div class="stage-tip">${inner}${extra}</div>`;
}

function renderPipeline(s) {
    const loop = s.loop;
    const running = loop.stages.some((x) => x.status === "running" || x.status === "waiting");
    const pct = ((loop.completed + (running ? 0.5 : 0)) / loop.total) * 100;
    $("#progress-fill").style.width = `${pct}%`;

    const pipe = $("#pipeline");
    pipe.innerHTML = "";
    for (const stage of loop.stages) {
        const node = el("div", `stage ${stage.status}`);
        node.dataset.stage = stage.id;
        const meta =
            stage.status === "pending"
                ? ""
                : stage.elapsedMs != null
                  ? fmtShort(stage.elapsedMs)
                  : "";
        node.innerHTML =
            `<div class="connector"></div>` +
            `<div class="stage-node">${STAGE_ICONS[stage.status] || "•"}</div>` +
            `<div class="stage-label">${esc(stage.label)}</div>` +
            `<div class="stage-meta">${esc(meta)}</div>` +
            stageTip(stage);
        node.addEventListener("click", () => showDoc(stage.id));
        pipe.appendChild(node);
    }
    pipe.querySelectorAll(".cmd-copy").forEach((c) =>
        c.addEventListener("click", async (e) => {
            e.stopPropagation();
            await copyText(c.dataset.cmd);
            const prev = c.textContent;
            c.textContent = "Copied ✓";
            setTimeout(() => (c.textContent = prev), 1200);
        }),
    );
    pipe.querySelectorAll(".fe-preview").forEach((b) =>
        b.addEventListener("click", (e) => {
            e.stopPropagation();
            showFrontend(b.dataset.uri);
        }),
    );
    pipe.querySelectorAll(".fe-ext").forEach((b) =>
        b.addEventListener("click", (e) => {
            e.stopPropagation();
            openExternal(b.dataset.uri);
        }),
    );
    syncDetailButtons();
}

function render(s) {
    STATE = s;
    renderHeader(s);
    renderEnv(s);
    renderStats(s);
    renderPipeline(s);
    refreshActiveDetail();
    $("#gen-time").textContent =
        "updated " + new Date(s.generatedAt).toLocaleTimeString();
}

// ---------------------------------------------------------------------------
// Live connection (SSE) + local ticking clock between pushes.
// ---------------------------------------------------------------------------
function connect() {
    const es = new EventSource("/events");
    es.onopen = () => ($("#conn-state").textContent = "● live");
    es.onmessage = (ev) => {
        try {
            render(JSON.parse(ev.data));
        } catch {
            /* ignore */
        }
    };
    es.onerror = () => {
        $("#conn-state").textContent = "○ reconnecting…";
    };
}

// Smoothly advance the elapsed clocks between 2s server pushes.
setInterval(() => {
    if (!STATE || STATE.session.status !== "active") return;
    STATE.session.elapsedMs += 1000;
    $("#session-elapsed").textContent = fmtDuration(STATE.session.elapsedMs);
}, 1000);

connect();
