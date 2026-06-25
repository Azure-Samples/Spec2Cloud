// Azure resource discovery for the spec2cloud canvas.
//
// Primary path: the @azure/arm-resources management SDK driven by
// AzureCliCredential (per the canvas spec). If those packages are not
// installed, fall back to the `az` CLI so the panel still works on machines
// that only have the Azure CLI.

import { execFile } from "node:child_process";

function azCli(args) {
    return new Promise((resolve, reject) => {
        execFile(
            "az",
            args,
            { maxBuffer: 1024 * 1024 * 16, timeout: 60_000 },
            (err, stdout, stderr) => {
                if (err) {
                    reject(new Error(stderr?.trim() || err.message));
                    return;
                }
                resolve(stdout);
            },
        );
    });
}

function normalize(r) {
    return {
        id: r.id ?? null,
        name: r.name ?? null,
        type: r.type ?? null,
        kind: r.kind ?? null,
        location: r.location ?? null,
        provisioningState:
            r.provisioningState ?? r.properties?.provisioningState ?? null,
        sku: r.sku?.name ?? r.sku ?? null,
        tags: r.tags ?? null,
    };
}

async function viaSdk(subscriptionId, resourceGroup) {
    const { ResourceManagementClient } = await import("@azure/arm-resources");
    const { AzureCliCredential } = await import("@azure/identity");
    const credential = new AzureCliCredential();
    const client = new ResourceManagementClient(credential, subscriptionId);
    const resources = [];
    const iter = client.resources.listByResourceGroup(resourceGroup, {
        expand: "provisioningState,createdTime,changedTime",
    });
    for await (const r of iter) {
        resources.push(normalize(r));
    }
    let group = null;
    try {
        group = await client.resourceGroups.get(resourceGroup);
    } catch {
        /* group metadata is best-effort */
    }
    return {
        source: "sdk",
        resourceGroup,
        subscriptionId,
        location: group?.location ?? null,
        resources,
    };
}

async function viaCli(subscriptionId, resourceGroup) {
    const args = [
        "resource",
        "list",
        "--resource-group",
        resourceGroup,
        "--output",
        "json",
    ];
    if (subscriptionId) args.push("--subscription", subscriptionId);
    const out = await azCli(args);
    const parsed = JSON.parse(out || "[]");
    return {
        source: "az-cli",
        resourceGroup,
        subscriptionId: subscriptionId ?? null,
        location: null,
        resources: parsed.map(normalize),
    };
}

/**
 * List the resources inside a resource group.
 * @param {{subscriptionId?: string, resourceGroup: string}} opts
 */
export async function listResources({ subscriptionId, resourceGroup }) {
    if (!resourceGroup) {
        return { error: "AZURE_RESOURCE_GROUP is not set in the environment .env." };
    }
    let sdkError = null;
    if (subscriptionId) {
        try {
            return await viaSdk(subscriptionId, resourceGroup);
        } catch (e) {
            sdkError = e?.message || String(e);
        }
    } else {
        sdkError = "AZURE_SUBSCRIPTION_ID is not set; skipping management SDK.";
    }
    try {
        const cli = await viaCli(subscriptionId, resourceGroup);
        cli.sdkError = sdkError;
        return cli;
    } catch (e) {
        return {
            error:
                "Could not list resources via the Azure management SDK or the az CLI.",
            sdkError,
            cliError: e?.message || String(e),
            resourceGroup,
        };
    }
}
