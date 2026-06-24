// State computation for the spec2cloud canvas: workspace metadata, Azure
// environments, session statistics (parsed from events.jsonl) and the
// spec2cloud delivery loop. Everything here reads from disk so the canvas
// survives extension reloads with no in-memory dependency.

import { promises as fs } from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Tiny YAML reader (only what workspace.yaml needs: scalars + `|-` blocks).
// ---------------------------------------------------------------------------
export function parseWorkspaceYaml(text) {
    const out = {};
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const m = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
        if (!m) continue;
        const key = m[1];
        let value = m[2];
        if (value === "|-" || value === "|" || value === ">" || value === ">-") {
            const block = [];
            while (i + 1 < lines.length && /^\s+/.test(lines[i + 1])) {
                block.push(lines[++i].replace(/^\s\s/, ""));
            }
            out[key] = block.join("\n").trim();
        } else {
            value = value.replace(/^["']|["']$/g, "");
            out[key] = value;
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
// .env parsing (azd style KEY="value").
// ---------------------------------------------------------------------------
export function parseDotEnv(text) {
    const out = {};
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        let value = line.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        out[key] = value;
    }
    return out;
}

async function exists(p) {
    try {
        await fs.access(p);
        return true;
    } catch {
        return false;
    }
}

// ---------------------------------------------------------------------------
// Azure environments under .azure/<env>/.env
// ---------------------------------------------------------------------------
export async function readEnvironments(repoRoot) {
    const azureDir = path.join(repoRoot, ".azure");
    if (!(await exists(azureDir))) {
        return { available: false, list: [], defaultEnv: null };
    }
    let entries = [];
    try {
        entries = await fs.readdir(azureDir, { withFileTypes: true });
    } catch {
        return { available: false, list: [], defaultEnv: null };
    }
    const list = entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .filter((n) => !n.startsWith("."))
        .sort();
    let defaultEnv = null;
    try {
        const cfg = await fs.readFile(path.join(azureDir, "config.json"), "utf8");
        defaultEnv = JSON.parse(cfg)?.defaultEnvironment ?? null;
    } catch {
        /* optional */
    }
    return { available: list.length > 0, list, defaultEnv };
}

export async function readEnvFile(repoRoot, env) {
    const file = path.join(repoRoot, ".azure", env, ".env");
    if (!(await exists(file))) return { env, exists: false, vars: {}, raw: "" };
    const raw = await fs.readFile(file, "utf8");
    return { env, exists: true, vars: parseDotEnv(raw), raw, path: file };
}

// ---------------------------------------------------------------------------
// Session statistics from events.jsonl (incremental, reload-safe).
// ---------------------------------------------------------------------------
const BUILTIN_TOOLS = new Set([
    "view", "edit", "create", "bash", "read_bash", "stop_bash", "list_bash",
    "grep", "glob", "sql", "web_fetch", "web_search", "task", "ask_user",
    "skill", "render_widget", "discover_widgets", "clear_widget",
]);

const statsCache = new Map(); // path -> accumulator

function freshAcc() {
    return {
        offset: 0,
        carry: "",
        startTime: null,
        lastEventTime: null,
        lastTurnStart: 0,
        lastTurnEnd: 0,
        lastIdle: 0,
        pendingPermissions: new Set(),
        pendingInput: false,
        outputTokens: 0,
        assistantMessages: 0,
        turns: 0,
        contextLimit: 0,
        model: null,
        skills: {},
        mcpTools: {},
    };
}

function ingest(acc, e) {
    const t = e.type;
    const ts = e.timestamp ? Date.parse(e.timestamp) : null;
    if (ts) acc.lastEventTime = ts;
    const d = e.data || {};
    switch (t) {
        case "session.start":
            acc.startTime = ts ?? acc.startTime;
            acc.model = d.selectedModel ?? acc.model;
            break;
        case "assistant.turn_start":
            acc.turns++;
            if (ts) acc.lastTurnStart = ts;
            break;
        case "assistant.turn_end":
            if (ts) acc.lastTurnEnd = ts;
            break;
        case "session.idle":
            if (ts) acc.lastIdle = ts;
            break;
        case "assistant.message":
            acc.assistantMessages++;
            if (typeof d.outputTokens === "number") acc.outputTokens += d.outputTokens;
            if (typeof d.responseTokenLimit === "number")
                acc.contextLimit = Math.max(acc.contextLimit, d.responseTokenLimit);
            if (d.model) acc.model = d.model;
            break;
        case "skill.invoked": {
            const name = d.name || "unknown";
            acc.skills[name] = (acc.skills[name] || 0) + 1;
            break;
        }
        case "tool.execution_start": {
            const name = d.toolName || "unknown";
            if (!BUILTIN_TOOLS.has(name)) {
                acc.mcpTools[name] = (acc.mcpTools[name] || 0) + 1;
            }
            break;
        }
        case "external_tool.requested": {
            const name = d.toolName || "unknown";
            // External/MCP tools routed outside the core agent.
            acc.mcpTools[name] = (acc.mcpTools[name] || 0) + 1;
            break;
        }
        case "permission.requested":
            if (d.requestId) acc.pendingPermissions.add(d.requestId);
            break;
        case "permission.completed":
            if (d.requestId) acc.pendingPermissions.delete(d.requestId);
            break;
        case "user.input.requested":
        case "elicitation.requested":
            acc.pendingInput = true;
            break;
        case "user.input.completed":
        case "elicitation.completed":
        case "user.message":
            acc.pendingInput = false;
            break;
        default:
            break;
    }
}

export async function readStats(eventsPath) {
    let acc = statsCache.get(eventsPath);
    let stat;
    try {
        stat = await fs.stat(eventsPath);
    } catch {
        return null;
    }
    if (!acc || stat.size < acc.offset) {
        acc = freshAcc();
        statsCache.set(eventsPath, acc);
    }
    if (stat.size > acc.offset) {
        const fh = await fs.open(eventsPath, "r");
        try {
            const len = stat.size - acc.offset;
            const buf = Buffer.alloc(len);
            await fh.read(buf, 0, len, acc.offset);
            acc.offset = stat.size;
            const chunk = acc.carry + buf.toString("utf8");
            const lines = chunk.split("\n");
            acc.carry = lines.pop() ?? "";
            for (const line of lines) {
                const s = line.trim();
                if (!s) continue;
                try {
                    ingest(acc, JSON.parse(s));
                } catch {
                    /* skip malformed line */
                }
            }
        } finally {
            await fh.close();
        }
    }

    const now = Date.now();
    let status = "idle";
    if (acc.pendingPermissions.size > 0 || acc.pendingInput) status = "waiting";
    else if (acc.lastTurnStart > acc.lastTurnEnd && acc.lastTurnStart > acc.lastIdle)
        status = "active";

    return {
        status,
        startTime: acc.startTime,
        elapsedMs: acc.startTime ? now - acc.startTime : 0,
        model: acc.model,
        tokens: {
            output: acc.outputTokens,
            assistantMessages: acc.assistantMessages,
            turns: acc.turns,
            contextLimit: acc.contextLimit,
        },
        skills: {
            count: Object.values(acc.skills).reduce((a, b) => a + b, 0),
            breakdown: acc.skills,
        },
        mcpTools: {
            count: Object.values(acc.mcpTools).reduce((a, b) => a + b, 0),
            breakdown: acc.mcpTools,
        },
    };
}

// ---------------------------------------------------------------------------
// spec2cloud delivery loop.
// ---------------------------------------------------------------------------
export const STAGES = [
    { id: "specify", label: "Specify", file: "docs/spec.md", command: "/specify" },
    { id: "plan", label: "Plan", file: "docs/plan.md", command: "/plan" },
    { id: "implement", label: "Implement", file: "docs/implementation.md", command: "/implement" },
    { id: "verify", label: "Verify", file: "docs/verify.md", command: "/verify" },
    { id: "deploy", label: "Deploy", file: "docs/deploy.md", command: "/deploy" },
];

export async function readLoop(repoRoot, sessionStatus, startTime) {
    const now = Date.now();
    const stageInfo = [];
    for (const s of STAGES) {
        const abs = path.join(repoRoot, s.file);
        let mtime = null;
        let present = false;
        try {
            const st = await fs.stat(abs);
            present = true;
            mtime = st.mtimeMs;
        } catch {
            present = false;
        }
        stageInfo.push({ ...s, exists: present, mtime });
    }

    let cursor = startTime || now;
    let currentAssigned = false;
    const stages = stageInfo.map((s, i) => {
        const prevDone = i === 0 || stageInfo[i - 1].exists;
        let status;
        let elapsedMs = null;
        if (s.exists) {
            status = "completed";
            const end = s.mtime ?? cursor;
            elapsedMs = Math.max(0, end - cursor);
            cursor = end;
        } else if (prevDone && !currentAssigned) {
            currentAssigned = true;
            if (sessionStatus === "waiting") status = "waiting";
            else if (sessionStatus === "active") status = "running";
            else status = "stopped";
            elapsedMs = Math.max(0, now - cursor);
        } else {
            status = "pending";
        }
        return {
            id: s.id,
            label: s.label,
            command: s.command,
            file: s.file,
            exists: s.exists,
            status,
            elapsedMs,
        };
    });

    const completed = stages.filter((s) => s.status === "completed").length;
    return { stages, completed, total: stages.length };
}

// ---------------------------------------------------------------------------
// Session details — todos live in the per-session SQLite db (session.db).
// ---------------------------------------------------------------------------
export async function readSessionTodos(workspaceDir) {
    if (!workspaceDir) return { available: false, todos: [], counts: {} };
    const dbPath = path.join(workspaceDir, "session.db");
    if (!(await exists(dbPath))) return { available: false, todos: [], counts: {} };
    let DatabaseSync;
    try {
        ({ DatabaseSync } = await import("node:sqlite"));
    } catch {
        return { available: false, todos: [], counts: {}, error: "node:sqlite unavailable" };
    }
    let db;
    try {
        db = new DatabaseSync(dbPath, { readOnly: true });
        const rows = db
            .prepare(
                "SELECT id, title, description, status, updated_at FROM todos ORDER BY rowid",
            )
            .all();
        const counts = { pending: 0, in_progress: 0, done: 0, blocked: 0 };
        for (const r of rows) if (r.status in counts) counts[r.status]++;
        return { available: true, todos: rows, counts, total: rows.length };
    } catch (e) {
        return { available: false, todos: [], counts: {}, error: e?.message || String(e) };
    } finally {
        try {
            db?.close();
        } catch {
            /* ignore */
        }
    }
}

export async function readDoc(repoRoot, relFile) {
    const abs = path.join(repoRoot, relFile);
    if (!(await exists(abs))) return { exists: false, content: "", path: relFile };
    const content = await fs.readFile(abs, "utf8");
    return { exists: true, content, path: relFile };
}
