<?php
declare(strict_types=1);

require_once __DIR__ . '/../config.php';

function decode_list($json): array
{
    if (is_array($json)) return $json;
    $d = json_decode((string) $json, true);
    return is_array($d) ? $d : [];
}

function map_product(array $row): array
{
    return [
        'id' => $row['id'],
        'name' => $row['name'],
        'platform' => $row['platform'],
        'affiliateUrl' => $row['affiliate_url'],
        'price' => (float) $row['price'],
        'commissionRate' => (float) $row['commission_rate'],
        'category' => $row['category'],
        'sellingPoints' => decode_list($row['selling_points']),
        'painPoints' => decode_list($row['pain_points']),
        'targetAudience' => $row['target_audience'],
        'videoEase' => (int) $row['video_ease'],
        'seasonalScore' => (int) $row['seasonal_score'],
        'notes' => $row['notes'] ?? '',
        'imageUrl' => $row['image_url'] ?? '',
        'createdAt' => $row['created_at'],
        'updatedAt' => $row['updated_at'],
    ];
}

function all_products(): array
{
    $rows = db()->query('SELECT * FROM products ORDER BY updated_at DESC')->fetchAll();
    return array_map('map_product', $rows);
}

function get_product(string $id): ?array
{
    $stmt = db()->prepare('SELECT * FROM products WHERE id=?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ? map_product($row) : null;
}

function impulse_price_score(float $price): float
{
    if ($price <= 0) return 0;
    if ($price >= 99 && $price <= 399) return 100;
    if ($price > 399 && $price <= 799) return 80;
    if ($price > 799 && $price <= 1499) return 55;
    if ($price < 99) return 70;
    return 30;
}

function commission_score(float $rate): float
{
    if ($rate >= 20) return 100;
    if ($rate >= 12) return 85;
    if ($rate >= 8) return 70;
    if ($rate >= 5) return 55;
    if ($rate >= 2) return 35;
    return 15;
}

function pain_clarity_score(array $p): float
{
    $pains = array_filter($p['painPoints'], fn($x) => trim((string)$x) !== '');
    $sells = array_filter($p['sellingPoints'], fn($x) => trim((string)$x) !== '');
    $painPart = min(count($pains), 3) * 22;
    $sellPart = min(count($sells), 3) * 10;
    $audience = strlen(trim($p['targetAudience'])) > 8 ? 14 : 0;
    return min(100, $painPart + $sellPart + $audience);
}

function scale_1_to_5(int $v): float
{
    $c = max(1, min(5, $v ?: 1));
    return (($c - 1) / 4) * 100;
}

function performance_boost(string $productId): float
{
    $stmt = db()->prepare("SELECT views, clicks, orders_count, commission_earned FROM schedule WHERE product_id=? AND status='posted' AND metrics_at IS NOT NULL");
    $stmt->execute([$productId]);
    $posts = $stmt->fetchAll();
    if (!$posts) return 50;
    $total = 0;
    foreach ($posts as $m) {
        $views = max((int)$m['views'], 0);
        $clicks = max((int)$m['clicks'], 0);
        $orders = max((int)$m['orders_count'], 0);
        $commission = max((float)$m['commission_earned'], 0);
        $ctr = $views > 0 ? $clicks / $views : 0;
        $cvr = $clicks > 0 ? $orders / $clicks : 0;
        $total += min($ctr * 100, 40) + min($cvr * 100, 30) + min($commission / 50, 30);
    }
    return max(0, min(100, $total / count($posts)));
}

function score_product(array $p): array
{
    $commission = commission_score($p['commissionRate']);
    $impulse = impulse_price_score($p['price']);
    $pain = pain_clarity_score($p);
    $video = scale_1_to_5($p['videoEase']);
    $seasonal = scale_1_to_5($p['seasonalScore']);
    $hist = performance_boost($p['id']);
    $base = $commission * 0.25 + $impulse * 0.2 + $pain * 0.25 + $video * 0.15 + $seasonal * 0.15;
    $total = $base * 0.85 + $hist * 0.15;
    return [
        'commission' => (int) round($commission),
        'impulsePrice' => (int) round($impulse),
        'painClarity' => (int) round($pain),
        'videoEase' => (int) round($video),
        'seasonal' => (int) round($seasonal),
        'total' => round($total, 1),
    ];
}

function rank_products(int $limit = 5): array
{
    $scored = [];
    foreach (all_products() as $p) {
        // Skip paused products when active column/flag exists
        if (array_key_exists('active', $p) && $p['active'] === false) {
            continue;
        }
        $scored[] = ['product' => $p, 'score' => score_product($p)];
    }
    usort($scored, fn($a, $b) => $b['score']['total'] <=> $a['score']['total']);
    if (count($scored) <= $limit) {
        return $scored;
    }

    $picked = [];
    $pickedIds = [];
    $platformCount = [];
    $categoryCount = [];

    foreach ($scored as $item) {
        if (count($picked) >= $limit) break;
        $platform = (string) $item['product']['platform'];
        $cat = strtolower(trim((string) ($item['product']['category'] ?? 'ทั่วไป'))) ?: 'ทั่วไป';
        $pCount = $platformCount[$platform] ?? 0;
        $cCount = $categoryCount[$cat] ?? 0;
        $dominantPlatform = $platformCount ? max($platformCount) : 0;
        $dominantCategory = $categoryCount ? max($categoryCount) : 0;

        if ($pCount >= 3 && $dominantPlatform >= 3) {
            $hasAlt = false;
            foreach ($scored as $s) {
                if (isset($pickedIds[$s['product']['id']])) continue;
                if ($s['product']['platform'] === $platform) continue;
                if ($s['score']['total'] >= $item['score']['total'] * 0.85) {
                    $hasAlt = true;
                    break;
                }
            }
            if ($hasAlt) continue;
        }

        if ($cCount >= 2 && $dominantCategory >= 2) {
            $hasAltCat = false;
            foreach ($scored as $s) {
                if (isset($pickedIds[$s['product']['id']])) continue;
                $otherCat = strtolower(trim((string) ($s['product']['category'] ?? 'ทั่วไป'))) ?: 'ทั่วไป';
                if ($otherCat === $cat) continue;
                if ($s['score']['total'] >= $item['score']['total'] * 0.88) {
                    $hasAltCat = true;
                    break;
                }
            }
            if ($hasAltCat) continue;
        }

        $picked[] = $item;
        $pickedIds[$item['product']['id']] = true;
        $platformCount[$platform] = $pCount + 1;
        $categoryCount[$cat] = $cCount + 1;
    }

    foreach ($scored as $item) {
        if (count($picked) >= $limit) break;
        if (!isset($pickedIds[$item['product']['id']])) {
            $picked[] = $item;
            $pickedIds[$item['product']['id']] = true;
        }
    }

    return array_slice($picked, 0, $limit);
}

function with_disclosure(string $caption): string
{
    $t = trim($caption);
    if (str_contains($t, AFFILIATE_DISCLOSURE)) return $t;
    return $t . "\n\n" . AFFILIATE_DISCLOSURE;
}

function rotate_arr(array $items, int $offset): array
{
    if (!$items) return $items;
    $n = (($offset % count($items)) + count($items)) % count($items);
    return array_merge(array_slice($items, $n), array_slice($items, 0, $n));
}

function first_pain(array $p): string
{
    return trim((string)($p['painPoints'][0] ?? '')) ?: 'ปัญหาจุกจิกในชีวิตประจำวัน';
}

function first_sell(array $p): string
{
    return trim((string)($p['sellingPoints'][0] ?? '')) ?: 'ใช้งานง่าย ได้ผลจริง';
}

function price_label(float $price): string
{
    return '฿' . number_format($price, 0);
}

function generate_content_pack(array $product, int $variant = 0): array
{
    $pain = first_pain($product);
    $sell = first_sell($product);
    $hooks = rotate_arr([
        "เคยเจอไหม… {$pain}",
        "ถ้ากำลังหาของช่วยเรื่อง{$product['category']} ลองฟังก่อนตัดสินใจ",
        "{$sell} — ราคาประมาณ " . price_label($product['price']),
        "ของชิ้นเล็กที่คน" . ($product['targetAudience'] ?: 'ใช้งานจริง') . "พูดถึงบ่อย",
        'ไม่ต้องซื้อแพงก่อน ลองดูตัวเลือกนี้ก่อนได้',
        "เล่าจากมุมคนใช้จริง: อยากลดเรื่อง{$pain}",
        "สั้น ๆ ตรง ๆ — จุดที่ชอบคือ {$sell}",
    ], $variant);
    $hooks = array_slice($hooks, 0, 5);

    $ctas = rotate_arr([
        'สนใจ dig ต่อได้ที่ลิงก์ในคอมเมนต์/ไบโอ — อ่านรีวิวและสเปกก่อนตัดสินใจนะ',
        'ถ้าเข้าเงื่อนไขใช้งานของคุณ ค่อยกดดูรายละเอียดเพิ่มที่ลิงก์ด้านล่าง',
        'อยากลองเทียบกับของเดิมไหม เปิดลิงก์ไปดูสเปก/รีวิวเพิ่มได้เลย',
        'ไม่เร่งซื้อ — เปิดดูรายละเอียดก่อน แล้วค่อยตัดสินใจเองได้',
    ], $variant);
    $ctas = array_slice($ctas, 0, 3);

    $cat = preg_replace('/\s+/u', '', $product['category']) ?: 'ของใช้';
    $tagsTh = ['#รีวิวของใช้', "#{$cat}", '#แนะนำของดี', '#ช้อปอย่างมีเหตุผล', '#เลือกดี', $product['platform'] === 'shopee' ? '#ShopeeAffiliate' : '#TikTokShop'];
    $tagsEn = ['#AffiliateDisclosure', '#ProductPick', '#HonestReview', '#ShortVideo', '#Thailand'];

    $script = [
        'durationSec' => 25,
        'scenes' => [
            ['time' => '0-3วิ', 'line' => $hooks[0], 'visual' => 'หน้ากล้องใกล้ ๆ น้ำเสียงเป็นกันเอง'],
            ['time' => '3-10วิ', 'line' => "ปัญหาคือ {$pain} เลยไปลองหาของที่ช่วยได้โดยไม่ต้องซื้อแพง", 'visual' => 'โชว์สินค้าชัด + จุดใช้งานจริง'],
            ['time' => '10-20วิ', 'line' => "{$sell} เหมาะกับ" . ($product['targetAudience'] ?: 'คนทั่วไป') . ' ราคาประมาณ ' . price_label($product['price']), 'visual' => 'สาธิตสั้น ไม่โอเวอร์เคลม'],
            ['time' => '20-25วิ', 'line' => $ctas[0], 'visual' => 'ชี้ลิงก์ + disclosure บนจอ'],
        ],
        'voiceover' => $hooks[0] . ' ตัวเลือกนี้ช่วยเรื่อง' . $product['category'] . ": {$sell} ราคาประมาณ " . price_label($product['price']) . ' — ดูสเปกและรีวิวเพิ่มก่อนซื้อได้ ' . AFFILIATE_DISCLOSURE,
    ];

    $fb = implode("\n", [
        $hooks[1], '',
        "วันนี้มาแชร์ตัวเลือกในหมวด {$product['category']} สำหรับ" . ($product['targetAudience'] ?: 'คนที่กำลังหาของอยู่'),
        "จุดที่น่าสนใจ: {$sell}",
        "ช่วยเรื่อง: {$pain}",
        'ราคาประมาณ ' . price_label($product['price']) . ' (ตรวจราคาก่อนซื้อเสมอ)', '',
        $ctas[1], '',
        'ลิงก์: ' . $product['affiliateUrl'], '',
        implode(' ', array_merge(array_slice($tagsTh, 0, 4), array_slice($tagsEn, 0, 2))),
    ]);

    $group = implode("\n", [
        "แชร์ให้เพื่อนในกลุ่มที่กำลังหาของหมวด {$product['category']}", '',
        "บริบท: {$pain}",
        "สิ่งที่น่าลอง: {$sell}",
        'ราคาประมาณ ' . price_label($product['price']) . ' — ไม่การันตีว่าจะเหมาะทุกคน ลองเทียบรีวิวก่อนนะ', '',
        'ถ้าใครใช้ตัวอื่นอยู่ แลกเปลี่ยนประสบการณ์ในคอมเมนต์ได้เลย', '',
        $ctas[2], '',
        'ลิงก์: ' . $product['affiliateUrl'], '',
        'หมายเหตุ: โพสต์นี้ไม่ใช่สแปมโปรโมทแข็ง — แชร์เป็นตัวเลือกให้พิจารณา',
    ]);

    $reels = implode("\n", [
        $hooks[0],
        $sell . ' · ' . price_label($product['price']),
        $ctas[2],
        'ลิงก์ในไบโอ/คอมเมนต์',
        implode(' ', array_merge(array_slice($tagsTh, 0, 3), array_slice($tagsEn, 0, 2))),
    ]);

    $note = $product['videoEase'] >= 4
        ? 'ถ่ายง่าย: โชว์ปัญหา → สาธิต 1 จุด → ปิดด้วยลิงก์+disclosure (เริ่มตัวนี้ก่อน)'
        : ($product['videoEase'] >= 3
            ? 'ถ่ายระดับกลาง: เตรียมฉากใช้งานจริง 1 นาที แล้วตัดเหลือ 20–25 วิ'
            : 'ถ่ายยากกว่าเพื่อน: ใช้ภาพนิ่ง/สไลด์ + พากย์สั้นก่อน');

    return [
        'id' => new_id('pack'),
        'productId' => $product['id'],
        'createdAt' => date('c'),
        'disclosure' => AFFILIATE_DISCLOSURE,
        'hooks' => $hooks,
        'ctas' => $ctas,
        'hashtagsTh' => $tagsTh,
        'hashtagsEn' => $tagsEn,
        'tiktokScript' => $script,
        'facebookCaption' => with_disclosure($fb),
        'facebookGroupCaption' => with_disclosure($group),
        'reelsCaption' => with_disclosure($reels),
        'videoPriorityNote' => $note,
        'variant' => $variant,
    ];
}

function save_content_pack(array $pack): void
{
    $stmt = db()->prepare(<<<SQL
INSERT INTO content_packs
(id,product_id,created_at,disclosure,hooks,ctas,hashtags_th,hashtags_en,tiktok_script,facebook_caption,facebook_group_caption,reels_caption,video_priority_note,variant)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
SQL);
    $stmt->execute([
        $pack['id'], $pack['productId'], date('Y-m-d H:i:s'), $pack['disclosure'],
        json_encode($pack['hooks'], JSON_UNESCAPED_UNICODE),
        json_encode($pack['ctas'], JSON_UNESCAPED_UNICODE),
        json_encode($pack['hashtagsTh'], JSON_UNESCAPED_UNICODE),
        json_encode($pack['hashtagsEn'], JSON_UNESCAPED_UNICODE),
        json_encode($pack['tiktokScript'], JSON_UNESCAPED_UNICODE),
        $pack['facebookCaption'], $pack['facebookGroupCaption'], $pack['reelsCaption'],
        $pack['videoPriorityNote'], $pack['variant'],
    ]);
}

function map_pack(array $row): array
{
    return [
        'id' => $row['id'],
        'productId' => $row['product_id'],
        'createdAt' => $row['created_at'],
        'disclosure' => $row['disclosure'],
        'hooks' => decode_list($row['hooks']),
        'ctas' => decode_list($row['ctas']),
        'hashtagsTh' => decode_list($row['hashtags_th']),
        'hashtagsEn' => decode_list($row['hashtags_en']),
        'tiktokScript' => decode_list($row['tiktok_script']),
        'facebookCaption' => $row['facebook_caption'],
        'facebookGroupCaption' => $row['facebook_group_caption'],
        'reelsCaption' => $row['reels_caption'],
        'videoPriorityNote' => $row['video_priority_note'],
        'variant' => (int) $row['variant'],
    ];
}

function latest_pack(string $productId): ?array
{
    $stmt = db()->prepare('SELECT * FROM content_packs WHERE product_id=? ORDER BY created_at DESC LIMIT 1');
    $stmt->execute([$productId]);
    $row = $stmt->fetch();
    return $row ? map_pack($row) : null;
}

function channel_label(string $ch): string
{
    return match ($ch) {
        'tiktok' => 'TikTok',
        'facebook_post' => 'Facebook Page',
        'facebook_group' => 'Facebook Group',
        'facebook_reels' => 'Facebook Reels',
        default => $ch,
    };
}

function caption_for_channel(array $pack, string $channel, int $hookIndex, int $ctaIndex): string
{
    $hook = $pack['hooks'][$hookIndex] ?? $pack['hooks'][0] ?? '';
    $cta = $pack['ctas'][$ctaIndex] ?? $pack['ctas'][0] ?? '';
    if ($channel === 'tiktok') {
        $vo = $pack['tiktokScript']['voiceover'] ?? '';
        return "{$hook}\n\n{$vo}\n\n{$cta}\n\n{$pack['disclosure']}";
    }
    if ($channel === 'facebook_reels') return $pack['reelsCaption'];
    if ($channel === 'facebook_group') return $pack['facebookGroupCaption'] ?: $pack['facebookCaption'];
    return $pack['facebookCaption'];
}

function get_app_setting(string $key, string $default = ''): string
{
    $stmt = db()->prepare('SELECT setting_value FROM settings WHERE setting_key=?');
    $stmt->execute([$key]);
    $row = $stmt->fetch();
    return $row ? (string)$row['setting_value'] : $default;
}

function cooldown_days(): int
{
    $n = (int) get_app_setting('cooldown_days', '3');
    return max(2, min(7, $n ?: 3));
}

function stale_draft_days(): int
{
    $n = (int) get_app_setting('stale_draft_days', '5');
    return max(3, min(14, $n ?: 5));
}

function max_posts_per_day(): int
{
    $n = (int) get_app_setting('max_posts_per_day', '3');
    return $n === 2 ? 2 : 3;
}

/** Skip leftover drafts older than stale_draft_days (never touches approved/posted). */
function expire_stale_drafts(string $today): int
{
    $days = stale_draft_days();
    $stmt = db()->prepare("UPDATE schedule SET status='skipped' WHERE status='draft' AND post_date < DATE_SUB(?, INTERVAL ? DAY)");
    $stmt->execute([$today, $days]);
    return $stmt->rowCount();
}

function build_daily_schedule(string $date, array $rankedPairs, int $maxPosts = 3, ?int $cooldownDays = null): array
{
    $cooldownDays = $cooldownDays ?? cooldown_days();
    $slots = [
        ['time' => '10:30', 'channel' => 'tiktok'],
        ['time' => '13:00', 'channel' => 'facebook_reels'],
        ['time' => '19:30', 'channel' => 'facebook_post'],
    ];
    $day = (int) substr($date, -2);
    if ($day % 2 === 0) {
        $slots[2]['channel'] = 'facebook_group';
    }

    $pdo = db();
    $usedToday = [];
    $stmt = $pdo->prepare('SELECT product_id, channel FROM schedule WHERE post_date=?');
    $stmt->execute([$date]);
    foreach ($stmt->fetchAll() as $r) {
        $usedToday[$r['product_id'] . ':' . $r['channel']] = true;
    }

    $recent = [];
    $stmt = $pdo->prepare("SELECT product_id, channel FROM schedule WHERE post_date BETWEEN DATE_SUB(?, INTERVAL ? DAY) AND ? AND status <> 'skipped'");
    $stmt->execute([$date, $cooldownDays, $date]);
    foreach ($stmt->fetchAll() as $r) {
        $recent[$r['product_id'] . ':' . $r['channel']] = true;
    }

    $posts = [];
    $slotIndex = 0;
    foreach ($rankedPairs as $pick) {
        if (count($posts) >= $maxPosts) break;
        $assigned = null;
        for ($i = 0; $i < count($slots); $i++) {
            $slot = $slots[($slotIndex + $i) % count($slots)];
            $key = $pick['product']['id'] . ':' . $slot['channel'];
            if (isset($usedToday[$key]) || isset($recent[$key])) continue;
            $assigned = $slot;
            $slotIndex = ($slotIndex + $i + 1) % count($slots);
            break;
        }
        if (!$assigned) continue;
        $hookIndex = (count($posts) + (int)$pick['pack']['variant']) % max(1, count($pick['pack']['hooks']));
        $ctaIndex = (count($posts) + (int)$pick['pack']['variant']) % max(1, count($pick['pack']['ctas']));
        $key = $pick['product']['id'] . ':' . $assigned['channel'];
        $usedToday[$key] = true;
        $recent[$key] = true;
        $posts[] = [
            'id' => new_id('post'),
            'date' => $date,
            'suggestedTime' => $assigned['time'],
            'channel' => $assigned['channel'],
            'productId' => $pick['product']['id'],
            'contentPackId' => $pick['pack']['id'],
            'hookIndex' => $hookIndex,
            'ctaIndex' => $ctaIndex,
            'status' => 'draft',
            'captionPreview' => caption_for_channel($pick['pack'], $assigned['channel'], $hookIndex, $ctaIndex),
        ];
    }
    return $posts;
}

function save_schedule_post(array $post): void
{
    $stmt = db()->prepare(<<<SQL
INSERT INTO schedule
(id,post_date,suggested_time,channel,product_id,content_pack_id,hook_index,cta_index,status,caption_preview)
VALUES (?,?,?,?,?,?,?,?,?,?)
SQL);
    $stmt->execute([
        $post['id'], $post['date'], $post['suggestedTime'], $post['channel'],
        $post['productId'], $post['contentPackId'], $post['hookIndex'], $post['ctaIndex'],
        $post['status'], $post['captionPreview'],
    ]);
}

function run_morning_workflow(?string $date = null): array
{
    $date = $date ?: today_iso();
    $expired = expire_stale_drafts($date);
    $ranked = rank_products(5);
    $pairs = [];
    foreach ($ranked as $i => $item) {
        $existing = latest_pack($item['product']['id']);
        $needFresh = !$existing || substr((string)$existing['createdAt'], 0, 10) !== $date || empty($existing['facebookGroupCaption']);
        if ($needFresh) {
            $variant = (int) preg_replace('/\D/', '', $date) + $i;
            $pack = generate_content_pack($item['product'], $variant);
            save_content_pack($pack);
        } else {
            $pack = $existing;
        }
        $pairs[] = ['product' => $item['product'], 'pack' => $pack];
    }
    $maxPosts = max_posts_per_day();
    $cooldown = cooldown_days();
    $newPosts = build_daily_schedule($date, $pairs, $maxPosts, $cooldown);
    foreach ($newPosts as $p) save_schedule_post($p);

    usort($pairs, fn($a, $b) => $b['product']['videoEase'] <=> $a['product']['videoEase']);
    $videoFirst = $pairs[0] ?? null;
    $recs = [
        $ranked ? 'Top โปรโมตวันนี้: ' . implode(', ', array_map(fn($r) => $r['product']['name'], $ranked)) : 'ยังไม่มีสินค้า',
        $expired > 0 ? "ข้าม draft ค้าง {$expired} ชิ้น (เก่ากว่า " . stale_draft_days() . ' วัน)' : null,
        $videoFirst ? 'ควรทำวิดีโอก่อน: ' . $videoFirst['product']['name'] . ' — ' . $videoFirst['pack']['videoPriorityNote'] : 'ยังไม่มีคิววิดีโอ',
        'สร้าง draft โพสต์ ' . count($newPosts) . " ชิ้น (เป้า {$maxPosts}/วัน · ต้อง Approve ก่อนโพสต์จริง)",
        'ห้ามโพสต์ซ้ำข้อความเดิม และต้องมี disclosure ทุกครั้ง',
        "ระบบหลีกเลี่ยง product+channel ที่เพิ่งใช้ใน {$cooldown} วันล่าสุด เพื่อลดสแปม",
    ];
    $recs = array_values(array_filter($recs));
    $brief = [
        'id' => new_id('brief'),
        'date' => $date,
        'type' => 'morning',
        'topProductIds' => array_map(fn($r) => $r['product']['id'], $ranked),
        'contentPackIds' => array_map(fn($p) => $p['pack']['id'], $pairs),
        'scheduleIds' => array_map(fn($p) => $p['id'], $newPosts),
        'summary' => 'เช้านี้คัด ' . count($ranked) . ' สินค้า และเตรียม draft ' . count($newPosts) . " โพสต์สำหรับ {$date}",
        'recommendations' => $recs,
        'disclaimer' => INCOME_DISCLAIMER,
        'createdAt' => date('c'),
    ];
    save_brief($brief);
    return $brief;
}

function analyze_posted(?string $date = null): array
{
    $pdo = db();
    if ($date) {
        $stmt = $pdo->prepare('SELECT * FROM schedule WHERE post_date=? AND metrics_at IS NOT NULL');
        $stmt->execute([$date]);
    } else {
        $stmt = $pdo->query('SELECT * FROM schedule WHERE metrics_at IS NOT NULL');
    }
    $rows = $stmt->fetchAll();
    $products = [];
    foreach (all_products() as $p) $products[$p['id']] = $p;

    $perfs = [];
    foreach ($rows as $r) {
        $views = max((int)$r['views'], 0);
        $clicks = max((int)$r['clicks'], 0);
        $orders = max((int)$r['orders_count'], 0);
        $commission = max((float)$r['commission_earned'], 0);
        $ctr = $views > 0 ? $clicks / $views : 0;
        $opc = $clicks > 0 ? $orders / $clicks : 0;
        $roi = $commission / max($clicks, 1);
        $score = $ctr * 40 + $opc * 30 + min($commission / 100, 1) * 30;
        $perfs[] = [
            'post' => $r,
            'productName' => $products[$r['product_id']]['name'] ?? $r['product_id'],
            'ctr' => $ctr,
            'ordersPerClick' => $opc,
            'commission' => $commission,
            'roiPerClick' => $roi,
            'score' => $score,
        ];
    }
    usort($perfs, fn($a, $b) => $b['score'] <=> $a['score']);
    $winners = array_slice($perfs, 0, 3);
    $recs = [];
    if (!$winners) {
        $recs[] = 'ยังไม่มีข้อมูลโพสต์ที่บันทึกผล — อนุมัติ draft แล้วโพสต์ด้วยมือ 1–2 ชิ้น แล้วกรอกผล';
        $recs[] = 'โฟกัส hook ที่พูด pain point ชัด และปิดด้วย CTA อ่อนโยน + disclosure';
    } else {
        $top = $winners[0];
        $recs[] = 'โพสต์ที่เวิร์กสุด: ' . $top['productName'] . ' (' . $top['post']['channel'] . ') — CTR ~' . number_format($top['ctr'] * 100, 1) . '% · ROI/คลิก ~฿' . number_format($top['roiPerClick'], 1);
        $recs[] = 'วันพรุ่งนี้ลองมุมเดิมแต่เปลี่ยน hook ใหม่ 1 แบบเพื่อทดสอบ';
    }
    $recs[] = 'อย่าโพสต์ซ้ำข้อความเดิมหลายรอบในวันเดียว — คุณภาพสำคัญกว่ารอบโพสต์';
    $totalCommission = array_sum(array_column($perfs, 'commission'));
    $summary = !$perfs
        ? 'สรุปเย็น: ยังไม่มีเมตริกที่บันทึก ระบบยังอยู่ในโหมดทดลองจากข้อมูลจริง'
        : 'สรุปเย็น: บันทึก ' . count($perfs) . ' โพสต์ ค่าคอมรวมที่กรอก ฿' . number_format($totalCommission, 0) . ' (ตัวเลขจากผู้ใช้ ไม่ใช่การันตีรายได้)';
    return compact('perfs', 'winners', 'recs', 'summary') + ['disclaimer' => INCOME_DISCLAIMER];
}

function run_evening_workflow(?string $date = null): array
{
    $date = $date ?: today_iso();
    $analysis = analyze_posted($date);
    $next = rank_products(3);
    $recs = $analysis['recs'];
    if ($next) {
        $recs[] = 'สินค้าแนะนำวันถัดไป: ' . implode(', ', array_map(fn($r) => $r['product']['name'], $next));
    }
    $stmt = db()->prepare('SELECT id FROM schedule WHERE post_date=?');
    $stmt->execute([$date]);
    $ids = array_column($stmt->fetchAll(), 'id');
    $brief = [
        'id' => new_id('brief'),
        'date' => $date,
        'type' => 'evening',
        'topProductIds' => array_map(fn($w) => $w['post']['product_id'], $analysis['winners']),
        'contentPackIds' => [],
        'scheduleIds' => $ids,
        'summary' => $analysis['summary'],
        'recommendations' => $recs,
        'disclaimer' => INCOME_DISCLAIMER,
        'createdAt' => date('c'),
    ];
    save_brief($brief);
    return $brief;
}

function save_brief(array $brief): void
{
    $stmt = db()->prepare(<<<SQL
INSERT INTO briefs (id,brief_date,type,top_product_ids,content_pack_ids,schedule_ids,summary,recommendations,disclaimer,created_at)
VALUES (?,?,?,?,?,?,?,?,?,?)
SQL);
    $stmt->execute([
        $brief['id'], $brief['date'], $brief['type'],
        json_encode($brief['topProductIds'], JSON_UNESCAPED_UNICODE),
        json_encode($brief['contentPackIds'], JSON_UNESCAPED_UNICODE),
        json_encode($brief['scheduleIds'], JSON_UNESCAPED_UNICODE),
        $brief['summary'],
        json_encode($brief['recommendations'], JSON_UNESCAPED_UNICODE),
        $brief['disclaimer'], date('Y-m-d H:i:s'),
    ]);
}

function latest_brief(string $type): ?array
{
    $stmt = db()->prepare('SELECT * FROM briefs WHERE type=? ORDER BY created_at DESC LIMIT 1');
    $stmt->execute([$type]);
    $row = $stmt->fetch();
    if (!$row) return null;
    return [
        'id' => $row['id'],
        'date' => $row['brief_date'],
        'type' => $row['type'],
        'summary' => $row['summary'],
        'recommendations' => decode_list($row['recommendations']),
        'disclaimer' => $row['disclaimer'],
        'createdAt' => $row['created_at'],
    ];
}
