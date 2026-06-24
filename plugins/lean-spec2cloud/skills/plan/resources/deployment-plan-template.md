# Azure Deployment Plan

This file serves as the source of truth for Azure deployment configuration. It should not be committed to version control because it may contain sensitive information. Confirm all values with the user **in one round** before proceeding. `plan` must resolve every value here — no `[NEEDS CLARIFICATION: …]` markers may remain when handing off to `implement`.

## Project

| Field | Value |
|---|---|
| Project name | `<project-name>` - the current workspace name |
| AZD template | `<repo>` (e.g. `Azure-Samples/azd-ai-starter-basic`), `minimal`, or `none` (opt out of `azd init`) |
| AZD environment name | `dev` (default), `test`, `prod` |
| Azure Subscription Id | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` (from `az account show`) |
| Azure Subscription Name | from `az account show` |

## Environment variables

`implement` persists these via `azd env set` after `AZURE_RESOURCE_GROUP`. Add rows only when the feature needs them.

| Variable | Value | Source / When |
|---|---|---|
| `AZURE_TENANT_ID` | set with `az account show --query tenantId --output tsv` | constant |
| `AZURE_LOCATION` | `eastus` \| `westeurope` \| `uksouth` \| … | constant |
| `AZURE_RESOURCE_GROUP` | `rg-<project-name>` | constant |
| `ENABLE_CAPABILITY_HOST` | `false` | constant (when feature uses Foundry hosted agents) |
| `ENABLE_MONITORING` | `true` | constant (true by default) |
| `ENABLE_HOSTED_AGENTS` | `true` | constant (when feature uses Foundry hosted agents or needs Azure Container Registry to build container images) |
| `ENABLE_CAPABILITY_HOST` | `false` | constant (when feature uses Foundry hosted agents) |
| `AZD_AGENT_SKIP_ACR` | `false` | constant (when feature needs to build a container image for Azure Container Apps or Azure Kubernetes Service) |

