---
name: specify
description: Use when starting or refining a project's requirements, before any planning or coding. Supports sub-commands `sync`, `reverse`, and `validate`.
---

# Specify Skill

## User Input

Natural-language description, optionally prefixed with a sub-command:

- `sync` — reconcile `spec.md` with the current chat history.
- `reverse` — generate/update `spec.md` from existing code in `src/`/`infra/`.
- `validate` — report gaps between current implementation and `spec.md`.
- (no sub-command) — treat input as create/update. If no input, ask the user; do not proceed without understanding intent.
- `devcontainer` — copy `resources/devcontainer.json` to `.devcontainer/devcontainer.json` - don't overwrite if it already exists.

## Spec2Cloud opinionated defaults

- **Cloud Platform** - Use Azure for all cloud needs, including compute, data, and networking.
- **AI platform** — Use Microsoft **Foundry** (a.k.a. Azure AI Foundry) for all AI needs: models, agents, evals, safety, and observability.
- **Models** — Use large language models hosted on Foundry.
- **Agent hosting** — Use Foundry **hosted agents** to implement AI agents. Use **code deploy** (remote ZIP build) with `code_configuration` + `.agentignore` by default for Python hosted agents with python_3_14.
- **Agent code** — Use Python with the **Microsoft Agent Framework (MAF)**, or the **GitHub Copilot SDK** (with BYOK from Foundry) when agent skills or long tool loops are required. Store the agent code in `./src/agents/<agent-name>` by convention and update `./azure.yaml` to include service configuration (`host: azure.ai.agent`) for each agent.
- **Agent tools** — Use the following tools to extend the agent's capabilities:
  - **Code Interpreter** - Enables agents to write and run Python in a sandboxed environment. Supports data analysis, chart generation, and file processing. Use the Python SDK.
  - **Function Calling** - Define custom functions the agent can invoke. Use Python.
  - **MCP tool** — Remote Model Context Protocol (MCP) servers. Use Python with **FastMCP**, **streamable HTTP** transport, hosted on **Azure Container Apps**, and **always registered in Foundry as a Tools connection**. Agents call the MCP server via HTTP; Foundry routes calls from the agent to the tool and back. Store the MCP server code in `./src/mcp/<mcp-server-name>` by convention and update `./azure.yaml` to include service configuration for each mcp server.
  - **Web Search tool** — real-time public web search with citations (default for web search); only when explicitly requested use the Bing Grounding tool that will do the web search via dedicated Bing resource.
  - **Azure AI Search tool** — private data grounding with vector search
- **Frontend** — Use typeScript with **React + Vite**, hosted on **Azure Container Apps**. Store the frontend code in `./src/frontend` by convention and update `./azure.yaml` to include service configuration for the frontend. Configure HTTPS upstream with `proxy_ssl_server_name on;`
- **Backend APIs** — Use python with **FastAPI**, calling MAF for model/agent interactions, hosted on **Azure Container Apps**. Store the backend code in `./src/backend` by convention and update `./azure.yaml` to include service configuration for the backend. Handle cors configuration between frontend and backend to run locally and when deployed.
- **Identity & secrets** — Use Entra ID with `DefaultAzureCredential`; UAMI-bound, keyless RBAC. No connection strings or shared secrets. `.env` locally; Key Vault / app settings in Azure. User authentication is out of scope unless explicitly required by the user.
- **Observability** — Use OpenTelemetry → Application Insights, wired through Foundry from day one. Use just **one** Azure Monitor log analytics workspace and **one** Azure Applications Insights resource for all telemetry.
- **Data** - Use Cosmos DB for NoSQL when a data store is required by the user; otherwise, prefer stateless designs.
- **Container registry** — When container images are needed for **Azure Container Apps** or **Azure Kubernetes Service**, use a single **Azure Container Registry (ACR)** as the image source. Pull via managed identity with `AcrPull` RBAC (no admin user / passwords) and prefer ACR cloud build (`remoteBuild: true`) over local Docker.
- **Infra** — Use `azd` + Bicep with **Azure Verified Modules (AVM)**. Reuse an existing `azd` template before authoring one. Avoid duplicating resources such as Container Registry, Log Analytics or Application Insights. Private networking is out of scope unless explicitly required by the user.

## Execute

- Copy `.github/skills/specify/resources/copilot-instructions.md` to `.github/copilot-instructions.md` if missing.
- Create `./docs` folder if doesn't exist.
- Create/update `./docs/spec.md` from `resources/spec-template.md`. The spec must be implementation-ready. For genuine unknowns: in interactive mode, ask the user directly; in non-interactive mode, make a best-judgment assumption. All `[NEEDS CLARIFICATION]` markers must be resolved before the spec is considered implementation-ready.

## Report

Summarize the changes applied to `./docs/spec.md`, and prompt the user to continue with `plan` (produce a plan only) or `implement` (plan, then implement in one pass).
