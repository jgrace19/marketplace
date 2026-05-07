import { Agent, CursorAgentError } from "@cursor/sdk";
import type { QaAgentConfig } from "./configs.js";
import { FindingsBundleSchema, type Finding } from "./findings.js";
import {
  startStreamHeartbeat,
  waitForRunWithTimeout,
} from "./agent-runtime.js";

const BROWSER_AGENT_TIMEOUT_MS = 10 * 60 * 1000;

export interface BrowserAgentInput {
  apiKey: string;
  repoUrl: string;
  startingRef: string;
  config: QaAgentConfig;
}

export interface BrowserAgentResult {
  configId: string;
  status: "ok" | "startup-failed" | "run-failed" | "timed-out" | "no-findings";
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
 * drives the browser MCP, and prints findings.json contents in a fenced
 * code block at the end of its run. We parse the JSON out of the streamed
 * assistant text. We previously read findings via `agent.listArtifacts()`,
 * but that only surfaces files committed to the agent's branch, so an agent
 * that just wrote a file to disk produced zero artifacts.
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

    console.log(
      `[${config.id}] cloud agent ${agent.agentId} run ${run.id} started`,
    );

    const heartbeat = startStreamHeartbeat({ label: config.id });
    let assistantText = "";
    try {
      for await (const event of run.stream()) {
        heartbeat.tick();
        if (event.type === "assistant") {
          for (const block of event.message.content) {
            if (block.type === "text" && block.text.trim()) {
              process.stdout.write(`[${config.id}] ${block.text}\n`);
              assistantText += block.text;
            }
          }
        } else if (event.type === "status") {
          console.log(`[${config.id}] status=${event.status}`);
        }
      }
    } finally {
      heartbeat.stop();
    }

    const { result, timedOut, timeoutMs } = await waitForRunWithTimeout(
      run,
      BROWSER_AGENT_TIMEOUT_MS,
    );

    if (timedOut) {
      return {
        configId: config.id,
        status: "timed-out",
        agentId: agent.agentId,
        runId: run.id,
        findings: [],
        error: `Browser agent exceeded ${Math.round((timeoutMs ?? 0) / 1000)}s timeout`,
      };
    }

    if (!result || result.status !== "finished") {
      return {
        configId: config.id,
        status: "run-failed",
        agentId: agent.agentId,
        runId: run.id,
        findings: [],
        error: `Run terminated with status=${result?.status ?? "unknown"}`,
        rawSummary: result?.result,
      };
    }

    const fullText = `${assistantText}\n${result.result ?? ""}`;
    const findings = parseFindings(fullText);
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

const FENCE_RE = /```(?:json)?\s*\n([\s\S]*?)```/gi;

/**
 * Extract a `{ findings: [...] }` JSON object from the agent's streamed text.
 * The agent prompt asks for a fenced ```json``` block at the end. We try every
 * fenced block (last match first) and fall back to a brace-balanced scan over
 * the raw text in case the agent forgot the fences.
 */
function parseFindings(text: string): Finding[] {
  if (!text.trim()) return [];

  const fenced: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = FENCE_RE.exec(text)) !== null) {
    fenced.push(match[1]);
  }

  for (let i = fenced.length - 1; i >= 0; i -= 1) {
    const parsed = tryParseFindingsBundle(fenced[i]);
    if (parsed) return parsed;
  }

  for (const candidate of extractBraceBalancedObjects(text)) {
    const parsed = tryParseFindingsBundle(candidate);
    if (parsed) return parsed;
  }

  return [];
}

function tryParseFindingsBundle(raw: string): Finding[] | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = FindingsBundleSchema.safeParse(json);
  if (!parsed.success) return null;
  return parsed.data.findings;
}

function* extractBraceBalancedObjects(text: string): Generator<string> {
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        yield text.slice(start, i + 1);
        start = -1;
      }
    }
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
    "## Reporting (REQUIRED final message)",
    "",
    "When you are done probing, your FINAL assistant message MUST end with a",
    "single fenced code block tagged `json` containing a JSON object of this",
    "exact shape (no other text inside the fence):",
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
    "If you find no bugs, the fenced block must contain `{\"findings\": []}`.",
    "Do NOT modify the repo and do NOT open a pull request. The fenced JSON",
    "block in your final assistant message is the ONLY way the orchestrator",
    "reads your results.",
  ].join("\n");
}
