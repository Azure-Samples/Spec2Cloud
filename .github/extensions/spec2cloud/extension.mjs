// spec2cloud canvas — a live cockpit for spec-driven delivery to Azure.
//
// Architecture: each open canvas instance gets a loopback HTTP server that
// serves the static UI (ui.html/ui.css/ui.js) and a small JSON/SSE API. All
// state is derived from disk (workspace.yaml, .azure/*, docs/*, events.jsonl)
// so the panel is fully reload-safe. The "proceed" gesture routes back through
// the live Copilot session via session.send().

import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { joinSession, createCanvas, CanvasError } from "@github/copilot-sdk/extension";
import {
    parseWorkspaceYaml,
    readEnvironments,
    readEnvFile,
    readStats,
    readLoop,
    readDoc,
    readSessionTodos,
    STAGES,
} from "./lib/state.mjs";
import { listResources } from "./lib/azure.mjs";
import { listFoundry } from "./lib/foundry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const servers = new Map(); // instanceId -> { server, url, clients:Set }

let SESSION = null; // CopilotSession, set after joinSession

// ---------------------------------------------------------------------------
// Resolve the session workspace + repo root.
// ---------------------------------------------------------------------------
function workspaceDir() {
    return SESSION?.workspacePath || process.env.COPILOT_SESSION_WORKSPACE || null;
}

async function readWorkspace() {
    const dir = workspaceDir();
    const result = {
        sessionId: SESSION?.sessionId ?? null,
        workspacePath: dir,
        name: null,
        repository: null,
        branch: null,
        cwd: null,
        gitRoot: null,
        createdAt: null,
    };
    if (dir) {
        try {
            const text = await fs.readFile(path.join(dir, "workspace.yaml"), "utf8");
            const y = parseWorkspaceYaml(text);
            result.name = y.name ?? null;
            result.repository = y.repository ?? null;
            result.branch = y.branch ?? null;
            result.cwd = y.cwd ?? null;
            result.gitRoot = y.git_root ?? null;
            result.createdAt = y.created_at ?? null;
        } catch {
            /* fall back to process cwd below */
        }
    }
    result.repoRoot = result.gitRoot || result.cwd || process.cwd();
    return result;
}

// ---------------------------------------------------------------------------
// Build the full state snapshot consumed by the UI.
// ---------------------------------------------------------------------------
async function buildState() {
    const ws = await readWorkspace();
    const repoRoot = ws.repoRoot;
    const dir = workspaceDir();

    const [environments, statsRaw] = await Promise.all([
        readEnvironments(repoRoot),
        dir ? readStats(path.join(dir, "events.jsonl")) : Promise.resolve(null),
    ]);

    const todos = await readSessionTodos(dir);

    // Resolve per-environment .env contents so the client can switch instantly.
    const envs = {};
    for (const name of environments.list) {
        try {
            const ef = await readEnvFile(repoRoot, name);
            envs[name] = { vars: ef.vars, exists: ef.exists };
        } catch {
            envs[name] = { vars: {}, exists: false };
        }
    }

    const stats = statsRaw || {
        status: "idle",
        startTime: null,
        elapsedMs: 0,
        model: null,
        tokens: { output: 0, assistantMessages: 0, turns: 0, contextLimit: 0 },
        skills: { count: 0, breakdown: {} },
        mcpTools: { count: 0, breakdown: {} },
    };

    const loop = await readLoop(repoRoot, stats.status, stats.startTime);

    return {
        generatedAt: Date.now(),
        workspace: ws,
        session: {
            status: stats.status,
            startTime: stats.startTime,
            elapsedMs: stats.elapsedMs,
            model: stats.model,
            todos: {
                available: todos.available,
                total: todos.total ?? 0,
                counts: todos.counts ?? {},
            },
        },
        stats: {
            tokens: stats.tokens,
            skills: stats.skills,
            mcpTools: stats.mcpTools,
        },
        environments: { ...environments, envs },
        loop,
    };
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
function sendJson(res, body, code = 200) {
    const payload = JSON.stringify(body);
    res.writeHead(code, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
    });
    res.end(payload);
}

