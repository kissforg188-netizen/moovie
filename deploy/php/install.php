<?php
declare(strict_types=1);
require_once __DIR__ . '/lib/install.php';
require_once __DIR__ . '/lib/app.php';

header('Content-Type: text/html; charset=utf-8');
$msg = '';
$err = '';
try {
    install_schema(true);
    // prepare first morning pack if empty schedule today
    $date = today_iso();
    $stmt = db()->prepare('SELECT COUNT(*) FROM schedule WHERE post_date=?');
    $stmt->execute([$date]);
    if ((int)$stmt->fetchColumn() === 0) {
        run_morning_workflow($date);
    }
    $msg = 'ติดตั้งสำเร็จ: สร้างตาราง MySQL + แคตตาล็อกเริ่มต้น + ตารางโพสต์วันนี้แล้ว';
} catch (Throwable $e) {
    $err = $e->getMessage();
}
?>
<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ติดตั้ง เลือกดี Affiliate Lab</title>
  <link rel="stylesheet" href="assets/app.css" />
</head>
<body>
  <main class="wrap">
    <section class="hero">
      <p class="eyebrow">Production setup</p>
      <h1 class="brand">เลือกดี</h1>
      <p class="lead">ติดตั้งฐานข้อมูล MySQL และข้อมูลเริ่มต้นสำหรับใช้งานจริง</p>
      <?php if ($msg): ?><div class="ok"><?= h($msg) ?></div><?php endif; ?>
      <?php if ($err): ?><div class="err">ผิดพลาด: <?= h($err) ?></div><?php endif; ?>
      <div class="actions">
        <a class="btn primary" href="index.php">เข้าสู่แดชบอร์ด</a>
        <a class="btn" href="guide/">เปิดคู่มือพร้อมรูป</a>
      </div>
      <p class="note"><?= h(INCOME_DISCLAIMER) ?></p>
    </section>
  </main>
</body>
</html>
