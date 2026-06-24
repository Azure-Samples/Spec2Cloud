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
    stopped: `<svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z"/></svg>`,
    waiting: "?",
    skipped: `<svg viewBox="0 0 16 16" width="13" height="13"><path fill="currentColor" d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/></svg>`,
    pending: "•",
};

// Human-friendly status labels for the top session pill.
const STATUS_LABEL = {
    active: "running",
    running: "running",
    waiting: "answer required",
    stopped: "idle",
    idle: "idle",
};

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
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
// Markdown renderer: headings, lists, GFM tables, fenced code (with mermaid),
// blockquotes, hr, links and inline emphasis.
// ---------------------------------------------------------------------------
function renderMarkdown(src) {
    const lines = src.replace(/\r\n/g, "\n").split("\n");
    let html = "";
    let inCode = false;
    let codeLang = "";
    let codeBuf = "";
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

    const flushCode = () => {
        if (codeLang.toLowerCase() === "mermaid") {
            // Mermaid source is rendered client-side; keep it raw (escaped).
            html += `<div class="mermaid">${esc(codeBuf.replace(/\n$/, ""))}</div>`;
        } else {
            const cls = codeLang
                ? ` class="language-${esc(codeLang)}"`
                : "";
            html += `<pre><code${cls}>${esc(codeBuf.replace(/\n$/, ""))}</code></pre>`;
        }
        codeBuf = "";
        codeLang = "";
    };

    // GFM table: a header row, a delimiter row of ---/:--:, then body rows.
    const isTableRow = (s) => /\|/.test(s) && /\S/.test(s);
    const isTableDelim = (s) =>
        /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)+\|?\s*$/.test(s);
    const splitRow = (s) =>
        s
            .trim()
            .replace(/^\|/, "")
            .replace(/\|$/, "")
            .split("|")
            .map((c) => c.trim());

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        if (/^```/.test(raw)) {
            if (inCode) {
                flushCode();
                inCode = false;
            } else {
                closeList();
                inCode = true;
                codeLang = raw.replace(/^```/, "").trim().split(/\s+/)[0] || "";
            }
            continue;
        }
        if (inCode) {
            codeBuf += raw + "\n";
            continue;
        }
        // GFM table detection (needs the next line to be a delimiter row).
        if (
            isTableRow(raw) &&
            i + 1 < lines.length &&
            isTableDelim(lines[i + 1])
        ) {
            closeList();
            const headers = splitRow(raw);
            const aligns = splitRow(lines[i + 1]).map((c) => {
                const l = c.startsWith(":");
                const r = c.endsWith(":");
                return l && r ? "center" : r ? "right" : l ? "left" : "";
            });
            let t = "<table><thead><tr>";
            headers.forEach((h, idx) => {
                const a = aligns[idx] ? ` style="text-align:${aligns[idx]}"` : "";
                t += `<th${a}>${inline(h)}</th>`;
            });
            t += "</tr></thead><tbody>";
            i += 2;
            for (; i < lines.length && isTableRow(lines[i]); i++) {
                const cells = splitRow(lines[i]);
                t += "<tr>";
                headers.forEach((_, idx) => {
                    const a = aligns[idx] ? ` style="text-align:${aligns[idx]}"` : "";
                    t += `<td${a}>${inline(cells[idx] ?? "")}</td>`;
                });
                t += "</tr>";
            }
            i--; // step back; loop will advance
            t += "</tbody></table>";
            html += t;
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
    if (inCode) flushCode();
    closeList();
    return html;
}

// ---------------------------------------------------------------------------
// Mermaid (lazy-initialised; bundle served from the loopback origin)
// ---------------------------------------------------------------------------
let mermaidReady = false;
function initMermaid() {
    if (mermaidReady || typeof window.mermaid === "undefined") return mermaidReady;
    const dark =
        (document.documentElement.getAttribute("data-color-mode") === "dark") ||
        matchMedia("(prefers-color-scheme: dark)").matches;
    try {
        window.mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: dark ? "dark" : "default",
            fontFamily:
                "var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)",
        });
        mermaidReady = true;
    } catch {
        /* leave un-ready; blocks stay as text */
    }
    return mermaidReady;
}

