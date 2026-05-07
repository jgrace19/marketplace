import { Agent } from "@cursor/sdk";
import { z } from "zod";
import type { QaAgentConfig } from "./configs.js";

const RouterDecisionSchema = z.object({
  decisions: z.array(
    z.object({
      id: z.string(),
      dispatch: z.boolean(),
      reason: z.string(),
    }),
  ),
});

export interface RouterDecision {
  id: string;
  dispatch: boolean;
  reason: string;
}

export interface RouterResult {
  decisions: RouterDecision[];
  rawOutput: string;
}

export interface RouterArgs {
  apiKey: string;
  changedFiles: string[];
  diffSummary: string;
  configs: QaAgentConfig[];
}

/**
 * Run the router: a small one-shot Cursor agent that decides per flow whether
 * the PR diff plausibly affects the flow under test. There is no "dispatch
 * all" fallback. If the router cannot return valid JSON, every flow is
 * reported as skipped with the parse error in `reason` so the PR comment
 * surfaces what happened.
 */
export async function runRouter(args: RouterArgs): Promise<RouterResult> {
  const { apiKey, changedFiles, diffSummary, configs } = args;

  if (configs.length === 0) {
    return { decisions: [], rawOutput: "" };
  }
  if (changedFiles.length === 0) {
    return {
      decisions: configs.map((cfg) => ({
        id: cfg.id,
        dispatch: false,
        reason: "PR introduces no file changes; nothing to probe.",
      })),
      rawOutput: "",
    };
  }

  const prompt = buildRouterPrompt(changedFiles, diffSummary, configs);

  let raw: string;
  try {
    const result = await Agent.prompt(prompt, {
      apiKey,
      model: { id: "composer-2" },
    });
    raw = result.result ?? "";
  } catch (err) {
    return {
      decisions: configs.map((cfg) => ({
        id: cfg.id,
        dispatch: false,
        reason: `Router agent failed to start: ${(err as Error).message}`,
      })),
      rawOutput: "",
    };
  }

  // Always echo the raw router output (truncated) so future debugging doesn't
  // require an artifact download — this used to be silent on parse failures.
  const preview = raw.slice(0, 600).replace(/\s+/g, " ");
  console.log(
    `Router raw output (${raw.length} chars): ${preview}${raw.length > 600 ? "…" : ""}`,
  );

  const json = extractJsonObject(raw);
  if (!json) {
    return {
      decisions: configs.map((cfg) => ({
        id: cfg.id,
        dispatch: false,
        reason: "Router returned no parseable JSON; defaulting to skip.",
      })),
      rawOutput: raw,
    };
  }

  const parsed = RouterDecisionSchema.safeParse(json);
  if (!parsed.success) {
    return {
      decisions: configs.map((cfg) => ({
        id: cfg.id,
        dispatch: false,
        reason: `Router JSON failed schema check: ${parsed.error.message}`,
      })),
      rawOutput: raw,
    };
  }

  // Make sure every config has a decision; default unmatched configs to skip.
  const byId = new Map(parsed.data.decisions.map((d) => [d.id, d]));
  return {
    decisions: configs.map((cfg) => {
      const decision = byId.get(cfg.id);
      if (!decision) {
        return {
          id: cfg.id,
          dispatch: false,
          reason: "Router did not return a decision for this flow; skipping.",
        };
      }
      return decision;
    }),
    rawOutput: raw,
  };
}

function buildRouterPrompt(
  changedFiles: string[],
  diffSummary: string,
  configs: QaAgentConfig[],
): string {
  const flows = configs
    .map((cfg) => {
      const paths = cfg.paths.length ? cfg.paths.join(", ") : "(none)";
      return `- id: ${cfg.id}\n  paths: ${paths}\n  description: ${cfg.description.replace(/\n+/g, " ")}`;
    })
    .join("\n");

  return [
    "You are a CI router. For each flow below, decide whether the PR's changed",
    "files plausibly affect the flow's behavior. A flow is affected if the diff",
    "touches any path in `paths`, OR if the diff touches shared code (utilities,",
    "styles, app shell) that the description implies the flow depends on.",
    "",
    "Be conservative. Documentation-only changes (docs/, README, comments) and",
    "infrastructure-only changes that do not alter app behavior should NOT",
    "dispatch a flow.",
    "",
    "Respond with ONLY a JSON object (no markdown fences, no commentary) of",
    "this exact shape:",
    '{ "decisions": [ { "id": "<flow-id>", "dispatch": true|false, "reason": "<one sentence>" } ] }',
    "",
    "PR changed files:",
    changedFiles.map((f) => `- ${f}`).join("\n"),
    "",
    "PR diff summary (truncated):",
    diffSummary,
    "",
    "Flows to consider:",
    flows,
  ].join("\n");
}

const FENCE_RE = /```(?:json)?\s*\n([\s\S]*?)```/gi;

/**
 * Be tolerant: accept pure JSON, JSON wrapped in ```json fences, or a JSON
 * object embedded in surrounding prose. We try the cheapest form first, then
 * any fenced block (last fence wins, since models often summarize before the
 * final answer), then a brace-balanced scan over the whole text.
 */
function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }

  const fences: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = FENCE_RE.exec(trimmed)) !== null) {
    fences.push(match[1]);
  }
  for (let i = fences.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(fences[i]);
    } catch {
      // try next fence / fall through
    }
  }

  let depth = 0;
  let start = -1;
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        const candidate = trimmed.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          start = -1;
        }
      }
    }
  }
  return null;
}
