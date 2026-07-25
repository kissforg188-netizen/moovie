import { runMorningWorkflow } from "../src/lib/workflow";
import { todayISO } from "../src/lib/db";

async function main() {
  const date = process.argv[2] ?? todayISO();
  console.log(`\n☀️  Morning workflow — ${date}\n`);
  const { brief, rankedCount, draftCount } = await runMorningWorkflow(date);
  console.log(brief.summary);
  console.log(`\nTop products: ${rankedCount}`);
  console.log(`Draft posts created: ${draftCount} (ต้อง approve ก่อนโพสต์จริง)\n`);
  console.log("ควรทำวิดีโอก่อน:");
  for (const line of brief.videoPriority) {
    console.log(`  • ${line}`);
  }
  console.log("\nคำแนะนำสั้น ๆ:");
  for (const line of brief.recommendations) {
    console.log(`  • ${line}`);
  }
  console.log("\nเปิดแดชบอร์ด: npm run dev → http://localhost:3000\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
