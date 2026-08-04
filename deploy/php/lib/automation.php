<?php
declare(strict_types=1);

require_once __DIR__ . '/app.php';

/**
 * Ensure newer tables/columns exist without reinstalling.
 */
function ensure_automation_schema(): void
{
    $pdo = db();
    $pdo->exec(<<<SQL
CREATE TABLE IF NOT EXISTS automation_logs (
  id VARCHAR(64) PRIMARY KEY,
  job_type VARCHAR(64) NOT NULL,
  status ENUM('pending','running','success','failed') NOT NULL DEFAULT 'pending',
  message TEXT NOT NULL,
  meta LONGTEXT NULL,
  created_at DATETIME NOT NULL,
  finished_at DATETIME NULL,
  INDEX (created_at),
  INDEX (job_type),
  INDEX (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

    // Expand schedule status safely if needed
    try {
        $pdo->exec("ALTER TABLE schedule MODIFY status ENUM('pending','draft','generated','approved','posted','skipped','failed') NOT NULL DEFAULT 'draft'");
    } catch (Throwable $e) {
        // ignore if already compatible / no privilege differences
    }
}

function automation_log_start(string $jobType, string $message, array $meta = []): string
{
    ensure_automation_schema();
    $id = new_id('job');
    $stmt = db()->prepare('INSERT INTO automation_logs (id,job_type,status,message,meta,created_at) VALUES (?,?,?,?,?,?)');
    $stmt->execute([
        $id,
        $jobType,
        'running',
        $message,
        json_encode($meta, JSON_UNESCAPED_UNICODE),
        date('Y-m-d H:i:s'),
    ]);
    return $id;
}

function automation_log_finish(string $id, string $status, string $message, array $meta = []): void
{
    $stmt = db()->prepare('UPDATE automation_logs SET status=?, message=?, meta=?, finished_at=? WHERE id=?');
    $stmt->execute([
        $status,
        $message,
        json_encode($meta, JSON_UNESCAPED_UNICODE),
        date('Y-m-d H:i:s'),
        $id,
    ]);
}

function list_automation_logs(int $limit = 50): array
{
    ensure_automation_schema();
    $limit = max(1, min(200, $limit));
    return db()->query("SELECT * FROM automation_logs ORDER BY created_at DESC LIMIT {$limit}")->fetchAll();
}

function ui_status(string $status): string
{
    return match ($status) {
        'draft', 'generated' => 'generated',
        'pending' => 'pending',
        'approved' => 'approved',
        'posted' => 'posted',
        'failed' => 'failed',
        'skipped' => 'skipped',
        default => $status,
    };
}

function normalize_import_row(array $row): ?array
{
    $name = trim((string)($row['name'] ?? $row['ชื่อ'] ?? ''));
    $url = trim((string)($row['affiliateUrl'] ?? $row['affiliate_url'] ?? $row['url'] ?? $row['ลิงก์'] ?? ''));
    if ($name === '' || $url === '') {
        return null;
    }
    $platform = strtolower(trim((string)($row['platform'] ?? $row['แพลตฟอร์ม'] ?? 'shopee')));
    if (!in_array($platform, ['shopee', 'tiktok_shop', 'facebook'], true)) {
        if (str_contains($platform, 'tiktok')) $platform = 'tiktok_shop';
        elseif (str_contains($platform, 'face')) $platform = 'facebook';
        else $platform = 'shopee';
    }

    $selling = $row['sellingPoints'] ?? $row['selling_points'] ?? $row['จุดขาย'] ?? [];
    $pains = $row['painPoints'] ?? $row['pain_points'] ?? $row['pain'] ?? [];
    if (is_string($selling)) $selling = array_values(array_filter(array_map('trim', explode(',', $selling))));
    if (is_string($pains)) $pains = array_values(array_filter(array_map('trim', explode(',', $pains))));
    if (!is_array($selling)) $selling = [];
    if (!is_array($pains)) $pains = [];

    return [
        'name' => $name,
        'platform' => $platform,
        'affiliateUrl' => $url,
        'price' => (float)($row['price'] ?? $row['ราคา'] ?? 0),
        'commissionRate' => (float)($row['commissionRate'] ?? $row['commission_rate'] ?? $row['คอม'] ?? 0),
        'category' => trim((string)($row['category'] ?? $row['หมวด'] ?? 'ทั่วไป')),
        'sellingPoints' => $selling ?: ['ใช้งานง่าย'],
        'painPoints' => $pains ?: ['ปัญหาจุกจิกในชีวิตประจำวัน'],
        'targetAudience' => trim((string)($row['targetAudience'] ?? $row['target_audience'] ?? $row['กลุ่มเป้าหมาย'] ?? 'ผู้ใช้ทั่วไป')),
        'videoEase' => (int)($row['videoEase'] ?? $row['video_ease'] ?? 3),
        'seasonalScore' => (int)($row['seasonalScore'] ?? $row['seasonal_score'] ?? 3),
        'notes' => trim((string)($row['notes'] ?? $row['โน้ต'] ?? 'imported')),
        'imageUrl' => trim((string)($row['imageUrl'] ?? $row['image_url'] ?? '')),
    ];
}

function insert_product_row(array $data): string
{
    $id = new_id('prod');
    $now = date('Y-m-d H:i:s');
    $stmt = db()->prepare(<<<SQL
INSERT INTO products
(id,name,platform,affiliate_url,price,commission_rate,category,selling_points,pain_points,target_audience,video_ease,seasonal_score,notes,image_url,created_at,updated_at)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
SQL);
    $stmt->execute([
        $id,
        $data['name'],
        $data['platform'],
        $data['affiliateUrl'],
        $data['price'],
        $data['commissionRate'],
        $data['category'],
        json_encode(array_values($data['sellingPoints']), JSON_UNESCAPED_UNICODE),
        json_encode(array_values($data['painPoints']), JSON_UNESCAPED_UNICODE),
        $data['targetAudience'],
        max(1, min(5, $data['videoEase'])),
        max(1, min(5, $data['seasonalScore'])),
        $data['notes'],
        $data['imageUrl'],
        $now,
        $now,
    ]);
    return $id;
}

function import_products_payload(array $rows): array
{
    $imported = [];
    $skipped = 0;
    foreach ($rows as $row) {
        if (!is_array($row)) {
            $skipped++;
            continue;
        }
        $norm = normalize_import_row($row);
        if (!$norm) {
            $skipped++;
            continue;
        }
        $imported[] = insert_product_row($norm);
    }
    return ['imported' => count($imported), 'ids' => $imported, 'skipped' => $skipped];
}

function parse_csv_products(string $csv): array
{
    $lines = preg_split("/\r\n|\n|\r/", trim($csv)) ?: [];
    if (count($lines) < 2) return [];
    $headers = str_getcsv(array_shift($lines));
    $headers = array_map(fn($h) => trim((string)$h), $headers);
    $out = [];
    foreach ($lines as $line) {
        if (trim($line) === '') continue;
        $cols = str_getcsv($line);
        $row = [];
        foreach ($headers as $i => $h) {
            $row[$h] = $cols[$i] ?? '';
        }
        $out[] = $row;
    }
    return $out;
}

/**
 * Generate content packs for top ranked products (or all if empty).
 */
function auto_generate_content_packs(int $limit = 5): array
{
    $ranked = rank_products($limit);
    $packs = [];
    foreach ($ranked as $i => $item) {
        $variant = (int)date('Ymd') + $i;
        $pack = generate_content_pack($item['product'], $variant);
        save_content_pack($pack);
        $packs[] = $pack;
    }
    return $packs;
}

/**
 * Create daily draft schedule only (no posting).
 */
function auto_generate_drafts(?string $date = null): array
{
    $date = $date ?: today_iso();
    $ranked = rank_products(5);
    $pairs = [];
    foreach ($ranked as $i => $item) {
        $pack = latest_pack($item['product']['id']);
        if (!$pack || substr((string)$pack['createdAt'], 0, 10) !== $date) {
            $pack = generate_content_pack($item['product'], (int)date('Ymd') + $i);
            save_content_pack($pack);
        }
        $pairs[] = ['product' => $item['product'], 'pack' => $pack];
    }
    $posts = build_daily_schedule($date, $pairs, 3);
    foreach ($posts as &$p) {
        // store as draft/generated — never posted
        $p['status'] = 'draft';
        save_schedule_post($p);
        // best-effort mark generated label if column allows
        try {
            db()->prepare("UPDATE schedule SET status='generated' WHERE id=?")->execute([$p['id']]);
            $p['status'] = 'generated';
        } catch (Throwable $e) {
            // keep draft
        }
    }
    unset($p);
    return $posts;
}

function approve_selected_drafts(array $ids): array
{
    $ok = 0;
    $stmt = db()->prepare("UPDATE schedule SET status='approved', approved_at=? WHERE id=? AND status IN ('draft','generated','pending')");
    foreach ($ids as $id) {
        $id = trim((string)$id);
        if ($id === '') continue;
        $stmt->execute([date('Y-m-d H:i:s'), $id]);
        $ok += $stmt->rowCount() > 0 ? 1 : 0;
    }
    return [
        'approved' => $ok,
        'message' => 'อนุมัติแล้ว ' . $ok . ' ชิ้น — โพสต์ด้วยมือเท่านั้น ระบบไม่โพสต์อัตโนมัติ',
    ];
}

function run_full_morning_automation(): array
{
    $job = automation_log_start('morning', 'เริ่ม Morning Automation: score → content → schedule drafts');
    try {
        $ranked = rank_products(5);
        $brief = run_morning_workflow();
        $meta = [
            'steps' => [
                'auto_product_scoring',
                'auto_caption_generator',
                'auto_tiktok_script',
                'auto_facebook_post',
                'auto_hashtag',
                'auto_daily_schedule',
            ],
            'ranked' => array_map(fn($r) => [
                'id' => $r['product']['id'],
                'name' => $r['product']['name'],
                'score' => $r['score']['total'],
            ], $ranked),
            'contentPackIds' => $brief['contentPackIds'] ?? [],
            'scheduleIds' => $brief['scheduleIds'] ?? [],
            'disclosure' => AFFILIATE_DISCLOSURE,
            'noAutoPost' => true,
        ];
        automation_log_finish($job, 'success', $brief['summary'], $meta);
        return ['jobId' => $job, 'brief' => $brief, 'meta' => $meta];
    } catch (Throwable $e) {
        automation_log_finish($job, 'failed', $e->getMessage());
        throw $e;
    }
}

function run_full_evening_automation(): array
{
    $job = automation_log_start('evening', 'เริ่ม Evening Automation');
    try {
        $brief = run_evening_workflow();
        $analysis = analyze_posted(today_iso());
        $meta = [
            'summary' => $brief['summary'],
            'recommendations' => $brief['recommendations'],
            'winners' => array_map(fn($w) => [
                'product' => $w['productName'],
                'channel' => $w['post']['channel'] ?? '',
                'score' => $w['score'],
            ], $analysis['winners']),
            'disclaimer' => INCOME_DISCLAIMER,
        ];
        automation_log_finish($job, 'success', $brief['summary'], $meta);
        return ['jobId' => $job, 'brief' => $brief, 'meta' => $meta];
    } catch (Throwable $e) {
        automation_log_finish($job, 'failed', $e->getMessage());
        throw $e;
    }
}

function run_generate_drafts_job(): array
{
    $job = automation_log_start('generate_drafts', 'สร้าง draft อัตโนมัติ');
    try {
        $posts = auto_generate_drafts();
        $meta = [
            'count' => count($posts),
            'ids' => array_column($posts, 'id'),
            'note' => 'draft only — requires human approve before posting',
        ];
        automation_log_finish($job, 'success', 'สร้าง draft ' . count($posts) . ' ชิ้น', $meta);
        return ['jobId' => $job, 'posts' => $posts, 'meta' => $meta];
    } catch (Throwable $e) {
        automation_log_finish($job, 'failed', $e->getMessage());
        throw $e;
    }
}

function automation_status_counts(): array
{
    $rows = db()->query('SELECT status, COUNT(*) AS c FROM schedule GROUP BY status')->fetchAll();
    $map = [
        'pending' => 0,
        'generated' => 0,
        'approved' => 0,
        'posted' => 0,
        'failed' => 0,
    ];
    foreach ($rows as $r) {
        $key = ui_status((string)$r['status']);
        if (!isset($map[$key])) $map[$key] = 0;
        $map[$key] += (int)$r['c'];
    }
    // draft counts as generated
    return $map;
}
