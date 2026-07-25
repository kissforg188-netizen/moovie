import { runEveningWorkflow } from "../src/lib/workflow";
import { todayISO } from "../src/lib/db";

async function main() {
  const date = process.argv[2] ?? todayISO();
  console.log(`\n🌙 Evening workflow — ${date}\n`);
  const { brief, analysis } = await runEveningWorkflow(date);
  console.log(brief.summary);
  console.log("\nอินไซต์โพสต์:");
  for (const insight of analysis.insights) {
    console.log(
      `  • ${insight.productName} [${insight.channel}] views=${insight.views} clicks=${insight.clicks} orders=${insight.orders} commission=${insight.commissionEarned}`
    );
    console.log(`    → ${insight.note}`);
  }
  console.log("\nแนะนำวันถัดไป:");
  for (const line of analysis.recommendations) {
    console.log(`  • ${line}`);
  }
  for (const line of analysis.nextDayAngles) {
    console.log(`  • มุมขาย: ${line}`);
  }
  console.log(
    "\nหมายเหตุ: กรอกผลลัพธ์ในแดชบอร์ด (หน้า Results) ก่อนรัน evening เพื่อวิเคราะห์ได้แม่นขึ้น\n"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
