import { runMorningWorkflow } from "../src/lib/workflow";

async function main() {
  const db = await runMorningWorkflow();
  const brief = [...db.briefs]
    .filter((b) => b.type === "morning")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  console.log("=== Morning workflow ===");
  console.log(brief?.summary ?? "done");
  for (const r of brief?.recommendations ?? []) console.log(`- ${r}`);
  console.log(`\n${brief?.disclaimer ?? ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
