import { runEveningWorkflow } from "../src/lib/workflow";

async function main() {
  const force = process.argv.includes("--force");
  const db = await runEveningWorkflow(undefined, { force });
  const brief = [...db.briefs]
    .filter((b) => b.type === "evening")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  console.log("=== Evening workflow ===");
  if (!force) console.log("(idempotent — ใช้ --force หลังกรอกผลเพิ่ม)");
  console.log(brief?.summary ?? "done");
  for (const r of brief?.recommendations ?? []) console.log(`- ${r}`);
  console.log(`\n${brief?.disclaimer ?? ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
