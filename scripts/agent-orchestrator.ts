import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfigs, type QaAgentConfig } from "./lib/configs.js";
import {
  changedFilesAgainstMain,
  diffSummaryAgainstMain,
} from "./lib/git.js";
import { runRouter } from "./lib/router.js";
import { runBrowserAgent, type BrowserAgentResult } from "./lib/browser.js";
import { runTriageAgent, type TriageOutput } from "./lib/triage.js";
import {
  dedupWithinRun,
  fingerprintFinding,
  type Finding,
  type Triage,
} from "./lib/findings.js";
import { LinearReporter } from "./lib/linear.js";
import {
  postPrComment,
  renderPrCommentBody,
  type DispatchSummaryRow,
  type FindingSummaryRow,
} from "./lib/pr-comment.js";

// Resolve paths against the repo root so the orchestrator works regardless of
// the cwd it is launched from (the CI workflow runs it from `scripts/`).
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_DIR = join(REPO_ROOT, ".github", "qa-agents");
const OUTPUT_DIR = join(REPO_ROOT, "scripts", "output");

interface Env {
  cursorApiKey: string;
  linearApiKey?: string;
  linearTeamId?: string;
  linearProjectId?: string;
  ghRepo: string;
  ghSha: string;
  ghHeadRef: string;
  ghToken?: string;
  prNumber?: string;
  baseRef: string;
}

function readEnv(): Env {
  const cursorApiKey = process.env.CURSOR_API_KEY;
  if (!cursorApiKey) {
    throw new Error("CURSOR_API_KEY is required");
  }
  const ghRepo = process.env.GH_REPO || process.env.GITHUB_REPOSITORY;
  const ghSha =
    process.env.GH_SHA ||
    process.env.GITHUB_SHA ||
    process.env.GITHUB_HEAD_SHA ||
    "";
  if (!ghRepo) throw new Error("GH_REPO or GITHUB_REPOSITORY is required");
  if (!ghSha) throw new Error("GH_SHA or GITHUB_SHA is required");
  // The Cursor cloud API expects a branch name (not a SHA) as startingRef, so
  // we require the PR's head ref. GITHUB_HEAD_REF is set by GitHub Actions on
  // pull_request events.
  const ghHeadRef = process.env.GH_HEAD_REF || process.env.GITHUB_HEAD_REF;
  if (!ghHeadRef) {
    throw new Error("GH_HEAD_REF or GITHUB_HEAD_REF is required");
  }

  return {
    cursorApiKey,
    linearApiKey: process.env.LINEAR_API_KEY,
    linearTeamId: process.env.LINEAR_TEAM_ID,
    linearProjectId: process.env.LINEAR_PROJECT_ID,
    ghRepo,
    ghSha,
    ghHeadRef,
    ghToken: process.env.GH_TOKEN || process.env.GITHUB_TOKEN,
    prNumber: process.env.PR_NUMBER,
    baseRef: process.env.BASE_REF || "origin/main",
  };
}

