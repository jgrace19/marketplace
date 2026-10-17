import { Agent, CursorAgentError } from "@cursor/sdk";
import type { Finding, Triage } from "./findings.js";
import { TriageSchema } from "./findings.js";
import {
  consumeRunWithTimeout,
  startStreamHeartbeat,
} from "./agent-runtime.js";

const TRIAGE_AGENT_TIMEOUT_MS = 5 * 60 * 1000;

export interface TriageInput {
  apiKey: string;
  repoUrl: string;
  startingRef: string;
  finding: Finding;
}

export interface TriageOutput {
  finding: Finding;
  triage?: Triage;
  agentId?: string;
  runId?: string;
  error?: string;
  timedOut?: boolean;
}

/**
 * For one finding, spawn a repo-aware Cursor cloud agent. The agent has the
 * full repo cloned and indexed, so it can grep, read git history, and reason
 * about likely root cause. We require strict JSON output that matches the
 * triage schema; anything else is recorded as a triage error and the orchestrator
 * still files the bug from the finding alone.
 */
export async function runTriageAgent(
  input: TriageInput,
): Promise<TriageOutput> {
  const { apiKey, repoUrl, startingRef, finding } = input;

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
      finding,
      error:
        err instanceof CursorAgentError
          ? `Triage agent startup failed: ${err.message}`
          : `Triage agent startup failed: ${(err as Error).message}`,
    };
  }

  try {
    const prompt = buildTriagePrompt(finding);
    const run = await agent.send(prompt);
    console.log(
      `[triage:${finding.id}] cloud agent ${agent.agentId} run ${run.id} started`,
    );

    const heartbeat = startStreamHeartbeat({ label: `triage:${finding.id}` });
    let lastText = "";
    let result;
    let timedOut = false;
    let timeoutMs: number | undefined;
    try {
      ({ result, timedOut, timeoutMs } = await consumeRunWithTimeout(
        run,
        TRIAGE_AGENT_TIMEOUT_MS,
        (event) => {
          heartbeat.tick();
          if (event.type === "assistant") {
            for (const block of event.message.content) {
              if (block.type === "text" && block.text.trim()) {
                lastText = block.text;
              }
            }
          }
        },
      ));
    } finally {
      heartbeat.stop();
    }

    if (timedOut) {
      return {
        finding,
        agentId: agent.agentId,
        runId: run.id,
        error: `Triage agent exceeded ${Math.round((timeoutMs ?? 0) / 1000)}s timeout`,
        timedOut: true,
      };
    }

    if (!result || result.status !== "finished") {
      return {
        finding,
        agentId: agent.agentId,
        runId: run.id,
        error: `Triage run ended with status=${result?.status ?? "unknown"}`,
      };
    }

    const text = result.result?.trim() || lastText;
    const parsed = parseTriage(text);
    if (!parsed) {
      return {
        finding,
        agentId: agent.agentId,
        runId: run.id,
        error: "Triage agent returned no parseable JSON",
      };
    }

    return {
      finding,
      triage: parsed,
      agentId: agent.agentId,
      runId: run.id,
    };
  } catch (err) {
    return {
      finding,
      agentId: agent.agentId,
      error: (err as Error).message,
    };
  } finally {
    await agent[Symbol.asyncDispose]();
  }
}

function buildTriagePrompt(finding: Finding): string {
  return [
    "You are a code-aware triage agent for a CI bug-finding pipeline.",
    "A browser exploration agent reported the following finding against the",
    "repo cloned in this VM. Your job is to investigate the codebase and return",
    "a structured triage report.",
    "",
    "## Finding",
    "```json",
    JSON.stringify(finding, null, 2),
    "```",
    "",
    "## What to do",
    "",
    "1. Use grep / read / git log to locate the most likely source of the bug.",
    "2. Identify suspected files (with line ranges if obvious) and recent",
    "   commits whose changes are likely responsible.",
    "3. Note whether existing tests cover this area; if there is a clear test",
    "   gap, describe it briefly.",
    "4. Suggest a concrete fix in plain English (no code).",
    "5. Reassess severity and confidence based on what the code actually shows.",
    "",
    "## Output",
    "",
    "Respond with ONLY a JSON object (no markdown fences, no commentary) of",
    "this exact shape:",
    "",
    "```json",
    "{",
    `  "rootCause": "<one paragraph>",`,
    `  "suspectedFiles": [{ "path": "<file>", "lines": "<start-end or single>", "why": "<reason>" }],`,
    `  "recentRelevantCommits": [{ "sha": "<sha>", "message": "<message>", "why": "<reason>" }],`,
    `  "existingTestGap": "<string or null>",`,
    `  "suggestedFix": "<concrete description>",`,
    `  "severity": "critical | major | minor | cosmetic",`,
    `  "confidence": "high | medium | low"`,
    "}",
    "```",
    "",
    "Do NOT modify the repo. Do NOT open a PR. Output only the JSON.",
  ].join("\n");
}

function parseTriage(text: string): Triage | null {
  if (!text) return null;
  try {
    const json = JSON.parse(text);
    const parsed = TriageSchema.safeParse(json);
    if (parsed.success) return parsed.data;
  } catch {
    // fall through to bracket scan
  }

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
        const candidate = text.slice(start, i + 1);
        try {
          const json = JSON.parse(candidate);
          const parsed = TriageSchema.safeParse(json);
          if (parsed.success) return parsed.data;
        } catch {
          start = -1;
        }
      }
    }
  }
  return null;
}
