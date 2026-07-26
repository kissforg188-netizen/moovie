<?php
declare(strict_types=1);
require_once __DIR__ . '/lib/app.php';

if (!is_installed()) {
    json_response(['error' => 'ยังไม่ได้ติดตั้ง เปิด /install.php ก่อน'], 503);
}

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
            'disclaimer' => INCOME_DISCLAIMER,
            'date' => $date,
        ]);
    }

    if ($method === 'POST' && $action === 'product_create') {
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
        $id = new_id('prod');
        $now = date('Y-m-d H:i:s');
        $stmt = db()->prepare(<<<SQL
INSERT INTO products (id,name,platform,affiliate_url,price,commission_rate,category,selling_points,pain_points,target_audience,video_ease,seasonal_score,notes,image_url,created_at,updated_at)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
SQL);
        $stmt->execute([
            $id,
            trim((string)($body['name'] ?? '')),
            $body['platform'] ?? 'shopee',
            trim((string)($body['affiliateUrl'] ?? '')),
            (float)($body['price'] ?? 0),
            (float)($body['commissionRate'] ?? 0),
            trim((string)($body['category'] ?? '')),
            json_encode(array_values(array_filter(array_map('trim', explode(',', (string)($body['sellingPoints'] ?? ''))))), JSON_UNESCAPED_UNICODE),
            json_encode(array_values(array_filter(array_map('trim', explode(',', (string)($body['painPoints'] ?? ''))))), JSON_UNESCAPED_UNICODE),
            trim((string)($body['targetAudience'] ?? '')),
            (int)($body['videoEase'] ?? 3),
            (int)($body['seasonalScore'] ?? 3),
            trim((string)($body['notes'] ?? '')),
            '',
            $now, $now,
        ]);
        json_response(['ok' => true, 'id' => $id]);
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
        json_response(['ok' => true, 'pack' => $pack]);
    }

    if ($method === 'POST' && $action === 'approve') {
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
        $id = (string)($body['id'] ?? '');
        $stmt = db()->prepare("UPDATE schedule SET status='approved', approved_at=? WHERE id=? AND status='draft'");
        $stmt->execute([date('Y-m-d H:i:s'), $id]);
        json_response(['ok' => true, 'message' => 'อนุมัติแล้ว — โพสต์ด้วยมือตาม caption (ระบบไม่โพสต์อัตโนมัติ)']);
    }

    if ($method === 'POST' && $action === 'mark_posted') {
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
        $id = (string)($body['id'] ?? '');
        $stmt = db()->prepare("UPDATE schedule SET status='posted', posted_at=? WHERE id=? AND status IN ('approved','draft')");
        $stmt->execute([date('Y-m-d H:i:s'), $id]);
        json_response(['ok' => true]);
    }

    if ($method === 'POST' && $action === 'metrics') {
        $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
        $id = (string)($body['id'] ?? '');
        $stmt = db()->prepare('UPDATE schedule SET views=?, clicks=?, orders_count=?, commission_earned=?, metrics_notes=?, metrics_at=?, status=CASE WHEN status="draft" THEN status ELSE "posted" END WHERE id=?');
        $stmt->execute([
            (int)($body['views'] ?? 0),
            (int)($body['clicks'] ?? 0),
            (int)($body['orders'] ?? 0),
            (float)($body['commissionEarned'] ?? 0),
            trim((string)($body['notes'] ?? '')),
            date('Y-m-d H:i:s'),
            $id,
        ]);
        json_response(['ok' => true]);
    }

    if ($method === 'POST' && $action === 'workflow_morning') {
        json_response(['ok' => true, 'brief' => run_morning_workflow()]);
    }
    if ($method === 'POST' && $action === 'workflow_evening') {
        json_response(['ok' => true, 'brief' => run_evening_workflow()]);
    }

    if ($method === 'GET' && $action === 'export') {
        $format = $_GET['format'] ?? 'json';
        $scope = $_GET['scope'] ?? 'all';
        if ($format === 'csv') {
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="export-'.$scope.'.csv"');
            $out = fopen('php://output', 'w');
            fprintf($out, chr(0xEF).chr(0xBB).chr(0xBF));
            if ($scope === 'schedule') {
                fputcsv($out, ['id','date','time','channel','product_id','status','views','clicks','orders','commission']);
                foreach (db()->query('SELECT * FROM schedule ORDER BY post_date DESC, suggested_time') as $r) {
                    fputcsv($out, [$r['id'],$r['post_date'],$r['suggested_time'],$r['channel'],$r['product_id'],$r['status'],$r['views'],$r['clicks'],$r['orders_count'],$r['commission_earned']]);
                }
            } else {
                fputcsv($out, ['id','name','platform','price','commission_rate','category','affiliate_url']);
                foreach (db()->query('SELECT * FROM products ORDER BY updated_at DESC') as $r) {
                    fputcsv($out, [$r['id'],$r['name'],$r['platform'],$r['price'],$r['commission_rate'],$r['category'],$r['affiliate_url']]);
                }
            }
            fclose($out);
            exit;
        }
        json_response([
            'products' => all_products(),
            'schedule' => db()->query('SELECT * FROM schedule ORDER BY post_date DESC')->fetchAll(),
            'briefs' => db()->query('SELECT * FROM briefs ORDER BY created_at DESC LIMIT 50')->fetchAll(),
            'exportedAt' => date('c'),
            'disclaimer' => INCOME_DISCLAIMER,
        ]);
    }

    json_response(['error' => 'unknown action'], 400);
} catch (Throwable $e) {
    json_response(['error' => $e->getMessage()], 500);
}