async function main(): Promise<void> {
  const env = readEnv();
  mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`Repo: ${env.ghRepo} @ ${env.ghSha}`);
  if (env.prNumber) console.log(`PR: #${env.prNumber}`);

  const configs = await loadConfigs(CONFIG_DIR);
  console.log(`Loaded ${configs.length} flow configs: ${configs.map((c) => c.id).join(", ") || "none"}`);
  if (configs.length === 0) {
    console.log("No flow configs found; nothing to do.");
    return;
  }

  // 1. Router gating.
  const changedFiles = changedFilesAgainstMain(env.baseRef);
  const diffSummary = diffSummaryAgainstMain(env.baseRef);
  console.log(`Changed files (${changedFiles.length}):`);
  for (const f of changedFiles) console.log(`  ${f}`);

  const router = await runRouter({
    apiKey: env.cursorApiKey,
    changedFiles,
    diffSummary,
    configs,
  });
  const decisions = router.decisions;
  writeFileSync(
    join(OUTPUT_DIR, "router-decisions.json"),
    JSON.stringify(decisions, null, 2),
  );
  // Persist the raw model output too — when the router fails to produce
  // parseable JSON the only way to debug is to see what it actually said.
  writeFileSync(join(OUTPUT_DIR, "router-raw.txt"), router.rawOutput);
  for (const d of decisions) {
    console.log(`Router: ${d.id} dispatch=${d.dispatch} (${d.reason})`);
  }

  // 2. Browser fan-out (only for dispatched flows; never fall back to all).
  const dispatchedConfigs = decisions
    .filter((d) => d.dispatch)
    .map((d) => configs.find((c) => c.id === d.id))
    .filter((c): c is QaAgentConfig => Boolean(c));

  let browserResults: BrowserAgentResult[] = [];
  if (dispatchedConfigs.length === 0) {
    console.log("Router dispatched no flows; emitting empty PR comment and exiting.");
  } else {
    browserResults = await Promise.all(
      dispatchedConfigs.map((cfg) =>
        runBrowserAgent({
          apiKey: env.cursorApiKey,
          repoUrl: `https://github.com/${env.ghRepo}`,
          repoSlug: env.ghRepo,
          githubToken: env.ghToken,
          startingRef: env.ghHeadRef,
          config: cfg,
        }),
      ),
    );
  }

  for (const r of browserResults) {
    writeFileSync(
      join(OUTPUT_DIR, `browser-${r.configId}.json`),
      JSON.stringify(r, null, 2),
    );
    console.log(
      `Browser flow ${r.configId}: status=${r.status} findings=${r.findings.length}${r.findingsSource ? ` source=${r.findingsSource}` : ""}${r.branch ? ` branch=${r.branch}` : ""}${r.error ? ` error=${r.error}` : ""}`,
    );
  }

  const allFindings: Finding[] = browserResults.flatMap((r) => r.findings);
  const dedupedFindings = dedupWithinRun(allFindings);
  console.log(
    `Findings: ${allFindings.length} total, ${dedupedFindings.length} after intra-run dedup`,
  );

  // 3. Cross-run dedup against open Linear issues.
  const reporter = createReporter(env);
  type EnrichedFinding = {
    finding: Finding;
    fingerprint: string;
    existing?: Awaited<ReturnType<LinearReporter["findByFingerprint"]>>;
    skipped?: "dismissed";
  };

  const enriched: EnrichedFinding[] = [];
  for (const finding of dedupedFindings) {
    const fingerprint = fingerprintFinding(finding);
    let existing: EnrichedFinding["existing"];
    if (reporter) {
      try {
        existing = await reporter.findByFingerprint(fingerprint);
      } catch (err) {
        console.warn(
          `Linear fingerprint lookup failed for ${fingerprint}: ${(err as Error).message}`,
        );
      }
    }
    if (existing?.isDismissed) {
      enriched.push({ finding, fingerprint, existing, skipped: "dismissed" });
    } else {
      enriched.push({ finding, fingerprint, existing });
    }
  }

  // 4. Triage only the surviving findings (skip dismissed; comment-only on
  //    duplicates without re-triaging — re-triage adds cost without value).
  const needsTriage = enriched.filter(
    (e) => !e.skipped && !e.existing,
  );
  const triageOutputs: TriageOutput[] = needsTriage.length
      ? await Promise.all(
        needsTriage.map((e) =>
          runTriageAgent({
            apiKey: env.cursorApiKey,
            repoUrl: `https://github.com/${env.ghRepo}`,
            startingRef: env.ghHeadRef,
            finding: e.finding,
          }),
        ),
      )
    : [];

  for (const t of triageOutputs) {
    writeFileSync(
      join(OUTPUT_DIR, `triage-${t.finding.id}.json`),
      JSON.stringify(t, null, 2),
    );
  }

  const triageById = new Map(
    triageOutputs.map((t) => [t.finding.id, t] as const),
  );

  // 5. File or comment in Linear.
  const findingSummaries: FindingSummaryRow[] = [];
  const notes: string[] = [];
  for (const e of enriched) {
    const triageResult = triageById.get(e.finding.id);
    const result = await fileFinding({
      reporter,
      finding: e.finding,
      fingerprint: e.fingerprint,
      existing: e.existing ?? undefined,
      skipped: e.skipped,
      triage: triageResult?.triage,
      triageError: triageResult?.error,
      env,
    });
    findingSummaries.push(result);
  }

  // 6. Surface browser-agent failures in PR comment notes.
  for (const r of browserResults) {
    if (
      r.status === "startup-failed" ||
      r.status === "run-failed" ||
      r.status === "timed-out"
    ) {
      notes.push(
        `Flow \`${r.configId}\` failed (${r.status})${r.error ? `: ${r.error}` : ""}.`,
      );
    }
  }
  if (!reporter && dedupedFindings.length > 0) {
    notes.push(
      "Linear is not configured (LINEAR_API_KEY/TEAM_ID missing); findings were not filed.",
    );
  }

  // 7. Post PR comment.
  if (env.prNumber) {
    const body = renderPrCommentBody({
      repoSlug: env.ghRepo,
      sha: env.ghSha,
      dispatch: decisions.map<DispatchSummaryRow>((d) => ({
        id: d.id,
        dispatched: d.dispatch,
        reason: d.reason,
      })),
      findings: findingSummaries,
      notes,
    });
    writeFileSync(join(OUTPUT_DIR, "pr-comment.md"), body);
    try {
      postPrComment({ prNumber: env.prNumber, body });
    } catch (err) {
      console.warn(`gh pr comment failed: ${(err as Error).message}`);
    }
  } else {
    console.log("No PR_NUMBER set; skipping PR comment.");
  }
}

