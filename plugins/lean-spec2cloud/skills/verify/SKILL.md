---
name: verify
description: Use when implementation exists and needs to be exercised locally against provisioned Azure dependencies, before deploying.
---

# Verify Skill

Requires `spec.md`. If `spec.md` is missing, auto-run `specify` with the user's prompt, then auto-run `plan` and `implement`. If `plan.md` is missing, auto-run `plan` and `implement`. If `implementation.md` is missing, auto-run `implement` first. If `./src/` is missing, return to Implement. Load workspace context per `copilot-instructions.md`.

## Preflight

Run before provisioning; fail fast and report any miss.

- **Agent contract:** `agent.yaml` declares `template.kind: hosted` or `workflow`. For hosted agents, validate `code_configuration` (runtime, entry point, dependency resolution) and that `/liveness` and `/readiness` routes are defined.
- **Resource names:** validate against service-specific limits (e.g. Azure Container Apps app names ≤ 32 chars).
- **Tooling:** confirm `bicep --version` (standalone) or fall back to Azure CLI bundled Bicep (`az bicep version`).
- **Dependencies:** pin/validate Azure Monitor + OpenTelemetry package compatibility before local startup.
- **Best-practices MCP:** retry once on failure, then continue with documented fallback instead of blocking on timeout.

## Execute

- Provision Azure dependencies with `azd provision` and wait for completion:
  ```
  azd provision -e <AZD environment>
  ```
- Wire local config (`.env`, `local.settings.json`, `appsettings.Development.json`, …) using `azd env get-values -e <AZD environment>`. Show the user which keys are written (names only). Secrets must resolve via Key Vault references / managed identity — never as literals.
- Start local servers (frontends, backends, MCP servers, Foundry hosted agents) with hot reload and telemetry enabled, run automated tests, update `./docs/verify.md` with process, results, and manual test instructions. On resume, re-read `./docs/verify.md` and re-run only the checks not yet marked passed.
  - If Docker is running, ask the user whether to start the local servers in Docker containers; otherwise, start the processes locally. When containerized, verify backend and frontend images start cleanly to catch missing runtime dependencies before cloud deploy.
  - If Aspire is requested by the user, ensure the Aspire AppHost orchestrating agent is created, the Aspire run profiles are configured, and the AppHost is running (`dotnet run apphost.cs`).
  - If the feature uses Foundry hosted agents, verify their functionality by running `azd ai agent show <agent-name>` retrieve the agent endpoint, then `azd ai agent invoke --agent-endpoint <agent-endpoint> {"input": "<message>"}` to confirm the agent responds as expected, and check the logs by running `azd ai agent monitor <agent-name>`. Use `azd ai agent doctor` to diagnose any issues.
- Run HTTP-based E2E validation and report pass/fail.
- Report to the user the local URL's so that he can verify the end-to-end functionality.

**Pause if:** provisioning fails, a local component fails to start, or a test fails — report and wait, do not retry blindly.

## Report

Do not claim verification passed without ensuring that the local servers started successfully in this turn and reporting exit code + key output. Summarize the updated `./docs/verify.md`, and prompt the user to continue with `deploy`.

