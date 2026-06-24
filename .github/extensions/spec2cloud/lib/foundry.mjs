// Microsoft Foundry project inventory for the spec2cloud canvas.
//
// Uses the @azure/ai-projects data-plane SDK driven by AzureCliCredential to
// enumerate the agents, model deployments, toolboxes, tools, skills and
// knowledge (search indexes) inside a Foundry project. Every section is
// best-effort: a failure in one section never blocks the others.

const ENDPOINT_VARS = [
    "AZURE_AI_FOUNDRY_PROJECT_ENDPOINT",
    "AZURE_AI_PROJECT_ENDPOINT",
    "AZURE_EXISTING_AIPROJECT_ENDPOINT",
    "FOUNDRY_PROJECT_ENDPOINT",
];

/** Resolve the Foundry project data-plane endpoint URL from .env vars. */
export function resolveEndpoint(vars = {}) {
    for (const k of ENDPOINT_VARS) {
        if (vars[k]) return vars[k].trim();
    }
    const id = (vars.AZURE_AI_FOUNDRY_PROJECT_ID || "").trim();
    if (/^https?:\/\//i.test(id)) return id;
    // ARM resource id → derive the standard services.ai.azure.com endpoint.
    const m = id.match(/accounts\/([^/]+)\/projects\/([^/]+)/i);
    if (m) return `https://${m[1]}.services.ai.azure.com/api/projects/${m[2]}`;
    return null;
}

/** The ARM resource id of the project, used as the portal `wsid`, when known. */
function projectArmId(vars = {}) {
    const id = (vars.AZURE_AI_FOUNDRY_PROJECT_ID || "").trim();
    if (/^\/subscriptions\//i.test(id)) return id;
    return null;
}

const PORTAL_SECTION = {
    agents: "agents",
    deployments: "models",
    toolboxes: "tools",
    tools: "tools",
    skills: "skills",
    knowledge: "indexes",
};

/** Best-effort deep link into the new Microsoft Foundry portal. */
export function foundryPortalUrl(wsid, category) {
    const base = "https://ai.azure.com";
    const section = PORTAL_SECTION[category] || "overview";
    if (!wsid) return `${base}/`;
    return `${base}/foundryProject/${section}?wsid=${encodeURIComponent(wsid)}`;
}

async function collect(iter, max = 200) {
    const out = [];
    for await (const x of iter) {
        out.push(x);
        if (out.length >= max) break;
    }
    return out;
}

async function safe(fn) {
    try {
        return { items: await fn() };
    } catch (e) {
        return { error: e?.message || String(e) };
    }
}

function toolLabel(tool) {
    return (
        tool?.server_label ||
        tool?.function?.name ||
        tool?.name ||
        tool?.type ||
        "tool"
    );
}

/**
 * Enumerate the contents of a Foundry project.
 * @param {Record<string,string>} vars - the environment .env variables.
 */
export async function listFoundry(vars = {}) {
    const endpoint = resolveEndpoint(vars);
    if (!endpoint) {
        return {
            error:
                "Could not resolve the Foundry project endpoint. Set AZURE_AI_FOUNDRY_PROJECT_ENDPOINT or a full project endpoint/ARM id in the .env.",
        };
    }

    let AIProjectClient;
    try {
        ({ AIProjectClient } = await import("@azure/ai-projects"));
    } catch {
        return {
            error:
                "@azure/ai-projects is not installed in the extension. Run `npm install @azure/ai-projects` in the extension folder.",
        };
    }
    let AzureCliCredential;
    try {
        ({ AzureCliCredential } = await import("@azure/identity"));
    } catch {
        return { error: "@azure/identity is not installed in the extension." };
    }

    let project;
    try {
        project = new AIProjectClient(endpoint, new AzureCliCredential());
    } catch (e) {
        return { error: e?.message || String(e), endpoint };
    }

    const wsid = projectArmId(vars);
    const link = (category) => foundryPortalUrl(wsid, category);

    const sections = {};

    sections.agents = await safe(async () =>
        (await collect(project.agents.list())).map((a) => ({
            name: a.name,
            sub: a.versions?.latest?.kind || a.versions?.latest?.model || "",
            portal: link("agents"),
        })),
    );

    sections.deployments = await safe(async () =>
        (await collect(project.deployments.list())).map((d) => ({
            name: d.name,
            sub: d.modelName
                ? `${d.modelPublisher ? d.modelPublisher + " · " : ""}${d.modelName}`
                : d.type || "",
            portal: link("deployments"),
        })),
    );

    let toolboxes = [];
    sections.toolboxes = await safe(async () => {
        toolboxes = await collect(project.beta.toolboxes.list());
        return toolboxes.map((t) => ({
            name: t.name,
            sub: t.default_version ? `v${t.default_version}` : "",
            portal: link("toolboxes"),
        }));
    });

    sections.tools = await safe(async () => {
        if (!toolboxes.length) {
            toolboxes = await collect(project.beta.toolboxes.list());
        }
        const tools = [];
        for (const tb of toolboxes) {
            try {
                const v = await project.beta.toolboxes.getVersion(
                    tb.name,
                    tb.default_version,
                );
                for (const tool of v.tools || []) {
                    tools.push({
                        name: toolLabel(tool),
                        sub: `${tool.type || ""}${tool.type ? " · " : ""}${tb.name}`,
                        portal: link("tools"),
                    });
                }
            } catch {
                /* skip toolbox versions we cannot read */
            }
        }
        return tools;
    });

    sections.skills = await safe(async () =>
        (await collect(project.beta.skills.list())).map((s) => ({
            name: s.name,
            sub: s.description || "",
            portal: link("skills"),
        })),
    );

    sections.knowledge = await safe(async () =>
        (await collect(project.indexes.list())).map((i) => ({
            name: i.name,
            sub: `${i.type || "index"}${i.version ? " · v" + i.version : ""}`,
            portal: link("knowledge"),
        })),
    );

    return { endpoint, wsid, sections };
}