function createReporter(env: Env): LinearReporter | null {
  if (!env.linearApiKey || !env.linearTeamId) return null;
  return new LinearReporter({
    apiKey: env.linearApiKey,
    teamId: env.linearTeamId,
    projectId: env.linearProjectId,
  });
}

interface FileFindingArgs {
  reporter: LinearReporter | null;
  finding: Finding;
  fingerprint: string;
  existing?: Awaited<ReturnType<LinearReporter["findByFingerprint"]>>;
  skipped?: "dismissed";
  triage?: Triage;
  triageError?: string;
  env: Env;
}

async function fileFinding(args: FileFindingArgs): Promise<FindingSummaryRow> {
  const { reporter, finding, fingerprint, existing, skipped, triage, triageError, env } = args;

  if (skipped === "dismissed" && existing) {
    return {
      id: finding.id,
      area: finding.area,
      severity: finding.severity,
      description: finding.description,
      linearUrl: existing.url,
      status: "skipped-dismissed",
      note: "matches dismissed Linear issue",
    };
  }

  if (!reporter) {
    return {
      id: finding.id,
      area: finding.area,
      severity: finding.severity,
      description: finding.description,
      status: "filed",
      note: "Linear disabled; finding logged to artifacts only",
    };
  }

  if (existing) {
    try {
      await reporter.commentOnIssue(
        existing.id,
        `Reproduced again on PR #${env.prNumber ?? "?"} (sha ${env.ghSha.slice(0, 7)}). Fingerprint \`${fingerprint}\`.`,
      );
      return {
        id: finding.id,
        area: finding.area,
        severity: finding.severity,
        description: finding.description,
        linearUrl: existing.url,
        status: "commented",
      };
    } catch (err) {
      return {
        id: finding.id,
        area: finding.area,
        severity: finding.severity,
        description: finding.description,
        linearUrl: existing.url,
        status: "commented",
        note: `comment failed: ${(err as Error).message}`,
      };
    }
  }

  if (!triage) {
    // No triage available; fall back to filing the bare finding so engineers
    // still see it. We synthesize a placeholder triage from the finding itself.
    const fallback: Triage = {
      rootCause: "Triage agent did not return a structured report.",
      suspectedFiles: [],
      recentRelevantCommits: [],
      existingTestGap: null,
      suggestedFix: "Reproduce locally and investigate; see Observed/Expected sections.",
      severity: finding.severity,
      confidence: finding.confidence,
    };
    try {
      const issue = await reporter.createIssue({
        finding,
        triage: fallback,
        fingerprint,
        prNumber: env.prNumber,
        repoSlug: env.ghRepo,
        sha: env.ghSha,
      });
      return {
        id: finding.id,
        area: finding.area,
        severity: finding.severity,
        description: finding.description,
        linearUrl: issue.url,
        status: "triage-failed",
        note: triageError ?? "triage returned no JSON; filed without triage",
      };
    } catch (err) {
      return {
        id: finding.id,
        area: finding.area,
        severity: finding.severity,
        description: finding.description,
        status: "triage-failed",
        note: `Linear createIssue failed: ${(err as Error).message}`,
      };
    }
  }

  try {
    const issue = await reporter.createIssue({
      finding,
      triage,
      fingerprint,
      prNumber: env.prNumber,
      repoSlug: env.ghRepo,
      sha: env.ghSha,
    });
    return {
      id: finding.id,
      area: finding.area,
      severity: finding.severity,
      description: finding.description,
      linearUrl: issue.url,
      status: "filed",
    };
  } catch (err) {
    return {
      id: finding.id,
      area: finding.area,
      severity: finding.severity,
      description: finding.description,
      status: "filed",
      note: `Linear createIssue failed: ${(err as Error).message}`,
    };
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
