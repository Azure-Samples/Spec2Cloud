---
name: plan
description: Use when a spec exists and an implementation or Azure deployment plan is needed, before writing code.
---

# Plan Skill

Requires `spec.md`. Load workspace context per `copilot-instructions.md`.

## Execute

Cycle these phases as needed (iterative, not linear). For highly ambiguous tasks, do only Discovery, then Alignment, before Design.

1. **Discovery (read-only).** Use sub-agents to gather context, analogous features, and blockers. Do not modify `./src/` or `./infra/` in this phase.
2. **Alignment.** Ask clarifying questions; surface constraints and alternatives. If scope shifts significantly, loop back to Discovery.
3. **Design.** Draft `./docs/plan.md` from `resources/plan-template.md` and `./.azure/deployment-plan.md` from `resources/deployment-plan-template.md`. For the AZD template, present 4 options: **accept** the suggestion from `resources/azd-templates.md`, **pick a different** template from the catalog, **minimal** (`azd init --minimal`), or **none** (opt out of `azd init`). Verify the proposed resource group does not exist (`az group exists --name <name>`) and suggest a suffix on collision. Mark genuine unknowns as `[NEEDS CLARIFICATION: <question>]` rather than guessing. Show a summary to the user.
4. **Protect.** Add `.gitignore` entries for the `./.azure/` folder and any other generated files that should not be checked in.
5. **Refinement.** On feedback: revise, clarify, or loop back to Discovery. Suggest to use `rubber-duck` as a tool for self-review. On approval, hand off to Implement.

## Report

Summarize `./docs/plan.md` and `./.azure/deployment-plan.md`, and prompt the user to continue with `implement`.