let mermaidSeq = 0;
async function renderMermaid(root) {
    const blocks = root.querySelectorAll(".mermaid:not([data-rendered])");
    if (!blocks.length || !initMermaid()) return;
    for (const el of blocks) {
        const code = el.textContent;
        el.setAttribute("data-rendered", "1");
        try {
            const { svg } = await window.mermaid.render(
                `mmd-${Date.now()}-${mermaidSeq++}`,
                code,
            );
            el.innerHTML = svg;
            el.classList.add("mermaid-rendered");
        } catch (e) {
            el.innerHTML = `<pre class="mermaid-err">${esc(
                (e && e.message) || String(e),
            )}</pre><pre>${esc(code)}</pre>`;
        }
    }
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
    $("#btn-foundry")?.classList.toggle("active", detail?.kind === "foundry");
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
        const resources = data.resources || [];
        const portalBase = "https://portal.azure.com/#@/resource";
        const shortType = (t) => (t || "").replace(/^Microsoft\./, "");
        const types = [...new Set(resources.map((x) => x.type).filter(Boolean))].sort();

        const head = `<div class="rg-head">
            <strong>${esc(data.resourceGroup || "")}</strong>
            · <span id="rg-shown">${resources.length}</span>/${resources.length} resources
            · <span class="badge gray">${esc(data.source || "")}</span>
            ${data.location ? "· " + esc(data.location) : ""}
            <button class="iconbtn" id="rg-refresh" style="float:right;padding:2px 8px">↻ refresh</button>
        </div>
        <div class="rg-filters">
            <input id="rg-filter-name" class="rg-input" type="search" placeholder="Filter by name…" autocomplete="off" />
            <select id="rg-filter-type" class="rg-input">
                <option value="">All types</option>
                ${types.map((t) => `<option value="${esc(t)}">${esc(shortType(t))}</option>`).join("")}
            </select>
        </div>`;

        if (!resources.length) {
            body.innerHTML = head + '<div class="hc-empty">No resources in this group yet.</div>';
            $("#rg-refresh")?.addEventListener("click", () => showResources(env, { force: true }));
            return;
        }

        body.innerHTML =
            head +
            `<table class="rg-table"><thead><tr><th>Name</th><th>Location</th><th>State</th><th></th></tr></thead><tbody id="rg-tbody"></tbody></table>`;

        const tbody = $("#rg-tbody");
        const nameInput = $("#rg-filter-name");
        const typeInput = $("#rg-filter-type");

        function renderRows() {
            const q = (nameInput.value || "").trim().toLowerCase();
            const ty = typeInput.value || "";
            const filtered = resources.filter(
                (x) =>
                    (!q || (x.name || "").toLowerCase().includes(q)) &&
                    (!ty || x.type === ty),
            );
            $("#rg-shown").textContent = filtered.length;
            tbody.innerHTML = filtered.length
                ? filtered
                      .map((x) => {
                          const fullType = x.type || "";
                          const portal = x.id ? portalBase + x.id + "/overview" : "";
                          return `<tr>
                    <td title="${esc(fullType)}">${esc(x.name)}</td>
                    <td>${esc(x.location || "")}</td>
                    <td>${
                        x.provisioningState
                            ? `<span class="badge ${x.provisioningState === "Succeeded" ? "" : "gray"}">${esc(x.provisioningState)}</span>`
                            : ""
                    }</td>
                    <td class="rg-portal-cell">${
                        portal
                            ? `<button class="iconbtn rg-portal" data-uri="${esc(portal)}" title="Open in Azure portal" aria-label="Open ${esc(x.name)} in Azure portal">↗</button>`
                            : ""
                    }</td>
                </tr>`;
                      })
                      .join("")
                : `<tr><td colspan="4" class="hc-empty">No resources match the filter.</td></tr>`;
            tbody.querySelectorAll(".rg-portal").forEach((b) =>
                b.addEventListener("click", (e) => {
                    e.stopPropagation();
                    openExternal(b.dataset.uri);
                }),
            );
        }

        nameInput.addEventListener("input", renderRows);
        typeInput.addEventListener("change", renderRows);
        renderRows();
        $("#rg-refresh")?.addEventListener("click", () => showResources(env, { force: true }));
    } catch (e) {
        body.innerHTML = `<div class="err">${esc(e.message || e)}</div>`;
    }
}

