---
name: spec2cloud
description: Use when the user wants to run the full Specify → Plan → Implement → Deploy loop end-to-end in one shot. Accepts a free-form prompt that is passed to specify.
---

# Spec2Cloud Skill

Run the four stages in order using the user's prompt as the spec input. Optimize for autonomy: make the most reasonable choice instead of asking, and record every assumption.

## User Input

The user's prompt is the spec brief. If empty, ask once for it; otherwise do not ask further clarifying questions.

## Execute

1. Invoke `specify` with the user's prompt. Resolve unknowns by best judgment and mark each as `[NEEDS CLARIFICATION: <question> — assumed: <value>]` in `./docs/spec.md`.
2. Invoke `plan`. For each AZD-template choice and Azure region/SKU, pick the minimal viable option and record the assumption in `./docs/plan.md` and `.azure/deployment-plan.md`.
3. Invoke `implement`. On scaffold conflicts, prefer merge over overwrite without asking.
4. Invoke `deploy` and run `azd up`.
5. Analyze your copilot conversation history and report issues and blockers encontered in each stage and save them in `./docs/spec2cloud-issues.md`, to drive future improvements to the plugin and related skills.

## Pause if

- The user's prompt is missing or non-actionable.
- A stage exits non-zero or a verification gate fails.
- A `[NEEDS CLARIFICATION]` blocks correctness (e.g., compliance, data residency, cost ceiling) and no safe default exists.

## Report

Summarize each stage's output doc, list every assumption made, and hand back the deployed Azure frontend endpoint.
