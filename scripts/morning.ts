import { runMorningWorkflow } from "../src/lib/workflow";

async function main() {
  const force = process.argv.includes("--force");
  const db = await runMorningWorkflow(undefined, { force });
  const brief = [...db.briefs]
    .filter((b) => b.type === "morning")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  console.log("=== Morning workflow ===");
  if (!force) console.log("(idempotent — ใช้ --force เพื่อสร้าง brief/pack ใหม่)");
  console.log(brief?.summary ?? "done");
  for (const r of brief?.recommendations ?? []) console.log(`- ${r}`);
  console.log(`\n${brief?.disclaimer ?? ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