async function serveStatic(res, file, type) {
    try {
        const data = await fs.readFile(path.join(__dirname, file));
        res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
        res.end(data);
    } catch {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
    }
}

function readBody(req) {
    return new Promise((resolve) => {
        let data = "";
        req.on("data", (c) => (data += c));
        req.on("end", () => {
            try {
                resolve(data ? JSON.parse(data) : {});
            } catch {
                resolve({});
            }
        });
    });
}

async function handleRequest(req, res, entry) {
    const url = new URL(req.url, "http://127.0.0.1");
    const pathname = url.pathname;

    try {
        if (pathname === "/" || pathname === "/index.html") {
            return await serveStatic(res, "ui.html", "text/html; charset=utf-8");
        }
        if (pathname === "/ui.css") {
            return await serveStatic(res, "ui.css", "text/css; charset=utf-8");
        }
        if (pathname === "/ui.js") {
            return await serveStatic(res, "ui.js", "text/javascript; charset=utf-8");
        }
        if (pathname.startsWith("/icons/") && pathname.endsWith(".svg")) {
            const name = path.basename(pathname);
            return await serveStatic(res, path.join("icons", name), "image/svg+xml; charset=utf-8");
        }

        if (pathname === "/api/state") {
            return sendJson(res, await buildState());
        }

        if (pathname === "/api/envfile") {
            const ws = await readWorkspace();
            const env = url.searchParams.get("env");
            if (!env) return sendJson(res, { error: "missing env" }, 400);
            const ef = await readEnvFile(ws.repoRoot, env);
            return sendJson(res, ef);
        }

        if (pathname === "/api/doc") {
            const ws = await readWorkspace();
            const stageId = url.searchParams.get("stage");
            const stage = STAGES.find((s) => s.id === stageId);
            const file = stage ? stage.file : url.searchParams.get("file");
            if (!file) return sendJson(res, { error: "missing stage/file" }, 400);
            return sendJson(res, await readDoc(ws.repoRoot, file));
        }

        if (pathname === "/api/session") {
            const ws = await readWorkspace();
            const [todos, stats] = await Promise.all([
                readSessionTodos(ws.workspacePath),
                workspaceDir()
                    ? readStats(path.join(workspaceDir(), "events.jsonl"))
                    : Promise.resolve(null),
            ]);
            return sendJson(res, {
                sessionId: ws.sessionId,
                name: ws.name,
                workspacePath: ws.workspacePath,
                repository: ws.repository,
                branch: ws.branch,
                cwd: ws.cwd,
                createdAt: ws.createdAt,
                model: stats?.model ?? null,
                status: stats?.status ?? "idle",
                startTime: stats?.startTime ?? null,
                todos,
            });
        }

        if (pathname === "/api/resources") {
            const ws = await readWorkspace();
            const env = url.searchParams.get("env");
            if (!env) return sendJson(res, { error: "missing env" }, 400);
            const ef = await readEnvFile(ws.repoRoot, env);
            const result = await listResources({
                subscriptionId: ef.vars?.AZURE_SUBSCRIPTION_ID,
                resourceGroup: ef.vars?.AZURE_RESOURCE_GROUP,
            });
            return sendJson(res, { env, ...result });
        }

        if (pathname === "/api/foundry") {
            const ws = await readWorkspace();
            const env = url.searchParams.get("env");
            if (!env) return sendJson(res, { error: "missing env" }, 400);
            const ef = await readEnvFile(ws.repoRoot, env);
            const result = await listFoundry(ef.vars || {});
            return sendJson(res, { env, ...result });
        }

        if (pathname === "/api/run-command" && req.method === "POST") {
            const body = await readBody(req);
            const command = (body.command || "").trim();
            if (!command) return sendJson(res, { error: "missing command" }, 400);
            if (!SESSION) return sendJson(res, { error: "session unavailable" }, 503);
            try {
                await SESSION.send({ prompt: command });
                await SESSION.log(`spec2cloud: dispatched ${command}`, {
                    ephemeral: true,
                });
                return sendJson(res, { ok: true, command });
            } catch (e) {
                return sendJson(res, { error: e?.message || String(e) }, 500);
            }
        }

        if (pathname === "/api/open-browser" && req.method === "POST") {
            const body = await readBody(req);
            const target = (body.url || "").trim();
            if (!target) return sendJson(res, { error: "missing url" }, 400);
            if (!SESSION) return sendJson(res, { error: "session unavailable" }, 503);
            try {
                await SESSION.rpc.canvas.open({
                    canvasId: "browser",
                    instanceId: "spec2cloud-frontend",
                    input: {
                        url: target,
                        title: body.title || "Frontend",
                        placement: { focus: true },
                    },
                });
                return sendJson(res, { ok: true, url: target });
            } catch (e) {
                return sendJson(res, { error: e?.message || String(e) }, 500);
            }
        }

        if (pathname === "/events") {
            res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
            });
            res.write("retry: 2000\n\n");
            entry.clients.add(res);
            buildState()
                .then((s) => res.write(`data: ${JSON.stringify(s)}\n\n`))
                .catch(() => {});
            req.on("close", () => entry.clients.delete(res));
            return;
        }

        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
    } catch (e) {
        sendJson(res, { error: e?.message || String(e) }, 500);
    }
}

