import { Agent, CursorAgentError } from "@cursor/sdk";
import type { QaAgentConfig } from "./configs.js";
import { FindingsBundleSchema, type Finding } from "./findings.js";

const FINDINGS_FILENAME = "findings.json";

export interface BrowserAgentInput {
  apiKey: string;
  repoUrl: string;
  startingRef: string;
  config: QaAgentConfig;
}

export interface BrowserAgentResult {
  configId: string;
  status: "ok" | "startup-failed" | "run-failed" | "no-findings";
  agentId?: string;
  runId?: string;
  prUrl?: string;
  findings: Finding[];
  rawSummary?: string;
  error?: string;
}

/**
 * Spawn one browser-exploration cloud agent for a single QA flow. The cloud
 * agent clones the repo into its own VM, brings up the backend + frontend,
 * drives a browser via the cursor-ide-browser MCP, and writes a findings.json
 * artifact when done. We poll artifacts after the run completes.
 */
export async function runBrowserAgent(
  input: BrowserAgentInput,
): Promise<BrowserAgentResult> {
  const { apiKey, repoUrl, startingRef, config } = input;

  let agent;
  try {
    agent = await Agent.create({
      apiKey,
      cloud: {
        repos: [{ url: repoUrl, startingRef }],
        // Browser explorations should not open PRs against the repo under test.
        autoCreatePR: false,
      },
    });
  } catch (err) {
    return {
      configId: config.id,
      status: "startup-failed",
      findings: [],
      error: formatStartupError(err),
    };
  }

  try {
    const prompt = buildBrowserPrompt(config);
    const run = await agent.send(prompt);

    // Surface IDs immediately so we can investigate from the dashboard if the
    // stream hangs.
    console.log(
      `[${config.id}] cloud agent ${agent.agentId} run ${run.id} started`,
    );

    for await (const event of run.stream()) {
      if (event.type === "assistant") {
        for (const block of event.message.content) {
          if (block.type === "text" && block.text.trim()) {
            process.stdout.write(`[${config.id}] ${block.text}\n`);
          }
        }
      } else if (event.type === "status") {
        console.log(`[${config.id}] status=${event.status}`);
      }
    }

    const result = await run.wait();
    if (result.status !== "finished") {
      return {
        configId: config.id,
        status: "run-failed",
        agentId: agent.agentId,
        runId: run.id,
        findings: [],
        error: `Run terminated with status=${result.status}`,
        rawSummary: result.result,
      };
    }

    const findings = await loadFindingsFromArtifacts(agent);
    return {
      configId: config.id,
      status: findings.length ? "ok" : "no-findings",
      agentId: agent.agentId,
      runId: run.id,
      findings,
      rawSummary: result.result,
    };
  } catch (err) {
    return {
      configId: config.id,
      status: "run-failed",
      agentId: agent.agentId,
      findings: [],
      error: (err as Error).message,
    };
  } finally {
    await agent[Symbol.asyncDispose]();
  }
}

async function loadFindingsFromArtifacts(
  agent: Awaited<ReturnType<typeof Agent.create>>,
): Promise<Finding[]> {
  let artifacts;
  try {
    artifacts = await agent.listArtifacts();
  } catch (err) {
    console.warn(
      `Could not list artifacts for ${agent.agentId}: ${(err as Error).message}`,
    );
    return [];
  }

  const match = artifacts.find((a) => a.path.endsWith(FINDINGS_FILENAME));
  if (!match) return [];

  try {
    const buffer = await agent.downloadArtifact(match.path);
    const json = JSON.parse(buffer.toString("utf8"));
    const parsed = FindingsBundleSchema.safeParse(json);
    if (!parsed.success) {
      console.warn(
        `findings.json for ${agent.agentId} failed schema check: ${parsed.error.message}`,
      );
      return [];
    }
    return parsed.data.findings;
  } catch (err) {
    console.warn(
      `Failed to read findings artifact for ${agent.agentId}: ${(err as Error).message}`,
    );
    return [];
  }
}

function formatStartupError(err: unknown): string {
  if (err instanceof CursorAgentError) {
    return `${err.message} (retryable=${err.isRetryable ?? false})`;
  }
  return (err as Error).message;
}

function buildBrowserPrompt(config: QaAgentConfig): string {
  return [
    `You are a QA exploration agent for the "${config.id}" flow of the FreshCart`,
    "ecommerce simulator. Your repo is already cloned in this cloud VM.",
    "",
    "## Setup (do this first, in order)",
    "",
    "1. Backend: from the repo root, run:",
    "   ```",
    "   cd backend",
    "   python3 -m venv .venv",
    "   . .venv/bin/activate",
    "   pip install -r requirements.txt",
    "   nohup uvicorn main:app --port 8000 --host 127.0.0.1 > /tmp/backend.log 2>&1 &",
    "   ```",
    "",
    "2. Frontend: from the repo root, run:",
    "   ```",
    "   cd frontend",
    "   npm install",
    "   nohup npm run dev -- --host 127.0.0.1 --port 5173 > /tmp/frontend.log 2>&1 &",
    "   ```",
    "",
    "3. Wait until both `http://127.0.0.1:8000/api/health` returns `{\"status\":\"ok\"}`",
    "   and `http://127.0.0.1:5173/` returns HTML (curl is fine).",
    "",
    "## Probing instructions",
    "",
    "Open `http://127.0.0.1:5173/` with the browser MCP and probe the flow:",
    "",
    config.focus_prompt.trim(),
    "",
    "## Reporting",
    "",
    "When you are done probing, write ONE file at `findings.json` (in your",
    "working directory, NOT under any subfolder). It MUST be a JSON object of",
    "this exact shape:",
    "",
    "```json",
    "{",
    '  "findings": [',
    "    {",
    `      "id": "<short-stable-slug>",`,
    `      "area": "${config.id}",`,
    `      "severity": "critical | major | minor | cosmetic",`,
    `      "confidence": "high | medium | low",`,
    `      "description": "<one-sentence summary>",`,
    `      "reproSteps": ["<step 1>", "<step 2>"] ,`,
    `      "observedBehavior": "<what you saw>",`,
    `      "expectedBehavior": "<what should happen>",`,
    `      "consoleErrors": ["<error msg>"],`,
    `      "domHints": ["<selector or aria role you used>"]`,
    "    }",
    "  ]",
    "}",
    "```",
    "",
    "If you find no bugs, write `{ \"findings\": [] }`.",
    "Do NOT write any other artifacts. Do NOT open a pull request.",
    "Do NOT modify the repo. Only the `findings.json` artifact will be read.",
  ].join("\n");
}
