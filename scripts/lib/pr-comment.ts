import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface DispatchSummaryRow {
  id: string;
  dispatched: boolean;
  reason: string;
}

export interface FindingSummaryRow {
  id: string;
  area: string;
  severity: string;
  description: string;
  linearUrl?: string;
  status: "filed" | "commented" | "skipped-dismissed" | "triage-failed";
  note?: string;
}

export function renderPrCommentBody(args: {
  repoSlug: string;
  sha: string;
  dispatch: DispatchSummaryRow[];
  findings: FindingSummaryRow[];
  notes?: string[];
}): string {
  const { dispatch, findings, notes } = args;

  const dispatched = dispatch.filter((d) => d.dispatched);
  const skipped = dispatch.filter((d) => !d.dispatched);

  const dispatchTable = dispatch.length
    ? [
        "| Flow | Dispatched | Reason |",
        "| --- | --- | --- |",
        ...dispatch.map(
          (d) =>
            `| \`${d.id}\` | ${d.dispatched ? "yes" : "no"} | ${escapeCell(d.reason)} |`,
        ),
      ].join("\n")
    : "_(no flows configured)_";

  const findingsTable = findings.length
    ? [
        "| Area | Severity | Description | Linear | Status |",
        "| --- | --- | --- | --- | --- |",
        ...findings.map(
          (f) =>
            `| \`${f.area}\` | ${f.severity} | ${escapeCell(f.description)} | ${f.linearUrl ? `[${f.linearUrl.split("/").pop()}](${f.linearUrl})` : "-"} | ${f.status}${f.note ? ` (${escapeCell(f.note)})` : ""} |`,
        ),
      ].join("\n")
    : "_No findings._";

  const lines: string[] = [
    "## Agent E2E Exploration",
    "",
    `Dispatched **${dispatched.length}** of **${dispatch.length}** flows. Skipped **${skipped.length}**.`,
    `Filed/updated **${findings.filter((f) => f.linearUrl).length}** Linear issue(s).`,
    "",
    "### Router decisions",
    "",
    dispatchTable,
    "",
    "### Findings",
    "",
    findingsTable,
  ];

  if (notes && notes.length) {
    lines.push("", "### Notes");
    for (const note of notes) lines.push(`- ${note}`);
  }

  return lines.join("\n");
}

/**
 * Use the GitHub CLI to post a comment. We rely on `gh`'s built-in upsert
 * behavior (`--edit-last`) so re-running the workflow on the same PR replaces
 * the previous comment instead of stacking duplicates.
 */
export function postPrComment(args: {
  prNumber: string;
  body: string;
}): void {
  const { prNumber, body } = args;
  const dir = mkdtempSync(join(tmpdir(), "pr-comment-"));
  const file = join(dir, "body.md");
  writeFileSync(file, body, "utf8");
  try {
    execFileSync(
      "gh",
      [
        "pr",
        "comment",
        prNumber,
        "--body-file",
        file,
        "--edit-last",
        "--create-if-none",
      ],
      { stdio: "inherit" },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}