const FOUNDRY_SECTIONS = [
    ["agents", "Agents"],
    ["deployments", "Deployments"],
    ["toolboxes", "Toolboxes"],
    ["tools", "Tools"],
    ["skills", "Skills"],
    ["knowledge", "Knowledge"],
];

function foundrySectionHtml(label, section) {
    if (!section) return "";
    if (section.error) {
        return `<div class="fdry-section">
            <div class="fdry-head">${esc(label)}</div>
            <div class="fdry-err">${esc(section.error)}</div>
        </div>`;
    }
    const items = section.items || [];
    const rows = items.length
        ? items
              .map(
                  (it) => `<li class="fdry-item">
                    <span class="fdry-name" title="${esc(it.name)}">${esc(it.name)}</span>
                    ${it.sub ? `<span class="fdry-sub" title="${esc(it.sub)}">${esc(it.sub)}</span>` : ""}
                    ${it.portal ? `<button class="iconbtn fdry-portal" data-uri="${esc(it.portal)}" title="Open in Foundry portal" aria-label="Open ${esc(it.name)} in Foundry portal">↗</button>` : ""}
                </li>`,
              )
              .join("")
        : `<li class="fdry-empty">None</li>`;
    return `<div class="fdry-section">
        <div class="fdry-head">${esc(label)} <span class="fdry-count">${items.length}</span></div>
        <ul class="fdry-list">${rows}</ul>
    </div>`;
}

async function showFoundry(env, { force } = {}) {
    detail = { kind: "foundry", env };
    openDetails(`Foundry project · ${env}`);
    syncDetailButtons();
    const body = $("#details-body");
    body.innerHTML = '<div class="loading">Querying the Foundry project…</div>';
    try {
        const r = await fetch(`/api/foundry?env=${encodeURIComponent(env)}`);
        const data = await r.json();
        if (detail?.kind !== "foundry" || detail.env !== env) return;
        if (data.error) {
            body.innerHTML = `<div class="err">${esc(data.error)}</div>`;
            return;
        }
        const head = `<div style="margin-bottom:10px;font-size:12px;color:var(--s2c-muted)">
            <code title="${esc(data.endpoint || "")}">${esc((data.endpoint || "").replace(/^https?:\/\//, ""))}</code>
            <button class="iconbtn" id="fdry-refresh" style="float:right;padding:2px 8px">↻ refresh</button>
        </div>`;
        const sections = FOUNDRY_SECTIONS.map(([key, label]) =>
            foundrySectionHtml(label, data.sections?.[key]),
        ).join("");
        body.innerHTML = head + `<div class="fdry-grid">${sections}</div>`;
        $("#fdry-refresh")?.addEventListener("click", () => showFoundry(env, { force: true }));
        body.querySelectorAll(".fdry-portal").forEach((b) =>
            b.addEventListener("click", (e) => {
                e.stopPropagation();
                openExternal(b.dataset.uri);
            }),
        );
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
        renderMermaid(body);
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

async function openAppBrowser(uri, btn) {
    const prev = btn ? btn.textContent : null;
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Opening…";
    }
    try {
        const r = await fetch("/api/open-browser", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: uri, title: `Frontend · ${selectedEnv || ""}`.trim() }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d.error) throw new Error(d.error || "failed");
        if (btn) btn.textContent = "Opened ✓";
    } catch {
        // Fallback: open in an external window if the in-app browser is unavailable.
        openExternal(uri);
        if (btn) btn.textContent = "Opened ↗";
    } finally {
        if (btn)
            setTimeout(() => {
                btn.textContent = prev;
                btn.disabled = false;
            }, 1500);
    }
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
    pill.querySelector(".status-label").textContent = STATUS_LABEL[st] || st;
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
    $("#btn-rg").dataset.tip = rg ? `Resources · ${rg}` : "Azure resources (group not set)";

    const hasFoundry = !!(vars.AZURE_AI_FOUNDRY_PROJECT_ID || "").trim();
    const fbtn = $("#btn-foundry");
    if (fbtn) fbtn.hidden = !hasFoundry;
    if (!hasFoundry && detail?.kind === "foundry") closeDetails();
}

