<?php
declare(strict_types=1);
require_once __DIR__ . '/lib/automation.php';
require_once __DIR__ . '/lib/adapters.php';

if (!is_installed()) {
    json_response(['error' => 'ยังไม่ได้ติดตั้ง เปิด /install.php ก่อน'], 503);
}

ensure_automation_schema();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? $_POST['action'] ?? '';

try {
    if ($method === 'GET' && $action === 'dashboard') {
        $ranked = rank_products(5);
        $date = today_iso();
        $stmt = db()->prepare('SELECT s.*, p.name AS product_name FROM schedule s LEFT JOIN products p ON p.id=s.product_id WHERE s.post_date=? ORDER BY s.suggested_time');
        $stmt->execute([$date]);
        $schedule = $stmt->fetchAll();
        json_response([
            'products' => all_products(),
            'ranked' => $ranked,
            'todaySchedule' => $schedule,
            'morning' => latest_brief('morning'),
            'evening' => latest_brief('evening'),
            'statusCounts' => automation_status_counts(),
            'adapters' => [
                'active' => array_map(fn($a) => ['name' => $a->name(), 'mode' => $a->mode()], active_affiliate_adapters()),
                'future' => array_map(fn($a) => ['name' => $a->name(), 'mode' => $a->mode()], future_affiliate_adapters()),
                'publishers' => array_map(fn($p) => ['name' => $p->name(), 'canPublish' => $p->canPublish()], social_publishers()),
            ],
            'disclaimer' => INCOME_DISCLAIMER,
            'date' => $date,
        ]);
    }

    if ($method === 'GET' && $action === 'automation_logs') {
        json_response(['logs' => list_automation_logs(80), 'statusCounts' => automation_status_counts()]);
    }

    if ($method === 'POST' && $action === 'product_create') {
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
        $norm = normalize_import_row([
            'name' => $body['name'] ?? '',
            'platform' => $body['platform'] ?? 'shopee',
            'affiliateUrl' => $body['affiliateUrl'] ?? '',
            'price' => $body['price'] ?? 0,
            'commissionRate' => $body['commissionRate'] ?? 0,
            'category' => $body['category'] ?? '',
            'sellingPoints' => $body['sellingPoints'] ?? '',
            'painPoints' => $body['painPoints'] ?? '',
            'targetAudience' => $body['targetAudience'] ?? '',
            'videoEase' => $body['videoEase'] ?? 3,
            'seasonalScore' => $body['seasonalScore'] ?? 3,
            'notes' => $body['notes'] ?? '',
        ]);
        if (!$norm) json_response(['error' => 'ต้องมีชื่อและลิงก์ affiliate'], 400);
        $id = insert_product_row($norm);
        $job = automation_log_start('product_create', 'เพิ่มสินค้าแบบ manual');
        automation_log_finish($job, 'success', 'เพิ่มสินค้า ' . $norm['name'], ['id' => $id]);
        json_response(['ok' => true, 'id' => $id]);
    }

    if ($method === 'POST' && $action === 'import_products') {
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
        $job = automation_log_start('import_products', 'Auto Product Import');
        try {
            $format = strtolower((string)($body['format'] ?? 'json'));
            $raw = (string)($body['payload'] ?? '');
            if ($format === 'csv') {
                $rows = parse_csv_products($raw);
            } else {
                $decoded = json_decode($raw !== '' ? $raw : json_encode($body['items'] ?? []), true);
                if (isset($decoded['products']) && is_array($decoded['products'])) $decoded = $decoded['products'];
                $rows = is_array($decoded) ? $decoded : [];
            }
            $result = import_products_payload($rows);
            automation_log_finish($job, 'success', 'imported ' . $result['imported'] . ' skipped ' . $result['skipped'], $result);
            json_response(['ok' => true, 'jobId' => $job] + $result);
        } catch (Throwable $e) {
            automation_log_finish($job, 'failed', $e->getMessage());
            throw $e;
        }
    }

    if ($method === 'POST' && $action === 'content_generate') {
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
        $product = get_product((string)($body['productId'] ?? ''));
        if (!$product) json_response(['error' => 'ไม่พบสินค้า'], 404);
        $stmt = db()->prepare('SELECT COUNT(*) FROM content_packs WHERE product_id=?');
        $stmt->execute([$product['id']]);
        $variant = (int)$stmt->fetchColumn();
        $pack = generate_content_pack($product, $variant);
        save_content_pack($pack);
        $job = automation_log_start('content_generate', 'สร้าง content pack: ' . $product['name']);
        automation_log_finish($job, 'success', 'สร้าง pack แล้ว', ['packId' => $pack['id'], 'productId' => $product['id']]);
        json_response(['ok' => true, 'pack' => $pack]);
    }

    if ($method === 'POST' && $action === 'approve') {
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
        $id = (string)($body['id'] ?? '');
        $result = approve_selected_drafts([$id]);
        $job = automation_log_start('approve_draft', 'Approve draft ' . $id);
        $ok = ($result['approved'] ?? 0) > 0;
        automation_log_finish($job, $ok ? 'success' : 'failed', $result['message'], $result);
        if (!$ok) {
            json_response(['ok' => false, 'error' => $result['message']] + $result, 400);
        }
        json_response(['ok' => true] + $result);
    }

    if ($method === 'POST' && $action === 'regenerate') {
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
        $id = (string)($body['id'] ?? '');
        $job = automation_log_start('regenerate_draft', 'สร้างแคปชันใหม่ ' . $id);
        $result = regenerate_schedule_draft($id);
        if (!($result['ok'] ?? false)) {
            automation_log_finish($job, 'failed', $result['error'] ?? 'regenerate failed', $result);
            json_response(['ok' => false, 'error' => $result['error'] ?? 'สร้างแคปชันใหม่ไม่สำเร็จ'] + $result, 400);
        }
        automation_log_finish($job, 'success', $result['message'] ?? 'ok', $result);
        json_response(['ok' => true] + $result);
    }

    if ($method === 'POST' && $action === 'approve_selected') {
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
        $ids = $body['ids'] ?? [];
        if (!is_array($ids)) $ids = [];
        $job = automation_log_start('approve_selected', 'Approve selected drafts');
        $result = approve_selected_drafts($ids);
        automation_log_finish($job, 'success', $result['message'], $result);
        json_response(['ok' => true, 'jobId' => $job] + $result);
    }

    if ($method === 'POST' && $action === 'mark_posted') {
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
        $id = (string)($body['id'] ?? '');
        // Approval gate: only approved drafts may be marked posted (never skip Approve)
        $stmt = db()->prepare("UPDATE schedule SET status='posted', posted_at=? WHERE id=? AND status='approved'");
        $stmt->execute([date('Y-m-d H:i:s'), $id]);
        if ($stmt->rowCount() < 1) {
            json_response(['ok' => false, 'error' => 'ต้อง Approve ก่อน จึงจะยืนยันว่าโพสต์แล้วได้'], 400);
        }
        $job = automation_log_start('mark_posted', 'ยืนยันโพสต์ด้วยมือ ' . $id);
        automation_log_finish($job, 'success', 'บันทึกว่าโพสต์แล้ว (manual)', ['id' => $id]);
        json_response(['ok' => true]);
    }

    if ($method === 'POST' && $action === 'metrics') {
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
        $id = (string)($body['id'] ?? '');
        $stmt = db()->prepare('UPDATE schedule SET views=?, clicks=?, orders_count=?, commission_earned=?, metrics_notes=?, metrics_at=?, status=CASE WHEN status IN ("draft","generated","pending") THEN status ELSE "posted" END WHERE id=?');
        $stmt->execute([
            (int)($body['views'] ?? 0),
            (int)($body['clicks'] ?? 0),
            (int)($body['orders'] ?? 0),
            (float)($body['commissionEarned'] ?? 0),
            trim((string)($body['notes'] ?? '')),
            date('Y-m-d H:i:s'),
            $id,
        ]);
        $job = automation_log_start('result_tracking', 'บันทึกผลโพสต์ ' . $id);
        automation_log_finish($job, 'success', 'บันทึก metrics แล้ว', ['id' => $id]);
        json_response(['ok' => true]);
    }

    if ($method === 'POST' && in_array($action, ['workflow_morning', 'automation_morning'], true)) {
        json_response(['ok' => true] + run_full_morning_automation());
    }
    if ($method === 'POST' && in_array($action, ['workflow_evening', 'automation_evening'], true)) {
        json_response(['ok' => true] + run_full_evening_automation());
    }
    if ($method === 'POST' && $action === 'generate_drafts') {
        json_response(['ok' => true] + run_generate_drafts_job());
    }

    if ($method === 'GET' && $action === 'export') {
        $format = $_GET['format'] ?? 'json';
        $scope = $_GET['scope'] ?? 'all';
        $job = automation_log_start('export', 'Export ' . $format . '/' . $scope);
        if ($format === 'csv') {
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="export-'.$scope.'.csv"');
            $out = fopen('php://output', 'w');
            fprintf($out, chr(0xEF).chr(0xBB).chr(0xBF));
            if ($scope === 'schedule') {
                fputcsv($out, ['id','date','time','channel','product_id','status','ui_status','views','clicks','orders','commission']);
                foreach (db()->query('SELECT * FROM schedule ORDER BY post_date DESC, suggested_time') as $r) {
                    fputcsv($out, [$r['id'],$r['post_date'],$r['suggested_time'],$r['channel'],$r['product_id'],$r['status'],ui_status($r['status']),$r['views'],$r['clicks'],$r['orders_count'],$r['commission_earned']]);
                }
            } elseif ($scope === 'logs') {
                fputcsv($out, ['id','job_type','status','message','created_at','finished_at']);
                foreach (list_automation_logs(500) as $r) {
                    fputcsv($out, [$r['id'],$r['job_type'],$r['status'],$r['message'],$r['created_at'],$r['finished_at']]);
                }
            } else {
                fputcsv($out, ['id','name','platform','price','commission_rate','category','affiliate_url']);
                foreach (db()->query('SELECT * FROM products ORDER BY updated_at DESC') as $r) {
                    fputcsv($out, [$r['id'],$r['name'],$r['platform'],$r['price'],$r['commission_rate'],$r['category'],$r['affiliate_url']]);
                }
            }
            fclose($out);
            automation_log_finish($job, 'success', 'exported csv ' . $scope);
            exit;
        }
        $payload = [
            'products' => all_products(),
            'schedule' => db()->query('SELECT * FROM schedule ORDER BY post_date DESC')->fetchAll(),
            'briefs' => db()->query('SELECT * FROM briefs ORDER BY created_at DESC LIMIT 50')->fetchAll(),
            'automationLogs' => list_automation_logs(100),
            'exportedAt' => date('c'),
            'disclaimer' => INCOME_DISCLAIMER,
        ];
        automation_log_finish($job, 'success', 'exported json');
        json_response($payload);
    }

    json_response(['error' => 'unknown action'], 400);
} catch (Throwable $e) {
    json_response(['error' => $e->getMessage()], 500);
}
