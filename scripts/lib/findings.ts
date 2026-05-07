import { createHash } from "node:crypto";
import { z } from "zod";

export const SeveritySchema = z.enum([
  "critical",
  "major",
  "minor",
  "cosmetic",
]);
export type Severity = z.infer<typeof SeveritySchema>;

export const ConfidenceSchema = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const FindingSchema = z.object({
  id: z.string().min(1),
  area: z.string().min(1),
  severity: SeveritySchema,
  confidence: ConfidenceSchema,
  description: z.string().min(1),
  reproSteps: z.array(z.string()).default([]),
  observedBehavior: z.string().min(1),
  expectedBehavior: z.string().min(1),
  consoleErrors: z.array(z.string()).optional(),
  screenshots: z.array(z.string()).optional(),
  domHints: z.array(z.string()).optional(),
});
export type Finding = z.infer<typeof FindingSchema>;

export const FindingsBundleSchema = z.object({
  findings: z.array(FindingSchema),
});

export const TriageSchema = z.object({
  rootCause: z.string().min(1),
  suspectedFiles: z
    .array(
      z.object({
        path: z.string().min(1),
        lines: z.string().optional(),
        why: z.string().min(1),
      }),
    )
    .default([]),
  recentRelevantCommits: z
    .array(
      z.object({
        sha: z.string().min(7),
        message: z.string().min(1),
        why: z.string().min(1),
      }),
    )
    .default([]),
  existingTestGap: z.string().nullable().optional(),
  suggestedFix: z.string().min(1),
  severity: SeveritySchema,
  confidence: ConfidenceSchema,
});
export type Triage = z.infer<typeof TriageSchema>;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Deterministic hash so the same observable bug across runs maps to the same
 * fingerprint. Intentionally coarse: drops noise (whitespace, casing,
 * punctuation) so minor wording variations from the agent collapse together.
 */
export function fingerprintFinding(finding: Finding): string {
  const domHint = finding.domHints?.[0] ?? "";
  const payload = JSON.stringify({
    area: finding.area,
    description: normalize(finding.description),
    domHint: normalize(domHint),
  });
  return createHash("sha1").update(payload).digest("hex").slice(0, 16);
}

/**
 * Within a single orchestrator run, multiple agents (or one agent retrying)
 * sometimes file the same bug twice. Collapse them by fingerprint.
 */
export function dedupWithinRun(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const finding of findings) {
    const fp = fingerprintFinding(finding);
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push(finding);
  }
  return out;
}

export function severityToPriority(severity: Severity): number {
  switch (severity) {
    case "critical":
      return 1;
    case "major":
      return 2;
    case "minor":
      return 3;
    case "cosmetic":
      return 4;
  }
}
