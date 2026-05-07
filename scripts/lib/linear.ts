import { LinearClient } from "@linear/sdk";
import type { Finding, Triage } from "./findings.js";
import { severityToPriority } from "./findings.js";

const FINGERPRINT_TAG = "qa-fingerprint:";
export const LABEL_AUTO_FILED = "auto-qa-filed";
export const LABEL_DISMISSED = "auto-qa-dismissed";

export interface LinearConfig {
  apiKey: string;
  teamId: string;
  projectId?: string;
}

export class LinearReporter {
  private readonly client: LinearClient;
  private readonly teamId: string;
  private readonly projectId?: string;
  private labelCache: Map<string, string> | null = null;

  constructor(config: LinearConfig) {
    this.client = new LinearClient({ apiKey: config.apiKey });
    this.teamId = config.teamId;
    this.projectId = config.projectId;
  }

  /**
   * Searches by fingerprint marker embedded in the issue description.
   * The Linear API does not have a great native key-value index, so we use
   * the description text as the source of truth and grep for the marker.
   */
  async findByFingerprint(fingerprint: string): Promise<{
    id: string;
    identifier: string;
    url: string;
    isDismissed: boolean;
  } | null> {
    const marker = `${FINGERPRINT_TAG}${fingerprint}`;
    const results = await this.client.issues({
      filter: {
        team: { id: { eq: this.teamId } },
        description: { contains: marker },
      },
      first: 5,
    });

    for (const issue of results.nodes) {
      const labels = await issue.labels();
      const labelNames = labels.nodes.map((l) => l.name);
      const isDismissed = labelNames.includes(LABEL_DISMISSED);
      return {
        id: issue.id,
        identifier: issue.identifier,
        url: issue.url,
        isDismissed,
      };
    }
    return null;
  }

  async commentOnIssue(issueId: string, body: string): Promise<void> {
    await this.client.createComment({ issueId, body });
  }

  async createIssue(args: {
    finding: Finding;
    triage: Triage;
    fingerprint: string;
    prNumber?: string;
    repoSlug?: string;
    sha?: string;
  }): Promise<{ id: string; identifier: string; url: string }> {
    const { finding, triage, fingerprint, prNumber, repoSlug, sha } = args;

    const labelIds = await this.resolveLabelIds([
      LABEL_AUTO_FILED,
      `area:${finding.area}`,
      `severity:${triage.severity}`,
    ]);

    const description = renderIssueBody({
      finding,
      triage,
      fingerprint,
      prNumber,
      repoSlug,
      sha,
    });

    const payload = await this.client.createIssue({
      teamId: this.teamId,
      projectId: this.projectId,
      title: `[${triage.severity.toUpperCase()}] ${truncate(finding.description, 120)}`,
      description,
      priority: severityToPriority(triage.severity),
      labelIds,
    });

    const issue = await payload.issue;
    if (!issue) {
      throw new Error("Linear createIssue returned no issue payload");
    }
    return { id: issue.id, identifier: issue.identifier, url: issue.url };
  }

  /**
   * Best-effort: looks up label IDs by name within the team, creating any
   * that don't exist. Caches per orchestrator run so we don't re-query.
   */
  private async resolveLabelIds(names: string[]): Promise<string[]> {
    if (!this.labelCache) {
      this.labelCache = new Map();
      const team = await this.client.team(this.teamId);
      const labels = await team.labels({ first: 100 });
      for (const label of labels.nodes) {
        this.labelCache.set(label.name, label.id);
      }
    }
    const out: string[] = [];
    for (const name of names) {
      let id = this.labelCache.get(name);
      if (!id) {
        const created = await this.client.createIssueLabel({
          teamId: this.teamId,
          name,
        });
        const label = await created.issueLabel;
        if (label) {
          id = label.id;
          this.labelCache.set(name, id);
        }
      }
      if (id) out.push(id);
    }
    return out;
  }
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function renderIssueBody(args: {
  finding: Finding;
  triage: Triage;
  fingerprint: string;
  prNumber?: string;
  repoSlug?: string;
  sha?: string;
}): string {
  const { finding, triage, fingerprint, prNumber, repoSlug, sha } = args;

  const repro = finding.reproSteps.length
    ? finding.reproSteps.map((step, i) => `${i + 1}. ${step}`).join("\n")
    : "_(no repro steps captured)_";

  const suspected = triage.suspectedFiles.length
    ? triage.suspectedFiles
        .map((file) => {
          const link = repoSlug && sha
            ? `[\`${file.path}${file.lines ? `:${file.lines}` : ""}\`](https://github.com/${repoSlug}/blob/${sha}/${file.path}${file.lines ? `#L${file.lines.replace(/[^0-9-]/g, "")}` : ""})`
            : `\`${file.path}${file.lines ? `:${file.lines}` : ""}\``;
          return `- ${link} — ${file.why}`;
        })
        .join("\n")
    : "_(no suspected files)_";

  const commits = triage.recentRelevantCommits.length
    ? triage.recentRelevantCommits
        .map((c) => {
          const link = repoSlug
            ? `[\`${c.sha.slice(0, 7)}\`](https://github.com/${repoSlug}/commit/${c.sha})`
            : `\`${c.sha.slice(0, 7)}\``;
          return `- ${link} ${c.message} — ${c.why}`;
        })
        .join("\n")
    : "_(no related commits)_";

  return [
    `**Severity:** ${triage.severity} · **Confidence:** ${triage.confidence}`,
    prNumber ? `**Detected in PR:** #${prNumber}` : null,
    "",
    "## Observed",
    finding.observedBehavior,
    "",
    "## Expected",
    finding.expectedBehavior,
    "",
    "## Reproduction",
    repro,
    "",
    "## Suspected root cause",
    triage.rootCause,
    "",
    "## Suspected files",
    suspected,
    "",
    "## Related commits",
    commits,
    "",
    "## Suggested fix",
    triage.suggestedFix,
    "",
    triage.existingTestGap
      ? `## Existing test gap\n${triage.existingTestGap}`
      : null,
    "",
    "---",
    "_Filed automatically by the agent E2E pipeline._",
    `<!-- ${FINGERPRINT_TAG}${fingerprint} -->`,
  ]
    .filter((line) => line !== null)
    .join("\n");
}
