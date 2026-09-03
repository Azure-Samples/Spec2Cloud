# Spec2Cloud

**Ship Azure solutions faster with spec-driven toolkits**

![Spec2Cloud](docs/images/spec2cloud-banner.png)

Spec2Cloud is a collection of Azure-focused toolkits that help teams move from specification to production with fewer handoffs and less rework. Whether you want a fully orchestrated loop, GitHub Spec Kit components, or a lightweight Copilot plugin, Spec2Cloud gives you a practical path to consistent Azure delivery.

![Spec2Cloud](docs/images/spec2cloud.png)

## 🧰 Toolkit Options

Choose the toolkit that matches your workflow:

1. [Loop Toolkit](https://emeaappgbb.github.io/spec2cloud/) - a fully orchestrated workflow powered by the Ralph Loop, with deterministic progress, persisted state, human approval gates, and increment-based delivery from spec to Azure deployment.
2. [Spec Kit 🌱](./spec-kit/) - a GitHub Spec Kit integration for Azure that combines a preset (core command and template overrides), an extension (verify and deploy commands), and a workflow for a gated lifecycle from constitution through deployment.
3. [Lean Toolkit](./plugins/lean-spec2cloud/) - a lightweight, opinionated Copilot plugin that streamlines the core specify → plan → implement → verify → deploy loop for Azure, with focused skills and minimal context overhead to optimize token consumption.

---

## 🚀 Quick Start (Lean Toolkit)

Use the Lean Toolkit when you want a fast, low-overhead workflow in Copilot.

1. **Install the Spec2Cloud plugin through the marketplace:**

   ```bash
   # Add the marketplace
   copilot plugin marketplace add Azure-Samples/Spec2Cloud
   ```

   ```bash
   # Install the plugin from the markeplace
   copilot plugin install lean@Spec2Cloud
   ```

   Prefer a pinned, reproducible setup? You can also install the Lean Toolkit through [APM (Agent Package Manager)](https://microsoft.github.io/apm/) by declaring it as a dependency in your project's `apm.yml`. See the [Alternative: Use with APM](./plugins/lean-spec2cloud/README.md#alternative-use-with-apm) section in the Lean plugin README for the full manifest example and commands.

2. **Install prerequisites for verify and deploy:**
   - Azure CLI (`az`)
   - Azure Developer CLI (`azd`)
   - Bicep CLI (`bicep`)

   **Authenticate with Azure:**

   ```bash
   azd auth login
   ```

3. **Run the full loop in one prompt:**

   ```bash
   copilot -p "/fleet lean:spec2cloud Build a todo web app with a C# backend deployed on App Service, using Cosmos DB for NoSQL as the data persistence layer." --no-ask-user --yolo
   ```

5. **Or run each stage step by step:**

   Run the stages in order. Each command accepts optional extra context after the slash command, and skills auto-chain — for example, running `/lean:implement` without a plan will trigger `/lean:plan` first.

   Capture or refine the requirements:

   ```text
   /lean:specify Build a todo web app with a C# backend deployed on App Service, using Cosmos DB for NoSQL as the data persistence layer.
   ```

   Produce the design and Azure deployment plan (optional — auto-runs if missing):

   ```text
   /lean:plan
   ```

   Generate the application code and IaC (optional extra guidance can steer implementation choices):

   ```text
   /lean:implement
   ```

   Exercise the implementation locally against provisioned Azure dependencies (optional extra instructions can specify a testing approach):

   ```text
   /lean:verify
   ```

   Deploy to Azure (optional extra instructions can include post-deployment actions):

   ```text
   /lean:deploy
   ```


---

### 🤖 Use with Claude Code

The `lean` and `speckit` plugins also install in [Claude Code](https://claude.com/claude-code). The skills are the same source as the Copilot plugins — only the manifests differ — so the workflow is identical.

1. **Add the marketplace and install a plugin:**

   ```text
   /plugin marketplace add Azure-Samples/Spec2Cloud
   /plugin install lean@Spec2Cloud
   ```

   Swap `lean` for `speckit` to install the fuller Spec Kit workflow instead.

2. **Run the stages** (same prerequisites as the Lean Toolkit above — `az`, `azd`, `bicep`, and `azd auth login`):

   ```text
   /lean:specify Build a todo web app with a C# backend deployed on App Service, using Cosmos DB for NoSQL as the data persistence layer.
   /lean:plan
   /lean:implement
   /lean:verify
   /lean:deploy
   ```

---

### 🔧 VS Code Extension

Use the Spec2Cloud Toolkit extension to monitor spec-driven workflow progress and scaffold projects from templates directly in VS Code. It complements Copilot CLI workflows with a guided visual experience.

The extension includes views for workflow progress, installed custom agents and skills, and Azure context such as AZD environments, resource groups, Azure Monitor, Container Registry, Foundry projects, Container Apps, and App Service.

**Install:** [Spec2Cloud Toolkit Extension](https://marketplace.visualstudio.com/items?itemName=ms-gbb-tools.spec2cloud-toolkit)

**Quick Start (Template Flow):**

1. **Install the extension:**
   - Open VS Code
   - Go to Extensions (Ctrl+Shift+X / Cmd+Shift+X)
   - Search for "Spec2Cloud Toolkit"
   - Click **Install**

2. **Open a workspace:**
   - Open an existing workspace, or create a new one
   - Open the Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
   - Type `Spec2Cloud: Browse Templates`
   - Browse the template catalog in VS Code

3. **Download and use a template:**
   - Select a template
   - Click **"Download to Workspace"**
   - The template is cloned into your current workspace
   - Follow the template's README for setup instructions

---

## 🤝 Contributing

We welcome contributions! Here's how you can help:

- **Add Templates** - Share your Azure solutions with the community
- **Report Issues** - Found a bug or broken template? Let us know
- **Suggest Features** - Have ideas for improvements? We'd love to hear them
- **Provide Feedback** - Help us make Spec2Cloud better

Visit <https://github.com/Azure-Samples/Spec2Cloud/issues/new/choose> to open issues!

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE.md) file for details.

---

## 🔗 Links

- **Web Catalog:** <http://aka.ms/spec2cloud>
- **VS Code Extension:** <https://marketplace.visualstudio.com/items?itemName=ms-gbb-tools.spec2cloud-toolkit>
- **GitHub Repository:** <https://github.com/Azure-Samples/Spec2Cloud>
- **Template Guidelines:** [TEMPLATES.md](https://github.com/EmeaAppGbb/spec2cloud)

---

**Built with ❤️ by the GBB team**
