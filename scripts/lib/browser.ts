import { Agent, CursorAgentError } from "@cursor/sdk";
import type { QaAgentConfig } from "./configs.js";
import { FindingsBundleSchema, type Finding } from "./findings.js";
import {
  startStreamHeartbeat,
  waitForRunWithTimeout,
} from "./agent-runtime.js";

const BROWSER_AGENT_TIMEOUT_MS = 10 * 60 * 1000;
const FINDINGS_FILENAME = "findings.json";

export interface BrowserAgentInput {
  apiKey: string;
  repoUrl: string;
  repoSlug: string;
  githubToken?: string;
  startingRef: string;
  config: QaAgentConfig;
}

export interface BrowserAgentResult {
  configId: string;
  status: "ok" | "startup-failed" | "run-failed" | "timed-out" | "no-findings";
  agentId?: string;
  runId?: string;
  branch?: string;
  prUrl?: string;
  findings: Finding[];
  findingsSource?: "fenced-json" | "branch-file";
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
  const { apiKey, repoUrl, repoSlug, githubToken, startingRef, config } =
    input;

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

    const branch = result.git?.branches?.[0]?.branch;
    const prUrl = result.git?.branches?.[0]?.prUrl;

    // Two transports, in order of preference:
    //   1. Fenced JSON in the agent's final assistant message (if it followed
    //      the prompt).
    //   2. findings.json committed to the cloud agent's branch (if it took the
    //      idiomatic Cursor cloud agent route of committing its work).
    const fullText = `${assistantText}\n${result.result ?? ""}`;
    let findings = parseFindings(fullText);
    let findingsSource: BrowserAgentResult["findingsSource"];
    if (findings.length) {
      findingsSource = "fenced-json";
    } else if (branch) {
      const fromBranch = await fetchFindingsFromBranch({
        repoSlug,
        branch,
        githubToken,
        configId: config.id,
      });
      if (fromBranch.length) {
        findings = fromBranch;
        findingsSource = "branch-file";
      }
    }

    return {
      configId: config.id,
      status: findings.length ? "ok" : "no-findings",
      agentId: agent.agentId,
      runId: run.id,
      branch,
      prUrl,
      findings,
      findingsSource,
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

interface FetchFromBranchInput {
  repoSlug: string;
  branch: string;
  githubToken?: string;
  configId: string;
}

/**
 * Cursor cloud agents typically commit work to their own branch in the host
 * repo. We use the GitHub Contents API (rather than `git fetch`) so we don't
 * depend on the orchestrator's local git remote being writable or the branch
 * being already fetched in CI.
 */
async function fetchFindingsFromBranch(
  input: FetchFromBranchInput,
): Promise<Finding[]> {
  const { repoSlug, branch, githubToken, configId } = input;
  if (!githubToken) {
    console.warn(
      `[${configId}] cloud agent worked on branch ${branch} but no GH token is set; cannot fetch findings.json from it.`,
    );
    return [];
  }
  const url = `https://api.github.com/repos/${repoSlug}/contents/${FINDINGS_FILENAME}?ref=${encodeURIComponent(branch)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
  } catch (err) {
    console.warn(
      `[${configId}] GitHub API request for ${branch}/findings.json failed: ${(err as Error).message}`,
    );
    return [];
  }
  if (res.status === 404) {
    console.warn(
      `[${configId}] no findings.json found on cloud agent branch ${branch}.`,
    );
    return [];
  }
  if (!res.ok) {
    console.warn(
      `[${configId}] GitHub API ${res.status} fetching findings.json from ${branch}: ${await safeReadBody(res)}`,
    );
    return [];
  }
  let body: { content?: string; encoding?: string };
  try {
    body = (await res.json()) as { content?: string; encoding?: string };
  } catch (err) {
    console.warn(
      `[${configId}] GitHub API response was not JSON: ${(err as Error).message}`,
    );
    return [];
  }
  if (!body.content || body.encoding !== "base64") {
    console.warn(
      `[${configId}] unexpected GitHub Contents shape (encoding=${body.encoding ?? "?"}).`,
    );
    return [];
  }
  let raw: string;
  try {
    raw = Buffer.from(body.content, "base64").toString("utf8");
  } catch (err) {
    console.warn(
      `[${configId}] failed to decode findings.json from base64: ${(err as Error).message}`,
    );
    return [];
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    console.warn(
      `[${configId}] findings.json on ${branch} is not valid JSON: ${(err as Error).message}`,
    );
    return [];
  }
  const parsed = FindingsBundleSchema.safeParse(json);
  if (!parsed.success) {
    console.warn(
      `[${configId}] findings.json on ${branch} failed schema check: ${parsed.error.message}`,
    );
    return [];
  }
  return parsed.data.findings;
}

async function safeReadBody(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return "(could not read body)";
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
    "## Reporting (REQUIRED)",
    "",
    "Write `findings.json` at the repository root with EXACTLY this shape and",
    "commit it to your working branch (your normal cloud-agent branch is",
    "fine — the orchestrator reads `findings.json` directly from that branch",
    "via the GitHub Contents API). Do NOT open a pull request.",
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
    "If you find no bugs, write `{\"findings\": []}` to the same file. As a",
    "redundant transport you may also include the same JSON object inside a",
    "fenced ```json``` block at the end of your final assistant message; the",
    "orchestrator prefers that when present and falls back to the file. Do",
    "not modify any other files.",
  ].join("\n");
}
