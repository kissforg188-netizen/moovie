<?php
declare(strict_types=1);
require_once __DIR__ . '/lib/app.php';

if (!is_installed()) {
    header('Location: install.php');
    exit;
}

require_once __DIR__ . '/lib/automation.php';
require_once __DIR__ . '/lib/adapters.php';
ensure_automation_schema();

$page = $_GET['page'] ?? 'home';
$allowed = ['home','products','calendar','results','automation','guide'];
if (!in_array($page, $allowed, true)) $page = 'home';

$ranked = rank_products(5);
$date = today_iso();
$stmt = db()->prepare('SELECT s.*, p.name AS product_name FROM schedule s LEFT JOIN products p ON p.id=s.product_id WHERE s.post_date=? ORDER BY s.suggested_time');
$stmt->execute([$date]);
$todaySchedule = $stmt->fetchAll();
$products = all_products();
$morning = latest_brief('morning');
$evening = latest_brief('evening');
$analysis = analyze_posted(null);
$autoLogs = list_automation_logs(40);
$statusCounts = automation_status_counts();
$adapters = active_affiliate_adapters();
$futureAdapters = future_affiliate_adapters();
$digest = build_daily_digest($date);
$tomorrowPlan = build_tomorrow_plan($date);
$approveQueue = build_approve_queue($date);
$winnerPlaybook = build_winner_playbook($date);
$weeklyReview = build_weekly_review($date);
$postingHygiene = build_posting_hygiene($date);
$resultsIntake = build_results_intake($date);
$creativePerformance = build_creative_performance($date);
$publishQueue = build_publish_queue($date);
$softRoiLab = build_soft_roi_lab($date);
$channelFitLab = build_channel_fit_lab($date);
$categoryFitLab = build_category_fit_lab($date);
$priceBandFitLab = build_price_band_fit_lab($date);
$commissionBandFitLab = build_commission_band_fit_lab($date);
$painClarityFitLab = build_pain_clarity_fit_lab($date);
$videoEaseFitLab = build_video_ease_fit_lab($date);
$seasonalFitLab = build_seasonal_fit_lab($date);
$audienceFitLab = build_audience_fit_lab($date);
$hookFitLab = build_hook_fit_lab($date);
$ctaFitLab = build_cta_fit_lab($date);
?>
<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title><?= h(APP_NAME) ?> — Affiliate Lab</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Sarabun:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="assets/app.css" />
</head>
<body>
  <header class="topnav">
    <a class="logo" href="?page=home"><span class="brand">เลือกดี</span><small>Affiliate Lab</small></a>
    <nav>
      <a class="<?= $page==='home'?'active':'' ?>" href="?page=home">แดชบอร์ด</a>
      <a class="<?= $page==='automation'?'active':'' ?>" href="?page=automation">Automation</a>
      <a class="<?= $page==='products'?'active':'' ?>" href="?page=products">สินค้า</a>
      <a class="<?= $page==='calendar'?'active':'' ?>" href="?page=calendar">ตารางโพสต์</a>
      <a class="<?= $page==='results'?'active':'' ?>" href="?page=results">ผลลัพธ์</a>
      <a class="<?= $page==='guide'?'active':'' ?>" href="guide/">คู่มือรูปภาพ</a>
    </nav>
  </header>

  <main class="wrap">
    <?php if ($page === 'home'): ?>
      <section class="hero fade-up">
        <p class="eyebrow">ใช้งานจริง · MySQL · Draft + Approve</p>
        <h1 class="brand">เลือกดี</h1>
        <p class="lead">คัดสินค้า affiliate สร้างคอนเทนต์ภาษาไทย และวางตารางโพสต์แบบไม่สแปม — ทุกชิ้นเป็น draft จนกว่าคุณจะอนุมัติ</p>
        <div class="actions">
          <button class="btn primary" data-action="automation_morning">รัน Morning Automation</button>
          <button class="btn" data-action="automation_evening">รัน Evening Automation</button>
          <a class="btn" href="?page=automation">Automation Center</a>
          <a class="btn" href="?page=products">เพิ่มสินค้า</a>
        </div>
        <p class="note"><?= h(INCOME_DISCLAIMER) ?></p>
      </section>

      <section class="stats fade-up">
        <article><p>สินค้าทั้งหมด</p><strong><?= count($products) ?></strong></article>
        <article><p>Draft วันนี้</p><strong><?= count(array_filter($todaySchedule, fn($s)=>$s['status']==='draft')) ?></strong></article>
        <article><p>อนุมัติแล้ว</p><strong><?= count(array_filter($todaySchedule, fn($s)=>$s['status']==='approved')) ?></strong></article>
      </section>

      <section class="grid-2">
        <div>
          <h2>Top สินค้าโปรโมต</h2>
          <?php foreach ($ranked as $i => $item): $p=$item['product']; $s=$item['score']; ?>
            <article class="card product-card">
              <img src="<?= h($p['imageUrl'] ?: 'assets/products/fan.svg') ?>" alt="" width="64" height="64" />
              <div>
                <p class="muted">#<?= $i+1 ?> · <?= h($p['platform']) ?> · คะแนน <?= h((string)$s['total']) ?></p>
                <h3><?= h($p['name']) ?></h3>
                <p class="muted">฿<?= number_format($p['price']) ?> · คอม <?= h((string)$p['commissionRate']) ?>% · <?= h($p['category']) ?></p>
              </div>
            </article>
          <?php endforeach; ?>
        </div>
        <div>
          <h2>สรุป workflow</h2>
          <article class="card">
            <h3>เช้า</h3>
            <p><?= h($morning['summary'] ?? 'ยังไม่รัน Morning') ?></p>
            <ul><?php foreach (($morning['recommendations'] ?? []) as $r): ?><li><?= h($r) ?></li><?php endforeach; ?></ul>
          </article>
          <article class="card">
            <h3>เย็น</h3>
            <p><?= h($evening['summary'] ?? 'ยังไม่รัน Evening') ?></p>
            <ul><?php foreach (($evening['recommendations'] ?? []) as $r): ?><li><?= h($r) ?></li><?php endforeach; ?></ul>
          </article>
          <div class="actions">
            <a class="btn" href="api.php?action=export&format=json">Export JSON</a>
            <a class="btn" href="api.php?action=export&format=csv&scope=products">CSV สินค้า</a>
            <a class="btn" href="api.php?action=export&format=csv&scope=schedule">CSV ตาราง</a>
          </div>
        </div>
      </section>

    <?php elseif ($page === 'products'): ?>
      <section class="hero compact">
        <h1>สินค้า Affiliate</h1>
        <p class="lead">ใส่ลิงก์ Shopee/TikTok จริง ราคา ค่าคอม จุดขาย แล้วสร้างคอนเทนต์</p>
      </section>
      <div class="grid-2">
        <form id="productForm" class="card form">
          <label>ชื่อสินค้า<input name="name" required placeholder="เช่น พัดลมมือถือมินิ" /></label>
          <label>แพลตฟอร์ม
            <select name="platform"><option value="shopee">Shopee</option><option value="tiktok_shop">TikTok Shop</option><option value="facebook">Facebook</option></select>
          </label>
          <label>ลิงก์ Affiliate<input name="affiliateUrl" required placeholder="https://..." /></label>
          <div class="row2">
            <label>ราคา<input name="price" type="number" step="0.01" required /></label>
            <label>ค่าคอม %<input name="commissionRate" type="number" step="0.01" required /></label>
          </div>
          <label>หมวดหมู่<input name="category" required placeholder="แกเจ็ต / บิวตี้" /></label>
          <label>จุดขาย (คั่นด้วยคอมมา)<input name="sellingPoints" placeholder="พกง่าย, เงียบ" /></label>
          <label>Pain point (คั่นด้วยคอมมา)<input name="painPoints" placeholder="ร้อน, พกยาก" /></label>
          <label>กลุ่มเป้าหมาย<input name="targetAudience" placeholder="นักเรียน / คนทำงาน" /></label>
          <div class="row2">
            <label>ถ่ายคลิปง่าย 1-5<input name="videoEase" type="number" min="1" max="5" value="4" /></label>
            <label>Seasonal 1-5<input name="seasonalScore" type="number" min="1" max="5" value="3" /></label>
          </div>
          <label>โน้ต<textarea name="notes" rows="2"></textarea></label>
          <button class="btn primary" type="submit">บันทึกสินค้า</button>
        </form>
        <div>
          <?php foreach ($products as $p): ?>
            <article class="card product-card">
              <img src="<?= h($p['imageUrl'] ?: 'assets/products/fan.svg') ?>" alt="" width="56" height="56" />
              <div class="grow">
                <h3><?= h($p['name']) ?></h3>
                <p class="muted"><?= h($p['platform']) ?> · ฿<?= number_format($p['price']) ?> · คอม <?= h((string)$p['commissionRate']) ?>%</p>
                <p class="muted small"><?= h(implode(' · ', $p['sellingPoints'])) ?></p>
                <button class="btn small" data-generate="<?= h($p['id']) ?>">สร้าง Content Pack</button>
                <pre class="pack-out" id="pack-<?= h($p['id']) ?>" hidden></pre>
              </div>
            </article>
          <?php endforeach; ?>
        </div>
      </div>

    <?php elseif ($page === 'calendar'): ?>
      <section class="hero compact">
        <h1>ตารางโพสต์ · <?= h($date) ?></h1>
        <p class="lead">ทุกชิ้นเป็น draft — กด Approve แล้วค่อยโพสต์ด้วยมือบน TikTok/Facebook</p>
      </section>
      <?php if (!$todaySchedule): ?>
        <div class="card">ยังไม่มีคิววันนี้ — กดรัน Morning ที่แดชบอร์ด</div>
      <?php endif; ?>
      <?php foreach ($todaySchedule as $s):
        $q = score_caption_quality((string)$s['caption_preview'], (string)$s['channel']);
      ?>
        <article class="card schedule-card">
          <div class="row-between">
            <div>
              <p class="muted"><?= h($s['suggested_time']) ?> · <?= h(channel_label($s['channel'])) ?> · <span class="badge status-<?= h(ui_status($s['status'])) ?>"><?= h(ui_status($s['status'])) ?></span></p>
              <h3><?= h($s['product_name'] ?? $s['product_id']) ?></h3>
              <p class="muted">คุณภาพแคปชัน: <?= h($q['grade']) ?> (<?= (int)$q['score'] ?>/100) — <?= h($q['label']) ?><?php if (!empty($q['tips'][0])): ?> · <?= h($q['tips'][0]) ?><?php endif; ?></p>
            </div>
            <div class="actions">
              <button class="btn small" data-posting-pack="<?= h($s['id']) ?>">คัดลอก Posting Pack</button>
              <?php if ($s['status']==='draft'): ?>
                <button class="btn primary small" data-approve="<?= h($s['id']) ?>">Approve</button>
              <?php endif; ?>
              <?php if ($s['status']==='approved'): ?>
                <button class="btn small" data-posted="<?= h($s['id']) ?>">ยืนยันว่าโพสต์แล้ว</button>
              <?php endif; ?>
            </div>
          </div>
          <details>
            <summary>ดู caption / script</summary>
            <pre><?= h($s['caption_preview']) ?></pre>
          </details>
        </article>
      <?php endforeach; ?>

    <?php elseif ($page === 'results'): ?>
      <section class="hero compact">
        <h1>ผลลัพธ์ & ROI</h1>
        <p class="lead">กรอก views / clicks / orders / ค่าคอมจากข้อมูลจริงหลังโพสต์</p>
        <p class="note"><?= h(INCOME_DISCLAIMER) ?></p>
      </section>
      <?php foreach ($todaySchedule as $s): ?>
        <form class="card form metrics-form" data-metrics="<?= h($s['id']) ?>">
          <h3><?= h($s['product_name'] ?? '') ?> · <?= h(channel_label($s['channel'])) ?></h3>
          <div class="row4">
            <label>Views<input type="number" name="views" value="<?= h((string)($s['views'] ?? 0)) ?>" /></label>
            <label>Clicks<input type="number" name="clicks" value="<?= h((string)($s['clicks'] ?? 0)) ?>" /></label>
            <label>Orders<input type="number" name="orders" value="<?= h((string)($s['orders_count'] ?? 0)) ?>" /></label>
            <label>ค่าคอม<input type="number" step="0.01" name="commissionEarned" value="<?= h((string)($s['commission_earned'] ?? 0)) ?>" /></label>
          </div>
          <label>โน้ต<input name="notes" value="<?= h((string)($s['metrics_notes'] ?? '')) ?>" /></label>
          <button class="btn primary" type="submit">บันทึกผล</button>
        </form>
      <?php endforeach; ?>
      <section>
        <h2>วิเคราะห์</h2>
        <article class="card">
          <p><?= h($analysis['summary']) ?></p>
          <ul><?php foreach ($analysis['recs'] as $r): ?><li><?= h($r) ?></li><?php endforeach; ?></ul>
        </article>
        <?php foreach ($analysis['perfs'] as $p): ?>
          <article class="card">
            <h3><?= h($p['productName']) ?></h3>
            <p class="muted">CTR <?= number_format($p['ctr']*100,1) ?>% · ROI/คลิก ~฿<?= number_format($p['roiPerClick'],1) ?> · ค่าคอม ฿<?= number_format($p['commission'],0) ?></p>
          </article>
        <?php endforeach; ?>
      </section>

    <?php elseif ($page === 'automation'): ?>
      <section class="hero fade-up">
        <p class="eyebrow">Full Automation · Safe · No spam · Approve gate</p>
        <h1 class="brand">Automation Center</h1>
        <p class="lead">รันงานอัตโนมัติทั้งเช้า–เย็น: คัดสินค้า สร้างคอนเทนต์ จัดตาราง draft และรายงานผล — <strong>ไม่โพสต์จริงจนกว่าจะ Approve</strong></p>
        <p class="note"><?= h(INCOME_DISCLAIMER) ?></p>
      </section>

      <section class="stats fade-up">
        <article><p>Pending</p><strong><?= (int)$statusCounts['pending'] ?></strong></article>
        <article><p>Generated</p><strong><?= (int)$statusCounts['generated'] ?></strong></article>
        <article><p>Approved</p><strong><?= (int)$statusCounts['approved'] ?></strong></article>
        <article><p>Posted</p><strong><?= (int)$statusCounts['posted'] ?></strong></article>
        <article><p>Failed</p><strong><?= (int)$statusCounts['failed'] ?></strong></article>
      </section>

      <section class="card fade-up">
        <h2>Daily Action Digest</h2>
        <p class="muted"><?= h($digest['summary']) ?></p>
        <div class="stats" style="margin-top:0.75rem">
          <article><p>Draft รอตรวจ</p><strong><?= (int)$digest['counts']['draftPending'] ?></strong></article>
          <article><p>บล็อก Approve</p><strong><?= (int)$digest['counts']['approveBlocked'] ?></strong></article>
          <article><p>รอโพสต์มือ</p><strong><?= (int)$digest['counts']['approvedWaitingPost'] ?></strong></article>
          <article><p>รอกรอกผล</p><strong><?= (int)$digest['counts']['missingMetrics'] ?></strong></article>
        </div>
        <ol>
          <?php foreach (array_slice($digest['actions'], 0, 8) as $a): ?>
            <li>
              <strong>[<?= h($a['priority'] === 'now' ? 'ตอนนี้' : ($a['priority'] === 'soon' ? 'ถัดไป' : 'ภายหลัง')) ?>]</strong>
              <?= h($a['title']) ?>
              <div class="muted"><?= h($a['detail']) ?></div>
            </li>
          <?php endforeach; ?>
        </ol>
        <p class="note"><?= h($digest['disclaimer']) ?></p>
      </section>

      <section class="card fade-up">
        <h2>Approve Priority Queue</h2>
        <p class="muted"><?= h($approveQueue['summary']) ?></p>
        <div class="stats" style="margin-top:0.75rem">
          <article><p>พร้อม Approve</p><strong><?= (int)$approveQueue['counts']['ready'] ?></strong></article>
          <article><p>ควรแก้ก่อน</p><strong><?= (int)$approveQueue['counts']['fixFirst'] ?></strong></article>
          <article><p>บล็อก</p><strong><?= (int)$approveQueue['counts']['blocked'] ?></strong></article>
          <article><p>Draft ทั้งหมด</p><strong><?= (int)$approveQueue['counts']['total'] ?></strong></article>
        </div>
        <?php if (!$approveQueue['items']): ?>
          <p class="muted">ยังไม่มี draft ในคิว — รัน Morning แล้วกลับมาตรวจ</p>
        <?php else: ?>
          <ol>
            <?php foreach (array_slice($approveQueue['items'], 0, 6) as $item): ?>
              <li>
                <strong>[<?= h($item['band'] === 'ready' ? 'พร้อม' : ($item['band'] === 'fix_first' ? 'แก้ก่อน' : 'บล็อก')) ?>]</strong>
                <?= h($item['suggestedTime']) ?> · <?= h($item['productName']) ?>
                <div class="muted"><?= h($item['channelLabelTh']) ?> · ลำดับ <?= h((string)$item['priority']) ?>/100 · คุณภาพ <?= h($item['qualityGrade']) ?></div>
                <div class="muted"><?= h($item['nextAction']) ?></div>
              </li>
            <?php endforeach; ?>
          </ol>
        <?php endif; ?>
        <div class="actions">
          <a class="btn" href="api.php?action=export&format=md&scope=approve-queue">Export คิว Approve (.md)</a>
          <a class="btn" href="?page=calendar">ไปตารางโพสต์</a>
        </div>
        <p class="note"><?= h($approveQueue['disclaimer']) ?></p>
      </section>

      <section class="card fade-up">
        <h2>Manual Publish Queue</h2>
        <p class="muted"><?= h($publishQueue['summary']) ?></p>
        <p class="muted">เกรด <?= h($publishQueue['grade']) ?> · <?= (int)$publishQueue['score'] ?>/100 · <?= h($publishQueue['nowHm']) ?></p>
        <div class="stats" style="margin-top:0.75rem">
          <article><p>ค้าง</p><strong><?= (int)$publishQueue['counts']['overdue'] ?></strong></article>
          <article><p>ถึงเวลา</p><strong><?= (int)$publishQueue['counts']['dueNow'] ?></strong></article>
          <article><p>วันนี้</p><strong><?= (int)$publishQueue['counts']['today'] ?></strong></article>
          <article><p>ทั้งหมด</p><strong><?= (int)$publishQueue['counts']['total'] ?></strong></article>
        </div>
        <?php if (!$publishQueue['items']): ?>
          <p class="muted">ยังไม่มีชิ้นที่ Approve — ตรวจคิวด้านบนแล้ว Approve ก่อน ระบบจะไม่โพสต์ให้อัตโนมัติ</p>
        <?php else: ?>
          <ol>
            <?php foreach (array_slice($publishQueue['items'], 0, 6) as $item): ?>
              <li>
                <strong>[<?= h($item['band'] === 'overdue' ? 'ค้าง' : ($item['band'] === 'due_now' ? 'ถึงเวลา' : ($item['band'] === 'today' ? 'วันนี้' : 'เร็วๆ นี้'))) ?>]</strong>
                <?= h($item['date']) ?> <?= h($item['suggestedTime']) ?> · <?= h($item['productName']) ?>
                <div class="muted"><?= h($item['channelLabelTh']) ?> · ลำดับ <?= h((string)$item['priority']) ?>/100 · pack <?= !empty($item['packReady']) ? 'พร้อม' : 'ยังไม่พร้อม' ?></div>
                <div class="muted"><?= h($item['nextAction']) ?></div>
              </li>
            <?php endforeach; ?>
          </ol>
        <?php endif; ?>
        <ul>
          <?php foreach (array_slice($publishQueue['actions'], 0, 3) as $a): ?>
            <li><strong><?= h($a['title']) ?></strong> — <?= h($a['detail']) ?></li>
          <?php endforeach; ?>
        </ul>
        <div class="actions">
          <a class="btn" href="api.php?action=export&format=md&scope=publish">Export Publish Queue (.md)</a>
          <a class="btn" href="?page=calendar">ไปตารางโพสต์</a>
        </div>
        <p class="note"><?= h($publishQueue['disclaimer']) ?></p>
      </section>

      <section class="card fade-up">
        <h2>Soft ROI Lab</h2>
        <p class="muted"><?= h($softRoiLab['summary']) ?></p>
        <p class="muted">เกรด <?= h($softRoiLab['grade']) ?> · <?= (int)$softRoiLab['score'] ?>/100 · หน้าต่าง <?= (int)$softRoiLab['windowDays'] ?> วัน</p>
        <div class="stats" style="margin-top:0.75rem">
          <article><p>มีเมตริก</p><strong><?= (int)$softRoiLab['counts']['postsWithMetrics'] ?></strong></article>
          <article><p>น่าลอง</p><strong><?= (int)$softRoiLab['counts']['promising'] ?></strong></article>
          <article><p>มีต้นทุน</p><strong><?= (int)$softRoiLab['counts']['spendTracked'] ?></strong></article>
          <article><p>ค่าคอมเฉลี่ย</p><strong>฿<?= h((string)$softRoiLab['baseline']['avgCommissionPerPost']) ?></strong></article>
        </div>
        <?php
          $roiRows = array_values(array_filter($softRoiLab['products'], fn($p) => ($p['samples'] ?? 0) > 0));
          if (!$roiRows): ?>
          <p class="muted">ยังไม่มีเมตริกพอสร้างช่วงทดลอง — โพสต์มือแล้วกรอกผลที่ Results</p>
        <?php else: ?>
          <ol>
            <?php foreach (array_slice($roiRows, 0, 5) as $p): ?>
              <li>
                <strong>[<?= h($p['band'] === 'promising' ? 'น่าลอง' : ($p['band'] === 'cold' ? 'อ่อน' : ($p['band'] === 'watch' ? 'เฝ้าดู' : 'ยังไม่มีข้อมูล'))) ?>]</strong>
                <?= h($p['productName']) ?>
                <div class="muted">ช่วงทดลอง ฿<?= h((string)$p['rangeLow']) ?>–<?= h((string)$p['rangeHigh']) ?>/โพสต์ · n=<?= (int)$p['samples'] ?></div>
                <div class="muted"><?= h($p['tip']) ?></div>
              </li>
            <?php endforeach; ?>
          </ol>
        <?php endif; ?>
        <?php if ($softRoiLab['projections']): ?>
          <p class="muted" style="margin-top:0.75rem"><strong>คาดการณ์คิววันนี้ (ทดลอง)</strong></p>
          <ul>
            <?php foreach (array_slice($softRoiLab['projections'], 0, 4) as $pr): ?>
              <li><?= h($pr['productName']) ?> · <?= h($pr['channelLabel']) ?>: ~฿<?= h((string)$pr['projectedMid']) ?> [<?= h((string)$pr['projectedLow']) ?>–<?= h((string)$pr['projectedHigh']) ?>]</li>
            <?php endforeach; ?>
          </ul>
        <?php endif; ?>
        <ul>
          <?php foreach (array_slice($softRoiLab['actions'], 0, 3) as $a): ?>
            <li><strong><?= h($a['title']) ?></strong> — <?= h($a['detail']) ?></li>
          <?php endforeach; ?>
        </ul>
        <div class="actions">
          <a class="btn" href="api.php?action=export&format=md&scope=roi">Export Soft ROI Lab (.md)</a>
          <a class="btn" href="?page=results">ไปกรอกผล</a>
        </div>
        <p class="note"><?= h($softRoiLab['disclaimer']) ?></p>
      </section>

      <section class="card fade-up">
        <h2>Channel Fit Lab</h2>
        <p class="muted"><?= h($channelFitLab['summary']) ?></p>
        <p class="muted">เกรด <?= h($channelFitLab['grade']) ?> · <?= (int)$channelFitLab['score'] ?>/100 · หน้าต่าง <?= (int)$channelFitLab['windowDays'] ?> วัน</p>
        <p><?= h($channelFitLab['mixTip']) ?></p>
        <div class="stats" style="margin-top:0.75rem">
          <article><p>มีเมตริก</p><strong><?= (int)$channelFitLab['counts']['postsWithMetrics'] ?></strong></article>
          <article><p>ช่องมีข้อมูล</p><strong><?= (int)$channelFitLab['counts']['channelsWithData'] ?></strong></article>
          <article><p>แข็งแรง</p><strong><?= (int)$channelFitLab['counts']['strong'] ?></strong></article>
          <article><p>คำแนะนำ</p><strong><?= (int)$channelFitLab['counts']['suggestions'] ?></strong></article>
        </div>
        <?php
          $fitRows = array_values(array_filter($channelFitLab['channels'], fn($c) => ($c['samples'] ?? 0) > 0));
          if (!$fitRows): ?>
          <p class="muted">ยังไม่มีเมตริกรายช่องทาง — โพสต์มือแล้วกรอกผลที่ Results</p>
        <?php else: ?>
          <ol>
            <?php foreach (array_slice($fitRows, 0, 4) as $c): ?>
              <li>
                <strong>[<?= h($c['band'] === 'strong' ? 'แข็งแรง' : ($c['band'] === 'weak' ? 'อ่อน' : ($c['band'] === 'ok' ? 'พอใช้' : 'ยังไม่มีข้อมูล'))) ?>]</strong>
                <?= h($c['channelLabel']) ?>
                <div class="muted">คะแนน <?= (int)$c['score'] ?>/100 · n=<?= (int)$c['samples'] ?> · CTR ~<?= h((string)round($c['avgCtr'] * 100, 1)) ?>%</div>
                <div class="muted"><?= h($c['tip']) ?></div>
              </li>
            <?php endforeach; ?>
          </ol>
        <?php endif; ?>
        <?php if ($channelFitLab['suggestions']): ?>
          <p class="muted" style="margin-top:0.75rem"><strong>คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)</strong></p>
          <ul>
            <?php foreach (array_slice($channelFitLab['suggestions'], 0, 4) as $s): ?>
              <li><?= h($s['productName']) ?>: <?= h($s['currentLabel']) ?> → <?= h($s['suggestedLabel']) ?> — <?= h($s['reason']) ?></li>
            <?php endforeach; ?>
          </ul>
        <?php endif; ?>
        <ul>
          <?php foreach (array_slice($channelFitLab['actions'], 0, 3) as $a): ?>
            <li><strong><?= h($a['title']) ?></strong> — <?= h($a['detail']) ?></li>
          <?php endforeach; ?>
        </ul>
        <div class="actions">
          <a class="btn" href="api.php?action=export&format=md&scope=channel-fit">Export Channel Fit Lab (.md)</a>
          <a class="btn" href="?page=results">ไปกรอกผล</a>
        </div>
        <p class="note"><?= h($channelFitLab['disclaimer']) ?></p>
      </section>

      <section class="card fade-up">
        <h2>Category Fit Lab</h2>
        <p class="muted"><?= h($categoryFitLab['summary']) ?></p>
        <p class="muted">เกรด <?= h($categoryFitLab['grade']) ?> · <?= (int)$categoryFitLab['score'] ?>/100 · หน้าต่าง <?= (int)$categoryFitLab['windowDays'] ?> วัน</p>
        <p><?= h($categoryFitLab['mixTip']) ?></p>
        <div class="stats" style="margin-top:0.75rem">
          <article><p>มีเมตริก</p><strong><?= (int)$categoryFitLab['counts']['postsWithMetrics'] ?></strong></article>
          <article><p>หมวดมีข้อมูล</p><strong><?= (int)$categoryFitLab['counts']['categoriesWithData'] ?></strong></article>
          <article><p>ร้อน</p><strong><?= (int)$categoryFitLab['counts']['hot'] ?></strong></article>
          <article><p>คำแนะนำ</p><strong><?= (int)$categoryFitLab['counts']['suggestions'] ?></strong></article>
        </div>
        <?php
          $catRows = array_values(array_filter($categoryFitLab['categories'], fn($c) => ($c['samples'] ?? 0) > 0));
          if (!$catRows): ?>
          <p class="muted">ยังไม่มีเมตริกรายหมวด — โพสต์มือแล้วกรอกผลที่ Results</p>
        <?php else: ?>
          <ol>
            <?php foreach (array_slice($catRows, 0, 4) as $c): ?>
              <li>
                <strong>[<?= h($c['band'] === 'hot' ? 'ร้อน' : ($c['band'] === 'cold' ? 'เย็น' : ($c['band'] === 'steady' ? 'นิ่ง' : 'ยังไม่มีข้อมูล'))) ?>]</strong>
                <?= h($c['categoryLabel']) ?>
                <div class="muted">คะแนน <?= (int)$c['score'] ?>/100 · n=<?= (int)$c['samples'] ?> · CTR ~<?= h((string)round($c['avgCtr'] * 100, 1)) ?>%</div>
                <div class="muted"><?= h($c['tip']) ?></div>
              </li>
            <?php endforeach; ?>
          </ol>
        <?php endif; ?>
        <?php if ($categoryFitLab['suggestions']): ?>
          <p class="muted" style="margin-top:0.75rem"><strong>คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)</strong></p>
          <ul>
            <?php foreach (array_slice($categoryFitLab['suggestions'], 0, 4) as $s): ?>
              <li><?= h($s['productName']) ?>: <?= h($s['currentCategory']) ?> → <?= h($s['suggestedCategory']) ?> — <?= h($s['reason']) ?></li>
            <?php endforeach; ?>
          </ul>
        <?php endif; ?>
        <ul>
          <?php foreach (array_slice($categoryFitLab['actions'], 0, 3) as $a): ?>
            <li><strong><?= h($a['title']) ?></strong> — <?= h($a['detail']) ?></li>
          <?php endforeach; ?>
        </ul>
        <div class="actions">
          <a class="btn" href="api.php?action=export&format=md&scope=category-fit">Export Category Fit Lab (.md)</a>
          <a class="btn" href="?page=results">ไปกรอกผล</a>
        </div>
        <p class="note"><?= h($categoryFitLab['disclaimer']) ?></p>
      </section>

      <section class="card fade-up">
        <h2>Price Band Lab</h2>
        <p class="muted"><?= h($priceBandFitLab['summary']) ?></p>
        <p class="muted">เกรด <?= h($priceBandFitLab['grade']) ?> · <?= (int)$priceBandFitLab['score'] ?>/100 · หน้าต่าง <?= (int)$priceBandFitLab['windowDays'] ?> วัน</p>
        <p><?= h($priceBandFitLab['mixTip']) ?></p>
        <div class="stats" style="margin-top:0.75rem">
          <article><p>มีเมตริก</p><strong><?= (int)$priceBandFitLab['counts']['postsWithMetrics'] ?></strong></article>
          <article><p>ช่วงมีข้อมูล</p><strong><?= (int)$priceBandFitLab['counts']['bandsWithData'] ?></strong></article>
          <article><p>ร้อน</p><strong><?= (int)$priceBandFitLab['counts']['hot'] ?></strong></article>
          <article><p>คำแนะนำ</p><strong><?= (int)$priceBandFitLab['counts']['suggestions'] ?></strong></article>
        </div>
        <?php
          $bandRows = array_values(array_filter($priceBandFitLab['bands'], fn($b) => ($b['samples'] ?? 0) > 0));
          if (!$bandRows): ?>
          <p class="muted">ยังไม่มีเมตริกรายช่วงราคา — โพสต์มือแล้วกรอกผลที่ Results</p>
        <?php else: ?>
          <ol>
            <?php foreach (array_slice($bandRows, 0, 4) as $b): ?>
              <li>
                <strong>[<?= h($b['status'] === 'hot' ? 'ร้อน' : ($b['status'] === 'cold' ? 'เย็น' : ($b['status'] === 'steady' ? 'นิ่ง' : 'ยังไม่มีข้อมูล'))) ?>]</strong>
                <?= h($b['bandLabel']) ?>
                <div class="muted">คะแนน <?= (int)$b['score'] ?>/100 · n=<?= (int)$b['samples'] ?> · CTR ~<?= h((string)round($b['avgCtr'] * 100, 1)) ?>%</div>
                <div class="muted"><?= h($b['tip']) ?></div>
              </li>
            <?php endforeach; ?>
          </ol>
        <?php endif; ?>
        <?php if ($priceBandFitLab['suggestions']): ?>
          <p class="muted" style="margin-top:0.75rem"><strong>คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)</strong></p>
          <ul>
            <?php foreach (array_slice($priceBandFitLab['suggestions'], 0, 4) as $s): ?>
              <li><?= h($s['productName']) ?>: <?= h($s['currentLabel']) ?> → <?= h($s['suggestedLabel']) ?> — <?= h($s['reason']) ?></li>
            <?php endforeach; ?>
          </ul>
        <?php endif; ?>
        <ul>
          <?php foreach (array_slice($priceBandFitLab['actions'], 0, 3) as $a): ?>
            <li><strong><?= h($a['title']) ?></strong> — <?= h($a['detail']) ?></li>
          <?php endforeach; ?>
        </ul>
        <div class="actions">
          <a class="btn" href="api.php?action=export&format=md&scope=price-band">Export Price Band Lab (.md)</a>
          <a class="btn" href="?page=results">ไปกรอกผล</a>
        </div>
        <p class="note"><?= h($priceBandFitLab['disclaimer']) ?></p>
      </section>

      <section class="card fade-up">
        <h2>Commission Band Lab</h2>
        <p class="muted"><?= h($commissionBandFitLab['summary']) ?></p>
        <p class="muted">เกรด <?= h($commissionBandFitLab['grade']) ?> · <?= (int)$commissionBandFitLab['score'] ?>/100 · หน้าต่าง <?= (int)$commissionBandFitLab['windowDays'] ?> วัน</p>
        <p><?= h($commissionBandFitLab['mixTip']) ?></p>
        <div class="stats" style="margin-top:0.75rem">
          <article><p>มีเมตริก</p><strong><?= (int)$commissionBandFitLab['counts']['postsWithMetrics'] ?></strong></article>
          <article><p>ช่วงมีข้อมูล</p><strong><?= (int)$commissionBandFitLab['counts']['bandsWithData'] ?></strong></article>
          <article><p>ร้อน</p><strong><?= (int)$commissionBandFitLab['counts']['hot'] ?></strong></article>
          <article><p>คำแนะนำ</p><strong><?= (int)$commissionBandFitLab['counts']['suggestions'] ?></strong></article>
        </div>
        <?php
          $rateBandRows = array_values(array_filter($commissionBandFitLab['bands'], fn($b) => ($b['samples'] ?? 0) > 0));
          if (!$rateBandRows): ?>
          <p class="muted">ยังไม่มีเมตริกรายช่วงคอมฯ — โพสต์มือแล้วกรอกผลที่ Results</p>
        <?php else: ?>
          <ol>
            <?php foreach (array_slice($rateBandRows, 0, 4) as $b): ?>
              <li>
                <strong>[<?= h($b['status'] === 'hot' ? 'ร้อน' : ($b['status'] === 'cold' ? 'เย็น' : ($b['status'] === 'steady' ? 'นิ่ง' : 'ยังไม่มีข้อมูล'))) ?>]</strong>
                <?= h($b['bandLabel']) ?>
                <div class="muted">คะแนน <?= (int)$b['score'] ?>/100 · n=<?= (int)$b['samples'] ?> · CTR ~<?= h((string)round($b['avgCtr'] * 100, 1)) ?>%</div>
                <div class="muted"><?= h($b['tip']) ?></div>
              </li>
            <?php endforeach; ?>
          </ol>
        <?php endif; ?>
        <?php if ($commissionBandFitLab['suggestions']): ?>
          <p class="muted" style="margin-top:0.75rem"><strong>คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)</strong></p>
          <ul>
            <?php foreach (array_slice($commissionBandFitLab['suggestions'], 0, 4) as $s): ?>
              <li><?= h($s['productName']) ?>: <?= h($s['currentLabel']) ?> → <?= h($s['suggestedLabel']) ?> — <?= h($s['reason']) ?></li>
            <?php endforeach; ?>
          </ul>
        <?php endif; ?>
        <ul>
          <?php foreach (array_slice($commissionBandFitLab['actions'], 0, 3) as $a): ?>
            <li><strong><?= h($a['title']) ?></strong> — <?= h($a['detail']) ?></li>
          <?php endforeach; ?>
        </ul>
        <div class="actions">
          <a class="btn" href="api.php?action=export&format=md&scope=commission-band">Export Commission Band Lab (.md)</a>
          <a class="btn" href="?page=results">ไปกรอกผล</a>
        </div>
        <p class="note"><?= h($commissionBandFitLab['disclaimer']) ?></p>
      </section>

      <section class="card fade-up">
        <h2>Pain Clarity Lab</h2>
        <p class="muted"><?= h($painClarityFitLab['summary']) ?></p>
        <p class="muted">เกรด <?= h($painClarityFitLab['grade']) ?> · <?= (int)$painClarityFitLab['score'] ?>/100 · หน้าต่าง <?= (int)$painClarityFitLab['windowDays'] ?> วัน</p>
        <p><?= h($painClarityFitLab['mixTip']) ?></p>
        <div class="stats" style="margin-top:0.75rem">
          <article><p>มีเมตริก</p><strong><?= (int)$painClarityFitLab['counts']['postsWithMetrics'] ?></strong></article>
          <article><p>ช่วงมีข้อมูล</p><strong><?= (int)$painClarityFitLab['counts']['bandsWithData'] ?></strong></article>
          <article><p>ร้อน</p><strong><?= (int)$painClarityFitLab['counts']['hot'] ?></strong></article>
          <article><p>คำแนะนำ</p><strong><?= (int)$painClarityFitLab['counts']['suggestions'] ?></strong></article>
        </div>
        <?php
          $painBandRows = array_values(array_filter($painClarityFitLab['bands'], fn($b) => ($b['samples'] ?? 0) > 0));
          if (!$painBandRows): ?>
          <p class="muted">ยังไม่มีเมตริกรายระดับ pain — โพสต์มือแล้วกรอกผลที่ Results</p>
        <?php else: ?>
          <ol>
            <?php foreach (array_slice($painBandRows, 0, 4) as $b): ?>
              <li>
                <strong>[<?= h($b['status'] === 'hot' ? 'ร้อน' : ($b['status'] === 'cold' ? 'เย็น' : ($b['status'] === 'steady' ? 'นิ่ง' : 'ยังไม่มีข้อมูล'))) ?>]</strong>
                <?= h($b['bandLabel']) ?>
                <div class="muted">คะแนน <?= (int)$b['score'] ?>/100 · n=<?= (int)$b['samples'] ?> · CTR ~<?= h((string)round($b['avgCtr'] * 100, 1)) ?>%</div>
                <div class="muted"><?= h($b['tip']) ?></div>
              </li>
            <?php endforeach; ?>
          </ol>
        <?php endif; ?>
        <?php if ($painClarityFitLab['suggestions']): ?>
          <p class="muted" style="margin-top:0.75rem"><strong>คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)</strong></p>
          <ul>
            <?php foreach (array_slice($painClarityFitLab['suggestions'], 0, 4) as $s): ?>
              <li><?= h($s['productName']) ?>: <?= h($s['currentLabel']) ?> → <?= h($s['suggestedLabel']) ?> — <?= h($s['reason']) ?></li>
            <?php endforeach; ?>
          </ul>
        <?php endif; ?>
        <ul>
          <?php foreach (array_slice($painClarityFitLab['actions'], 0, 3) as $a): ?>
            <li><strong><?= h($a['title']) ?></strong> — <?= h($a['detail']) ?></li>
          <?php endforeach; ?>
        </ul>
        <div class="actions">
          <a class="btn" href="api.php?action=export&format=md&scope=pain-clarity">Export Pain Clarity Lab (.md)</a>
          <a class="btn" href="api.php?action=export&format=md&scope=video-ease">Export Video Ease Lab (.md)</a>
          <a class="btn" href="api.php?action=export&format=md&scope=seasonal-fit">Export Seasonal Fit Lab (.md)</a>
          <a class="btn" href="api.php?action=export&format=md&scope=audience-fit">Export Audience Fit Lab (.md)</a>
          <a class="btn" href="api.php?action=export&format=md&scope=hook-fit">Export Hook Fit Lab (.md)</a>
          <a class="btn" href="api.php?action=export&format=md&scope=cta-fit">Export CTA Fit Lab (.md)</a>
          <a class="btn" href="?page=results">ไปกรอกผล</a>
        </div>
        <p class="note"><?= h($painClarityFitLab['disclaimer']) ?></p>
      </section>

      <section class="card fade-up">
        <h2>Video Ease Lab</h2>
        <p class="muted"><?= h($videoEaseFitLab['summary']) ?></p>
        <p class="muted">เกรด <?= h($videoEaseFitLab['grade']) ?> · <?= (int)$videoEaseFitLab['score'] ?>/100 · หน้าต่าง <?= (int)$videoEaseFitLab['windowDays'] ?> วัน</p>
        <p><?= h($videoEaseFitLab['mixTip']) ?></p>
        <div class="stats" style="margin-top:0.75rem">
          <article><p>มีเมตริก</p><strong><?= (int)$videoEaseFitLab['counts']['postsWithMetrics'] ?></strong></article>
          <article><p>ช่วงมีข้อมูล</p><strong><?= (int)$videoEaseFitLab['counts']['bandsWithData'] ?></strong></article>
          <article><p>ร้อน</p><strong><?= (int)$videoEaseFitLab['counts']['hot'] ?></strong></article>
          <article><p>คำแนะนำ</p><strong><?= (int)$videoEaseFitLab['counts']['suggestions'] ?></strong></article>
        </div>
        <?php
          $videoEaseBandRows = array_values(array_filter($videoEaseFitLab['bands'], fn($b) => ($b['samples'] ?? 0) > 0));
          if (!$videoEaseBandRows): ?>
          <p class="muted">ยังไม่มีเมตริกรายระดับความง่ายวิดีโอ — โพสต์มือแล้วกรอกผลที่ Results</p>
        <?php else: ?>
          <ol>
            <?php foreach (array_slice($videoEaseBandRows, 0, 4) as $b): ?>
              <li>
                <strong>[<?= h($b['status'] === 'hot' ? 'ร้อน' : ($b['status'] === 'cold' ? 'เย็น' : ($b['status'] === 'steady' ? 'นิ่ง' : 'ยังไม่มีข้อมูล'))) ?>]</strong>
                <?= h($b['bandLabel']) ?>
                <div class="muted">คะแนน <?= (int)$b['score'] ?>/100 · n=<?= (int)$b['samples'] ?> · CTR ~<?= h((string)round($b['avgCtr'] * 100, 1)) ?>%</div>
                <div class="muted"><?= h($b['tip']) ?></div>
              </li>
            <?php endforeach; ?>
          </ol>
        <?php endif; ?>
        <?php if ($videoEaseFitLab['suggestions']): ?>
          <p class="muted" style="margin-top:0.75rem"><strong>คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)</strong></p>
          <ul>
            <?php foreach (array_slice($videoEaseFitLab['suggestions'], 0, 4) as $s): ?>
              <li><?= h($s['productName']) ?>: <?= h($s['currentLabel']) ?> → <?= h($s['suggestedLabel']) ?> — <?= h($s['reason']) ?></li>
            <?php endforeach; ?>
          </ul>
        <?php endif; ?>
        <ul>
          <?php foreach (array_slice($videoEaseFitLab['actions'], 0, 3) as $a): ?>
            <li><strong><?= h($a['title']) ?></strong> — <?= h($a['detail']) ?></li>
          <?php endforeach; ?>
        </ul>
        <div class="actions">
          <a class="btn" href="api.php?action=export&format=md&scope=video-ease">Export Video Ease Lab (.md)</a>
          <a class="btn" href="?page=results">ไปกรอกผล</a>
        </div>
        <p class="note"><?= h($videoEaseFitLab['disclaimer']) ?></p>
      </section>

      <section class="card fade-up">
        <h2>Seasonal Fit Lab</h2>
        <p class="muted"><?= h($seasonalFitLab['summary']) ?></p>
        <p class="muted">เกรด <?= h($seasonalFitLab['grade']) ?> · <?= (int)$seasonalFitLab['score'] ?>/100 · หน้าต่าง <?= (int)$seasonalFitLab['windowDays'] ?> วัน · ปฏิทิน <?= h($seasonalFitLab['seasonLabel']) ?></p>
        <p><?= h($seasonalFitLab['mixTip']) ?></p>
        <div class="stats" style="margin-top:0.75rem">
          <article><p>มีเมตริก</p><strong><?= (int)$seasonalFitLab['counts']['postsWithMetrics'] ?></strong></article>
          <article><p>ช่วงมีข้อมูล</p><strong><?= (int)$seasonalFitLab['counts']['bandsWithData'] ?></strong></article>
          <article><p>ร้อน</p><strong><?= (int)$seasonalFitLab['counts']['hot'] ?></strong></article>
          <article><p>คำแนะนำ</p><strong><?= (int)$seasonalFitLab['counts']['suggestions'] ?></strong></article>
        </div>
        <?php
          $seasonalBandRows = array_values(array_filter($seasonalFitLab['bands'], fn($b) => ($b['samples'] ?? 0) > 0));
          if (!$seasonalBandRows): ?>
          <p class="muted">ยังไม่มีเมตริกรายระดับซีซัน — โพสต์มือแล้วกรอกผลที่ Results</p>
        <?php else: ?>
          <ol>
            <?php foreach (array_slice($seasonalBandRows, 0, 4) as $b): ?>
              <li>
                <strong>[<?= h($b['status'] === 'hot' ? 'ร้อน' : ($b['status'] === 'cold' ? 'เย็น' : ($b['status'] === 'steady' ? 'นิ่ง' : 'ยังไม่มีข้อมูล'))) ?>]</strong>
                <?= h($b['bandLabel']) ?>
                <div class="muted">คะแนน <?= (int)$b['score'] ?>/100 · n=<?= (int)$b['samples'] ?> · CTR ~<?= h((string)round($b['avgCtr'] * 100, 1)) ?>%</div>
                <div class="muted"><?= h($b['tip']) ?></div>
              </li>
            <?php endforeach; ?>
          </ol>
        <?php endif; ?>
        <?php if ($seasonalFitLab['suggestions']): ?>
          <p class="muted" style="margin-top:0.75rem"><strong>คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)</strong></p>
          <ul>
            <?php foreach (array_slice($seasonalFitLab['suggestions'], 0, 4) as $s): ?>
              <li><?= h($s['productName']) ?>: <?= h($s['currentLabel']) ?> → <?= h($s['suggestedLabel']) ?> — <?= h($s['reason']) ?></li>
            <?php endforeach; ?>
          </ul>
        <?php endif; ?>
        <ul>
          <?php foreach (array_slice($seasonalFitLab['actions'], 0, 3) as $a): ?>
            <li><strong><?= h($a['title']) ?></strong> — <?= h($a['detail']) ?></li>
          <?php endforeach; ?>
        </ul>
        <div class="actions">
          <a class="btn" href="api.php?action=export&format=md&scope=seasonal-fit">Export Seasonal Fit Lab (.md)</a>
          <a class="btn" href="?page=results">ไปกรอกผล</a>
        </div>
        <p class="note"><?= h($seasonalFitLab['disclaimer']) ?></p>
      </section>

      <section class="card fade-up">
        <h2>Audience Fit Lab</h2>
        <p class="muted"><?= h($audienceFitLab['summary']) ?></p>
        <p class="muted">เกรด <?= h($audienceFitLab['grade']) ?> · <?= (int)$audienceFitLab['score'] ?>/100 · หน้าต่าง <?= (int)$audienceFitLab['windowDays'] ?> วัน</p>
        <p><?= h($audienceFitLab['mixTip']) ?></p>
        <div class="stats" style="margin-top:0.75rem">
          <article><p>มีเมตริก</p><strong><?= (int)$audienceFitLab['counts']['postsWithMetrics'] ?></strong></article>
          <article><p>ช่วงมีข้อมูล</p><strong><?= (int)$audienceFitLab['counts']['bandsWithData'] ?></strong></article>
          <article><p>ร้อน</p><strong><?= (int)$audienceFitLab['counts']['hot'] ?></strong></article>
          <article><p>คำแนะนำ</p><strong><?= (int)$audienceFitLab['counts']['suggestions'] ?></strong></article>
        </div>
        <?php
          $audienceBandRows = array_values(array_filter($audienceFitLab['bands'], fn($b) => ($b['samples'] ?? 0) > 0));
          if (!$audienceBandRows): ?>
          <p class="muted">ยังไม่มีเมตริกรายระดับกลุ่มเป้าหมาย — โพสต์มือแล้วกรอกผลที่ Results</p>
        <?php else: ?>
          <ol>
            <?php foreach (array_slice($audienceBandRows, 0, 4) as $b): ?>
              <li>
                <strong>[<?= h($b['status'] === 'hot' ? 'ร้อน' : ($b['status'] === 'cold' ? 'เย็น' : ($b['status'] === 'steady' ? 'นิ่ง' : 'ยังไม่มีข้อมูล'))) ?>]</strong>
                <?= h($b['bandLabel']) ?>
                <div class="muted">คะแนน <?= (int)$b['score'] ?>/100 · n=<?= (int)$b['samples'] ?> · CTR ~<?= h((string)round($b['avgCtr'] * 100, 1)) ?>%</div>
                <div class="muted"><?= h($b['tip']) ?></div>
              </li>
            <?php endforeach; ?>
          </ol>
        <?php endif; ?>
        <?php if ($audienceFitLab['suggestions']): ?>
          <p class="muted" style="margin-top:0.75rem"><strong>คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)</strong></p>
          <ul>
            <?php foreach (array_slice($audienceFitLab['suggestions'], 0, 4) as $s): ?>
              <li><?= h($s['productName']) ?>: <?= h($s['currentLabel']) ?> → <?= h($s['suggestedLabel']) ?> — <?= h($s['reason']) ?></li>
            <?php endforeach; ?>
          </ul>
        <?php endif; ?>
        <ul>
          <?php foreach (array_slice($audienceFitLab['actions'], 0, 3) as $a): ?>
            <li><strong><?= h($a['title']) ?></strong> — <?= h($a['detail']) ?></li>
          <?php endforeach; ?>
        </ul>
        <div class="actions">
          <a class="btn" href="api.php?action=export&format=md&scope=audience-fit">Export Audience Fit Lab (.md)</a>
          <a class="btn" href="?page=results">ไปกรอกผล</a>
        </div>
        <p class="note"><?= h($audienceFitLab['disclaimer']) ?></p>
      </section>

      <section class="card fade-up">
        <h2>Hook Fit Lab</h2>
        <p class="muted"><?= h($hookFitLab['summary']) ?></p>
        <p class="muted">เกรด <?= h($hookFitLab['grade']) ?> · <?= (int)$hookFitLab['score'] ?>/100 · หน้าต่าง <?= (int)$hookFitLab['windowDays'] ?> วัน</p>
        <p><?= h($hookFitLab['mixTip']) ?></p>
        <div class="stats" style="margin-top:0.75rem">
          <article><p>มีเมตริก</p><strong><?= (int)$hookFitLab['counts']['postsWithMetrics'] ?></strong></article>
          <article><p>สไตล์มีข้อมูล</p><strong><?= (int)$hookFitLab['counts']['bandsWithData'] ?></strong></article>
          <article><p>ร้อน</p><strong><?= (int)$hookFitLab['counts']['hot'] ?></strong></article>
          <article><p>คำแนะนำ</p><strong><?= (int)$hookFitLab['counts']['suggestions'] ?></strong></article>
        </div>
        <?php
          $hookBandRows = array_values(array_filter($hookFitLab['bands'], fn($b) => ($b['samples'] ?? 0) > 0));
          if (!$hookBandRows): ?>
          <p class="muted">ยังไม่มีเมตริกรายสไตล์ hook — โพสต์มือแล้วกรอกผลที่ Results</p>
        <?php else: ?>
          <ol>
            <?php foreach (array_slice($hookBandRows, 0, 4) as $b): ?>
              <li>
                <strong>[<?= h($b['status'] === 'hot' ? 'ร้อน' : ($b['status'] === 'cold' ? 'เย็น' : ($b['status'] === 'steady' ? 'นิ่ง' : 'ยังไม่มีข้อมูล'))) ?>]</strong>
                <?= h($b['bandLabel']) ?>
                <div class="muted">คะแนน <?= (int)$b['score'] ?>/100 · n=<?= (int)$b['samples'] ?> · CTR ~<?= h((string)round($b['avgCtr'] * 100, 1)) ?>%</div>
                <div class="muted"><?= h($b['tip']) ?></div>
              </li>
            <?php endforeach; ?>
          </ol>
        <?php endif; ?>
        <?php if ($hookFitLab['suggestions']): ?>
          <p class="muted" style="margin-top:0.75rem"><strong>คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)</strong></p>
          <ul>
            <?php foreach (array_slice($hookFitLab['suggestions'], 0, 4) as $s): ?>
              <li><?= h($s['productName']) ?>: <?= h($s['currentLabel']) ?> → <?= h($s['suggestedLabel']) ?> — <?= h($s['reason']) ?></li>
            <?php endforeach; ?>
          </ul>
        <?php endif; ?>
        <ul>
          <?php foreach (array_slice($hookFitLab['actions'], 0, 3) as $a): ?>
            <li><strong><?= h($a['title']) ?></strong> — <?= h($a['detail']) ?></li>
          <?php endforeach; ?>
        </ul>
        <div class="actions">
          <a class="btn" href="api.php?action=export&format=md&scope=hook-fit">Export Hook Fit Lab (.md)</a>
          <a class="btn" href="?page=results">ไปกรอกผล</a>
        </div>
        <p class="note"><?= h($hookFitLab['disclaimer']) ?></p>
      </section>

      <section class="card fade-up">
        <h2>CTA Fit Lab</h2>
        <p class="muted"><?= h($ctaFitLab['summary']) ?></p>
        <p class="muted">เกรด <?= h($ctaFitLab['grade']) ?> · <?= (int)$ctaFitLab['score'] ?>/100 · หน้าต่าง <?= (int)$ctaFitLab['windowDays'] ?> วัน</p>
        <p><?= h($ctaFitLab['mixTip']) ?></p>
        <div class="stats" style="margin-top:0.75rem">
          <article><p>มีเมตริก</p><strong><?= (int)$ctaFitLab['counts']['postsWithMetrics'] ?></strong></article>
          <article><p>สไตล์มีข้อมูล</p><strong><?= (int)$ctaFitLab['counts']['bandsWithData'] ?></strong></article>
          <article><p>ร้อน</p><strong><?= (int)$ctaFitLab['counts']['hot'] ?></strong></article>
          <article><p>คำแนะนำ</p><strong><?= (int)$ctaFitLab['counts']['suggestions'] ?></strong></article>
        </div>
        <?php
          $ctaBandRows = array_values(array_filter($ctaFitLab['bands'], fn($b) => ($b['samples'] ?? 0) > 0));
          if (!$ctaBandRows): ?>
          <p class="muted">ยังไม่มีเมตริกรายสไตล์ CTA — โพสต์มือแล้วกรอกผลที่ Results</p>
        <?php else: ?>
          <ol>
            <?php foreach (array_slice($ctaBandRows, 0, 4) as $b): ?>
              <li>
                <strong>[<?= h($b['status'] === 'hot' ? 'ร้อน' : ($b['status'] === 'cold' ? 'เย็น' : ($b['status'] === 'steady' ? 'นิ่ง' : 'ยังไม่มีข้อมูล'))) ?>]</strong>
                <?= h($b['bandLabel']) ?>
                <div class="muted">คะแนน <?= (int)$b['score'] ?>/100 · n=<?= (int)$b['samples'] ?> · CTR ~<?= h((string)round($b['avgCtr'] * 100, 1)) ?>%</div>
                <div class="muted"><?= h($b['tip']) ?></div>
              </li>
            <?php endforeach; ?>
          </ol>
        <?php endif; ?>
        <?php if ($ctaFitLab['suggestions']): ?>
          <p class="muted" style="margin-top:0.75rem"><strong>คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)</strong></p>
          <ul>
            <?php foreach (array_slice($ctaFitLab['suggestions'], 0, 4) as $s): ?>
              <li><?= h($s['productName']) ?>: <?= h($s['currentLabel']) ?> → <?= h($s['suggestedLabel']) ?> — <?= h($s['reason']) ?></li>
            <?php endforeach; ?>
          </ul>
        <?php endif; ?>
        <ul>
          <?php foreach (array_slice($ctaFitLab['actions'], 0, 3) as $a): ?>
            <li><strong><?= h($a['title']) ?></strong> — <?= h($a['detail']) ?></li>
          <?php endforeach; ?>
        </ul>
        <div class="actions">
          <a class="btn" href="api.php?action=export&format=md&scope=cta-fit">Export CTA Fit Lab (.md)</a>
          <a class="btn" href="?page=results">ไปกรอกผล</a>
        </div>
        <p class="note"><?= h($ctaFitLab['disclaimer']) ?></p>
      </section>

      <section class="card fade-up">
        <h2>Tomorrow Plan · <?= h($tomorrowPlan['tomorrowDate']) ?></h2>
        <p class="muted"><?= h($tomorrowPlan['summary']) ?></p>
        <?php if (!$tomorrowPlan['picks']): ?>
          <p class="muted">ยังไม่มีสินค้าพอจัดแผน — เพิ่มของแล้วรัน Evening</p>
        <?php else: ?>
          <ol>
            <?php foreach ($tomorrowPlan['picks'] as $pick): ?>
              <li>
                <strong><?= h($pick['productName']) ?></strong><?= !empty($pick['filmFirst']) ? ' · ถ่ายก่อน' : '' ?>
                <div class="muted"><?= h($pick['reason']) ?></div>
                <div class="muted">Hook: <?= h($pick['suggestedHook']) ?></div>
                <div class="muted">มุมขาย: <?= h($pick['suggestedAngle']) ?></div>
              </li>
            <?php endforeach; ?>
          </ol>
        <?php endif; ?>
        <?php if (!empty($tomorrowPlan['fatigueWarnings'])): ?>
          <ul>
            <?php foreach ($tomorrowPlan['fatigueWarnings'] as $w): ?>
              <li class="muted">กันสแปม: <?= h($w) ?></li>
            <?php endforeach; ?>
          </ul>
        <?php endif; ?>
        <ul>
          <?php foreach (array_slice($tomorrowPlan['checklist'], 0, 5) as $c): ?>
            <li class="muted"><?= h($c) ?></li>
          <?php endforeach; ?>
        </ul>
        <p class="note"><?= h($tomorrowPlan['disclaimer']) ?></p>
      </section>

      <section class="card fade-up">
        <h2>Winner Playbook</h2>
        <p class="muted"><?= h($winnerPlaybook['summary']) ?></p>
        <p class="muted">หน้าต่าง <?= (int)$winnerPlaybook['windowDays'] ?> วัน · โพสต์ที่มีเมตริก <?= (int)$winnerPlaybook['samplePosts'] ?></p>
        <div class="grid-2">
          <div>
            <h3>Keep doing</h3>
            <?php if (!$winnerPlaybook['keepDoing']): ?>
              <p class="muted">ยังไม่มี keep — กรอกผลหลังโพสต์ก่อน</p>
            <?php else: ?>
              <ol>
                <?php foreach (array_slice($winnerPlaybook['keepDoing'], 0, 3) as $k): ?>
                  <li>
                    <strong><?= h($k['productName']) ?></strong>
                    <div class="muted"><?= h($k['why']) ?></div>
                  </li>
                <?php endforeach; ?>
              </ol>
            <?php endif; ?>
          </div>
          <div>
            <h3>Stop / พัก</h3>
            <?php if (!$winnerPlaybook['stopOrPause']): ?>
              <p class="muted">ยังไม่มีคำแนะนำพัก</p>
            <?php else: ?>
              <ol>
                <?php foreach (array_slice($winnerPlaybook['stopOrPause'], 0, 3) as $s): ?>
                  <li>
                    <strong><?= h($s['productName']) ?></strong>
                    <div class="muted"><?= h($s['why']) ?></div>
                  </li>
                <?php endforeach; ?>
              </ol>
            <?php endif; ?>
          </div>
        </div>
        <ul>
          <?php foreach (array_slice($winnerPlaybook['experiments'], 0, 3) as $e): ?>
            <li class="muted"><strong><?= h($e['title']) ?></strong> — <?= h($e['detail']) ?></li>
          <?php endforeach; ?>
        </ul>
        <div class="actions">
          <a class="btn" href="api.php?action=export&format=md&scope=playbook">Export Playbook (.md)</a>
          <a class="btn" href="?page=results">ไปกรอกผล</a>
        </div>
        <p class="note"><?= h($winnerPlaybook['disclaimer']) ?></p>
      </section>

      <section class="card fade-up">
        <h2>Weekly Review</h2>
        <p class="muted"><?= h($weeklyReview['summary']) ?></p>
        <p class="muted"><?= h($weeklyReview['fromDate']) ?> → <?= h($weeklyReview['date']) ?> · <?= (int)$weeklyReview['windowDays'] ?> วัน · มีเมตริก <?= (int)$weeklyReview['totals']['withMetrics'] ?></p>
        <div class="grid-2">
          <div>
            <p class="muted">ค่าคอมที่กรอก</p>
            <p><strong>฿<?= h(number_format((float)$weeklyReview['totals']['commission'], 0)) ?></strong></p>
            <p class="muted">ออเดอร์ <?= (int)$weeklyReview['totals']['orders'] ?> · CTR ~<?= h(number_format((float)$weeklyReview['totals']['avgCtr'] * 100, 1)) ?>% · รอกรอกผล <?= (int)$weeklyReview['totals']['missingMetrics'] ?></p>
          </div>
          <div>
            <h3>โฟกัสสัปดาห์หน้า</h3>
            <ol>
              <?php foreach (array_slice($weeklyReview['nextWeekFocus'], 0, 3) as $a): ?>
                <li>
                  <strong><?= h($a['title']) ?></strong>
                  <div class="muted"><?= h($a['detail']) ?></div>
                </li>
              <?php endforeach; ?>
            </ol>
          </div>
        </div>
        <div class="grid-2">
          <div>
            <h3>โพสต์เด่น</h3>
            <?php if (!$weeklyReview['topPosts']): ?>
              <p class="muted">ยังไม่มีโพสต์เด่น — กรอกผลหลังโพสต์ก่อน</p>
            <?php else: ?>
              <ol>
                <?php foreach (array_slice($weeklyReview['topPosts'], 0, 3) as $p): ?>
                  <li>
                    <strong><?= h($p['productName']) ?></strong> · <?= h($p['channelLabel']) ?>
                    <div class="muted"><?= h($p['why']) ?></div>
                  </li>
                <?php endforeach; ?>
              </ol>
            <?php endif; ?>
          </div>
          <div>
            <h3>ช่องว่างข้อมูล</h3>
            <ul>
              <?php foreach (array_slice($weeklyReview['dataGaps'], 0, 3) as $g): ?>
                <li class="muted"><?= h($g) ?></li>
              <?php endforeach; ?>
            </ul>
          </div>
        </div>
        <div class="actions">
          <a class="btn" href="api.php?action=export&format=md&scope=weekly-review">Export Weekly Review (.md)</a>
          <a class="btn" href="?page=results">ไปกรอกผล</a>
        </div>
        <p class="note"><?= h($weeklyReview['disclaimer']) ?></p>
      </section>

      <section class="card fade-up">
        <h2>Posting Hygiene</h2>
        <p class="muted"><?= h($postingHygiene['summary']) ?></p>
        <p class="muted">เกรด <?= h($postingHygiene['grade']) ?> · <?= (int)$postingHygiene['score'] ?>/100 · คิววันนี้ <?= (int)$postingHygiene['todayActive'] ?>/<?= (int)$postingHygiene['maxPostsPerDay'] ?> · คูลดาวน์ <?= (int)$postingHygiene['cooldownDays'] ?> วัน</p>
        <div class="grid-2">
          <div>
            <h3>อย่าโพสต์ / ชะลอ</h3>
            <ul>
              <?php foreach (array_slice($postingHygiene['doNotPost'], 0, 4) as $d): ?>
                <li class="muted"><?= h($d) ?></li>
              <?php endforeach; ?>
            </ul>
          </div>
          <div>
            <h3>ทำก่อน</h3>
            <ol>
              <?php foreach (array_slice($postingHygiene['actions'], 0, 3) as $a): ?>
                <li>
                  <strong><?= h($a['title']) ?></strong>
                  <div class="muted"><?= h($a['detail']) ?></div>
                </li>
              <?php endforeach; ?>
            </ol>
          </div>
        </div>
        <div class="actions">
          <a class="btn" href="api.php?action=export&format=md&scope=hygiene">Export Posting Hygiene (.md)</a>
          <a class="btn" href="?page=calendar">ไปตารางโพสต์</a>
        </div>
        <p class="note"><?= h($postingHygiene['disclaimer']) ?></p>
      </section>

      <section class="card">
        <h2>Results Intake</h2>
        <p class="muted"><?= h($resultsIntake['summary']) ?></p>
        <p class="muted">เกรด <?= h($resultsIntake['grade']) ?> · <?= (int)$resultsIntake['score'] ?>/100 · ต้องสนใจ <?= (int)$resultsIntake['counts']['needsAttention'] ?> · ค้าง <?= (int)$resultsIntake['counts']['overdue'] ?> · ครบ <?= (int)$resultsIntake['counts']['complete'] ?></p>
        <div class="grid-2">
          <div>
            <h3>คิวกรอกผล</h3>
            <ol>
              <?php
              $intakeRows = array_values(array_filter($resultsIntake['rows'], fn($r) => ($r['band'] ?? '') !== 'complete'));
              if (!$intakeRows): ?>
                <li class="muted">ไม่มีรายการค้าง — ผลครบหรือยังไม่มีโพสต์</li>
              <?php else: foreach (array_slice($intakeRows, 0, 5) as $r): ?>
                <li>
                  <strong><?= h($r['productName']) ?></strong> · <?= h($r['channelLabel']) ?> · <?= h($r['band']) ?>
                  <div class="muted"><?= h($r['tip']) ?></div>
                </li>
              <?php endforeach; endif; ?>
            </ol>
          </div>
          <div>
            <h3>ทำก่อน</h3>
            <ol>
              <?php foreach (array_slice($resultsIntake['actions'], 0, 3) as $a): ?>
                <li>
                  <strong><?= h($a['title']) ?></strong>
                  <div class="muted"><?= h($a['detail']) ?></div>
                </li>
              <?php endforeach; ?>
            </ol>
          </div>
        </div>
        <div class="actions">
          <a class="btn" href="api.php?action=export&format=md&scope=intake">Export Results Intake (.md)</a>
          <a class="btn" href="?page=results">ไปหน้ากรอกผล</a>
        </div>
        <p class="note"><?= h($resultsIntake['disclaimer']) ?></p>
      </section>

      <section class="card">
        <h2>Creative Performance</h2>
        <p class="muted"><?= h($creativePerformance['summary']) ?></p>
        <p class="muted">เกรด <?= h($creativePerformance['grade']) ?> · <?= (int)$creativePerformance['score'] ?>/100 · มีเมตริก <?= (int)$creativePerformance['counts']['withMetrics'] ?> · มุมเด่น <?= (int)$creativePerformance['counts']['leaders'] ?> · มุมอ่อน <?= (int)$creativePerformance['counts']['weak'] ?></p>
        <div class="grid-2">
          <div>
            <h3>Hook เด่น</h3>
            <ol>
              <?php if (!$creativePerformance['hooks']): ?>
                <li class="muted">ยังไม่มีข้อมูล — กรอกผลโพสต์ก่อน</li>
              <?php else: foreach (array_slice($creativePerformance['hooks'], 0, 4) as $h): ?>
                <li>
                  <strong>#<?= (int)$h['index'] + 1 ?> [<?= h($h['band']) ?>]</strong>
                  “<?= h($h['label']) ?>” · n=<?= (int)$h['samples'] ?>
                  <div class="muted"><?= h($h['tip']) ?></div>
                </li>
              <?php endforeach; endif; ?>
            </ol>
          </div>
          <div>
            <h3>ลองต่อไป / ทำก่อน</h3>
            <ul>
              <?php foreach (array_slice($creativePerformance['tryNext'], 0, 2) as $t): ?>
                <li class="muted"><?= h($t) ?></li>
              <?php endforeach; ?>
            </ul>
            <ol>
              <?php foreach (array_slice($creativePerformance['actions'], 0, 3) as $a): ?>
                <li>
                  <strong><?= h($a['title']) ?></strong>
                  <div class="muted"><?= h($a['detail']) ?></div>
                </li>
              <?php endforeach; ?>
            </ol>
          </div>
        </div>
        <div class="actions">
          <a class="btn" href="api.php?action=export&format=md&scope=creative">Export Creative Performance (.md)</a>
          <a class="btn" href="api.php?action=export&format=md&scope=publish">Export Publish Queue (.md)</a>
          <a class="btn" href="api.php?action=export&format=md&scope=channel-fit">Export Channel Fit Lab (.md)</a>
          <a class="btn" href="api.php?action=export&format=md&scope=category-fit">Export Category Fit Lab (.md)</a>
          <a class="btn" href="api.php?action=export&format=md&scope=price-band">Export Price Band Lab (.md)</a>
          <a class="btn" href="api.php?action=export&format=md&scope=commission-band">Export Commission Band Lab (.md)</a>
          <a class="btn" href="api.php?action=export&format=md&scope=pain-clarity">Export Pain Clarity Lab (.md)</a>
          <a class="btn" href="api.php?action=export&format=md&scope=video-ease">Export Video Ease Lab (.md)</a>
          <a class="btn" href="api.php?action=export&format=md&scope=seasonal-fit">Export Seasonal Fit Lab (.md)</a>
          <a class="btn" href="api.php?action=export&format=md&scope=audience-fit">Export Audience Fit Lab (.md)</a>
          <a class="btn" href="api.php?action=export&format=md&scope=hook-fit">Export Hook Fit Lab (.md)</a>
          <a class="btn" href="api.php?action=export&format=md&scope=cta-fit">Export CTA Fit Lab (.md)</a>
        </div>
        <p class="note"><?= h($creativePerformance['disclaimer']) ?></p>
      </section>

      <section class="card">
        <h2>ควบคุม Automation</h2>
        <div class="actions">
          <button class="btn primary" data-action="automation_morning">Run Morning Automation</button>
          <button class="btn" data-action="automation_evening">Run Evening Automation</button>
          <button class="btn" data-action="generate_drafts">Generate Drafts</button>
          <button class="btn" id="approveSelectedBtn">Approve Selected Drafts</button>
        </div>
        <div class="actions">
          <a class="btn" href="api.php?action=export&format=json">Export JSON</a>
          <a class="btn" href="api.php?action=export&format=csv&scope=products">Export CSV สินค้า</a>
          <a class="btn" href="api.php?action=export&format=csv&scope=schedule">Export CSV ตาราง</a>
          <a class="btn" href="api.php?action=export&format=csv&scope=logs">Export CSV Logs</a>
        </div>
        <p class="note">Morning = scoring + content pack + daily schedule drafts · Evening = result tracking + recommendation</p>
      </section>

      <div class="grid-2">
        <section class="card">
          <h2>Auto Product Import</h2>
          <p class="muted">วาง JSON array หรือ CSV (มีหัวตาราง name,affiliateUrl,price,commissionRate,...)</p>
          <label>รูปแบบ
            <select id="importFormat"><option value="json">JSON</option><option value="csv">CSV</option></select>
          </label>
          <textarea id="importPayload" rows="10" placeholder='[{"name":"","affiliateUrl":"","price":0,"commissionRate":0,"platform":"shopee","category":"","sellingPoints":[],"painPoints":[]}]'></textarea>
          <div class="actions">
            <button class="btn primary" id="importBtn">Import สินค้า</button>
          </div>
        </section>
        <section class="card">
          <h2>Adapters (placeholder)</h2>
          <ul>
            <?php foreach ($adapters as $a): ?>
              <li><?= h($a->name()) ?> · mode <?= h($a->mode()) ?></li>
            <?php endforeach; ?>
            <?php foreach ($futureAdapters as $a): ?>
              <li class="muted"><?= h($a->name()) ?> · รอ API key</li>
            <?php endforeach; ?>
            <li class="muted">Facebook/Meta Publisher · canPublish=false (กันโพสต์อัตโนมัติ)</li>
          </ul>
          <p class="note">ทุก caption มี disclosure affiliate · ห้ามสแปม · วันละ 2–3 draft</p>
        </section>
      </div>

      <section>
        <h2>Draft วันนี้ · เลือกเพื่อ Approve</h2>
        <?php if (!$todaySchedule): ?>
          <div class="card">ยังไม่มี draft — กด Generate Drafts หรือ Morning Automation</div>
        <?php endif; ?>
        <?php foreach ($todaySchedule as $s): $ui = ui_status($s['status']); ?>
          <article class="card schedule-card">
            <label class="row-between">
              <span>
                <?php if (in_array($s['status'], ['draft','generated','pending'], true)): ?>
                  <input type="checkbox" class="draft-check" value="<?= h($s['id']) ?>" />
                <?php endif; ?>
                <?= h($s['suggested_time']) ?> · <?= h(channel_label($s['channel'])) ?> ·
                <span class="badge status-<?= h($ui) ?>"><?= h($ui) ?></span>
              </span>
              <strong><?= h($s['product_name'] ?? '') ?></strong>
            </label>
            <details><summary>ดู caption</summary><pre><?= h($s['caption_preview']) ?></pre></details>
          </article>
        <?php endforeach; ?>
      </section>

      <section>
        <h2>Automation Log</h2>
        <div class="card table-wrap">
          <table class="log-table">
            <thead>
              <tr><th>เวลา</th><th>งาน</th><th>สถานะ</th><th>รายละเอียด</th></tr>
            </thead>
            <tbody>
              <?php if (!$autoLogs): ?>
                <tr><td colspan="4" class="muted">ยังไม่มี log — รัน automation เพื่อเริ่มบันทึก</td></tr>
              <?php endif; ?>
              <?php foreach ($autoLogs as $log): ?>
                <tr>
                  <td><?= h($log['created_at']) ?></td>
                  <td><?= h($log['job_type']) ?></td>
                  <td><span class="badge status-<?= h($log['status']) ?>"><?= h($log['status']) ?></span></td>
                  <td><?= h($log['message']) ?></td>
                </tr>
              <?php endforeach; ?>
            </tbody>
          </table>
        </div>
      </section>

      <?php if ($evening): ?>
        <section class="card">
          <h2>Evening Report / แนะนำวันถัดไป</h2>
          <p><?= h($evening['summary']) ?></p>
          <ul><?php foreach ($evening['recommendations'] as $r): ?><li><?= h($r) ?></li><?php endforeach; ?></ul>
        </section>
      <?php endif; ?>
    <?php endif; ?>
  </main>

  <footer class="footer">
    เลือกดี Affiliate Lab · draft ก่อนโพสต์ · ไม่การันตีรายได้ · MySQL production
  </footer>
  <div id="toast" hidden></div>
  <script src="assets/app.js"></script>
</body>
</html>