$("#env-select").addEventListener("change", (e) => {
    userPickedEnv = true;
    selectedEnv = e.target.value;
    renderEnv(STATE);
    if (detail?.kind === "env") showEnvFile(selectedEnv);
    else if (detail?.kind === "resources") showResources(selectedEnv);
    else if (detail?.kind === "foundry") showFoundry(selectedEnv);
});
$("#btn-env").addEventListener("click", () => selectedEnv && showEnvFile(selectedEnv));
$("#btn-rg").addEventListener("click", () => selectedEnv && showResources(selectedEnv));
$("#btn-foundry").addEventListener("click", () => selectedEnv && showFoundry(selectedEnv));
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
        inner = `<p>Answer required — respond in the chat to continue.</p>`;
    } else if (stage.status === "skipped") {
        inner = `<p>Skipped — a later stage completed without this one. Run <code class="cmd-copy" data-cmd="${esc(stage.command)}" title="Click to copy">${esc(stage.command)}</code> if you still need it.</p>`;
    } else if (stage.status === "running") {
        inner = `<p>Running now…</p>`;
    } else if (stage.status === "completed") {
        inner = `<p>Completed. Click to view <code>${esc(stage.file)}</code>.</p>`;
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
    // The current (non-completed) stage contributes half a step whether it is
    // running, waiting, or stopped/idle — so the bar never shrinks when a stage
    // flips from running to stopped. Skipped stages count as fully passed.
    const active = loop.stages.some((x) =>
        x.status === "running" || x.status === "waiting" || x.status === "stopped",
    );
    const skipped = loop.stages.filter((x) => x.status === "skipped").length;
    const pct =
        ((loop.completed + skipped + (active ? 0.5 : 0)) / loop.total) * 100;
    $("#progress-fill").style.width = `${Math.min(100, pct)}%`;

    const pipe = $("#pipeline");
    pipe.innerHTML = "";
    for (const stage of loop.stages) {
        const node = el("div", `stage ${stage.status}`);
        node.dataset.stage = stage.id;
        node.innerHTML =
            `<div class="connector"></div>` +
            `<div class="stage-node">${STAGE_ICONS[stage.status] || "•"}</div>` +
            `<div class="stage-label">${esc(stage.label)}</div>` +
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
            openAppBrowser(b.dataset.uri, b);
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
    autoOpenOnStageCompletion(s);
    refreshActiveDetail();
    $("#gen-time").textContent =
        "updated " + new Date(s.generatedAt).toLocaleTimeString();
}

// When a stage transitions from in-progress to completed, surface its doc
// automatically in the details panel. Only fires on an observed transition,
// never on the first render (so opening the cockpit doesn't pop a panel).
let prevStageStatus = null;
function autoOpenOnStageCompletion(s) {
    const stages = s.loop?.stages || [];
    const cur = {};
    for (const st of stages) cur[st.id] = st.status;
    if (prevStageStatus) {
        let justCompleted = null;
        for (const st of stages) {
            const before = prevStageStatus[st.id];
            if (
                st.status === "completed" &&
                before &&
                before !== "completed"
            ) {
                justCompleted = st; // last in pipeline order = most advanced
            }
        }
        if (justCompleted) showDoc(justCompleted.id);
    }
    prevStageStatus = cur;
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

// Server pushes state every 2s.

connect();
