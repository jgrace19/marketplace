import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

export const QaAgentConfigSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  paths: z.array(z.string()).default([]),
  focus_prompt: z.string().min(1),
  max_turns: z.number().int().positive().default(60),
});
export type QaAgentConfig = z.infer<typeof QaAgentConfigSchema>;

export async function loadConfigs(dir: string): Promise<QaAgentConfig[]> {
  const entries = await readdir(dir);
  const yamlFiles = entries.filter(
    (name) => name.endsWith(".yaml") || name.endsWith(".yml"),
  );
  const out: QaAgentConfig[] = [];
  for (const name of yamlFiles) {
    const raw = await readFile(join(dir, name), "utf8");
    const parsed = QaAgentConfigSchema.parse(parseYaml(raw));
    out.push(parsed);
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}
