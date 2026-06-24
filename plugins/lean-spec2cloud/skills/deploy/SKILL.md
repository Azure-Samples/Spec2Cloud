---
name: deploy
description: Use when local verification passed and the feature is ready to ship to Azure.
---

# Deploy Skill

Requires `spec.md`, `plan.md`, `.azure/deployment-plan.md`, `verify.md`. If `spec.md` is missing, auto-run `specify` with the user's prompt, then auto-run `plan` and `implement`. If `plan.md` is missing, auto-run `plan` and `implement`. If `implementation.md` is missing, auto-run `implement` first. Load workspace context per `copilot-instructions.md`.

## Execute

**Preflight:** `az --version`, `azd version`, and `bicep --version` all succeed; `azd` and the `microsoft.foundry` extension is installed (install with `azd ext install microsoft.foundry`) and up to date (check with `azd ext list`); `azd auth login --check-status` succeeds; `azd env list` shows the target env; `azure.yaml` exists and `infra/main.bicep` is present (skip if AZD template = `none`). If `az` is logged in but `azd` is not, run `azd config set auth.useAzCliAuth true` instead of the interactive `azd auth login`.

**Packaging:** validate before deploy:
- Hosted-agent deps: ship `uv.lock` when the project is uv-managed; otherwise a focused `requirements.txt` (runtime deps only). Do **not** ship the `agent-framework` meta-package — it pulls broken extras; pin the specific sub-packages you import (e.g. `agent-framework-core`, `agent-framework-foundry`, `agent-framework-foundry-hosting`) plus undeclared transitive imports (e.g. `mcp`). Validate with a clean install before deploy.
- Hosted-agent code deploy: generate/validate `.agentignore` to scope the remote payload.
- When `remoteBuild: true`, generate/validate service-specific `.dockerignore` to keep build contexts clean.
- Normalize Linux entrypoint line endings (LF) via `.gitattributes` or `dos2unix`/`sed` in the Dockerfile to avoid CRLF runtime failures.

- Confirm AZD environment, subscription, resource group, and region from `.azure/deployment-plan.md` before any state-changing command. Stop if the deployment plan records `none` for the AZD template (no `azure.yaml` to deploy).
- Make sure that instrumentation is enabled, so that telemetry is available immediately after deployment.
- For IaC changes, dry-run with `azd provision --preview` before `azd deploy`.
- Never print or commit secrets; values must resolve via Key Vault / managed identity.
- Stop local servers before deploying to avoid file locks.
- Deploy:
  - If `azd provision` was succeeded, now perform the `azd deploy` and wait for completion:
    ```
    azd deploy -e <AZD environment>
    ```
  - If `azd provision` was not previously run, run `azd up` instead to provision and deploy in one step:
    ```
    azd up -e <AZD environment>
    ```
- After deployment succeeds, gather the deployed endpoint URLs from `azd show -e <AZD environment> -o json`.
- Post-deploy health: confirm ACA revision is active and provisioned (`az containerapp revision list`), hosted-agents sessions respond with the command `azd ai agent show <agent-name>` to retrieve the agent endpoint and playground URL, then `azd ai agent invoke --agent-endpoint <agent-endpoint> {"input": "<message>"}` to confirm the agent responds as expected, and check the logs by running `azd ai agent monitor <agent-name>`. Report the playground URL for each agent to the user.
- Repeat the HTTP-based E2E validation with the deployed endpoints and report pass/fail.

### Common failures

| Symptom | Fix |
|---|---|
| `QuotaExceeded` | Change region or request quota increase |
| `ConflictError` (name taken) | Change `environmentName` or RG suffix |
| `ImagePullBackOff` | Verify ACR push + AcrPull RBAC |
| `InvalidTemplate` | Validate `infra/main.bicep` |
| `AuthorizationFailed` | Verify subscription + RBAC roles |
| `Hosted agents can only be called through the agent endpoint` | Call the agent's dedicated endpoint (`{project}/agents/{agent}/endpoint/protocols/openai`), not the project endpoint or `agent_reference` |
| Hosted-agent deploy fails on dependency resolution | Replace the `agent-framework` meta-package with pinned sub-packages + transitive imports (see Packaging) |
| `424 session_not_ready` / transient `502` | Cold start / revision rollover — warm-up retries |

## Report

Do not claim deployment succeeded without `azd deploy` exit 0 AND the local E2E suite re-run against the deployed URL. Hand back the deployed Azure endpoint and summarize the updated `./docs/deploy.md`. Generate or refresh root `README.md` linking to `./docs/spec.md`, `./docs/plan.md`, `./docs/implementation.md`, `./docs/verify.md`, and `./docs/deploy.md`.