async function startServer(instanceId) {
    const entry = { clients: new Set() };
    const server = createServer((req, res) => handleRequest(req, res, entry));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    entry.server = server;
    entry.url = `http://127.0.0.1:${port}/`;

    // One broadcast loop per instance pushes fresh state to all SSE clients.
    entry.timer = setInterval(async () => {
        if (entry.clients.size === 0) return;
        try {
            const snapshot = JSON.stringify(await buildState());
            for (const res of entry.clients) {
                res.write(`data: ${snapshot}\n\n`);
            }
        } catch {
            /* ignore transient read errors */
        }
    }, 2000);

    return entry;
}

// ---------------------------------------------------------------------------
// Canvas declaration
// ---------------------------------------------------------------------------
SESSION = await joinSession({
    canvases: [
        createCanvas({
            id: "spec2cloud",
            displayName: "Spec2Cloud Cockpit",
            description:
                "Live cockpit tracking the spec→plan→implement→verify→deploy loop, Azure environments/resources, and agent session stats.",
            actions: [
                {
                    name: "refresh",
                    description:
                        "Force the cockpit to recompute and rebroadcast its state.",
                    handler: async (ctx) => {
                        const entry = servers.get(ctx.instanceId);
                        const snapshot = await buildState();
                        if (entry) {
                            const data = JSON.stringify(snapshot);
                            for (const res of entry.clients) res.write(`data: ${data}\n\n`);
                        }
                        return { ok: true, generatedAt: snapshot.generatedAt };
                    },
                },
                {
                    name: "get_state",
                    description: "Return the current cockpit state snapshot as JSON.",
                    handler: async () => buildState(),
                },
            ],
            open: async (ctx) => {
                let entry = servers.get(ctx.instanceId);
                if (!entry) {
                    entry = await startServer(ctx.instanceId);
                    servers.set(ctx.instanceId, entry);
                }
                return { title: "", url: entry.url };
            },
            onClose: async (ctx) => {
                const entry = servers.get(ctx.instanceId);
                if (entry) {
                    servers.delete(ctx.instanceId);
                    if (entry.timer) clearInterval(entry.timer);
                    for (const res of entry.clients) {
                        try {
                            res.end();
                        } catch {
                            /* ignore */
                        }
                    }
                    await new Promise((resolve) => entry.server.close(() => resolve()));
                }
            },
        }),
    ],
});

void CanvasError; // available for handlers that need to signal structured errors
