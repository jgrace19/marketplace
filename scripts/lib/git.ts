import { execFileSync } from "node:child_process";

const MAX_DIFF_CHARS = 12_000;

function git(args: string[]): string {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
}

export function changedFilesAgainstMain(baseRef = "origin/main"): string[] {
  try {
    const out = git(["diff", "--name-only", `${baseRef}...HEAD`]);
    return out
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (err) {
    console.warn(`git diff --name-only failed: ${(err as Error).message}`);
    return [];
  }
}

export function diffSummaryAgainstMain(baseRef = "origin/main"): string {
  try {
    const stat = git(["diff", "--stat", `${baseRef}...HEAD`]);
    const head = git(["diff", `${baseRef}...HEAD`]);
    const truncatedDiff =
      head.length > MAX_DIFF_CHARS
        ? `${head.slice(0, MAX_DIFF_CHARS)}\n... (truncated, ${head.length - MAX_DIFF_CHARS} more chars)`
        : head;
    return `${stat.trim()}\n\n${truncatedDiff}`;
  } catch (err) {
    return `(could not compute diff: ${(err as Error).message})`;
  }
}
