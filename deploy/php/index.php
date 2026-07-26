<?php
declare(strict_types=1);
require_once __DIR__ . '/lib/app.php';

if (!is_installed()) {
    header('Location: install.php');
    exit;
}

$page = $_GET['page'] ?? 'home';
$allowed = ['home','products','calendar','results','guide'];
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
          <button class="btn primary" data-action="workflow_morning">รัน Morning</button>
          <button class="btn" data-action="workflow_evening">รัน Evening</button>
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
      <?php foreach ($todaySchedule as $s): ?>
        <article class="card schedule-card">
          <div class="row-between">
            <div>
              <p class="muted"><?= h($s['suggested_time']) ?> · <?= h(channel_label($s['channel'])) ?> · <span class="badge"><?= h($s['status']) ?></span></p>
              <h3><?= h($s['product_name'] ?? $s['product_id']) ?></h3>
            </div>
            <div class="actions">
              <?php if ($s['status']==='draft'): ?>
                <button class="btn primary small" data-approve="<?= h($s['id']) ?>">Approve</button>
              <?php endif; ?>
              <?php if (in_array($s['status'], ['approved','draft'], true)): ?>
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
    <?php endif; ?>
  </main>

  <footer class="footer">
    เลือกดี Affiliate Lab · draft ก่อนโพสต์ · ไม่การันตีรายได้ · MySQL production
  </footer>
  <div id="toast" hidden></div>
  <script src="assets/app.js"></script>
</body>
</html>
