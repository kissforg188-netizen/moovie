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

/** Soft 0–100 from expected baht commission (price × rate%). */
function expected_commission_score(float $price, float $rate): float
{
    $baht = max(0.0, $price) * max(0.0, $rate) / 100.0;
    if ($baht >= 80) return 100;
    if ($baht >= 40) return 85;
    if ($baht >= 20) return 70;
    if ($baht >= 10) return 55;
    if ($baht >= 5) return 40;
    if ($baht >= 2) return 25;
    return 12;
}

function score_product(array $p): array
{
    $rateScore = commission_score($p['commissionRate']);
    $expected = expected_commission_score((float) $p['price'], (float) $p['commissionRate']);
    // Blend rate + expected baht so tiny high-% items don't dominate
    $commission = $rateScore * 0.65 + $expected * 0.35;
    $impulse = impulse_price_score($p['price']);
    $pain = pain_clarity_score($p);
    $video = scale_1_to_5($p['videoEase']);
    $seasonal = scale_1_to_5($p['seasonalScore']);
    $event = event_proximity_boost((string) ($p['category'] ?? ''));
    $seasonal = min(100, $seasonal + (float) $event['boost']);
    $hist = performance_boost($p['id']);
    $base = $commission * 0.25 + $impulse * 0.2 + $pain * 0.25 + $video * 0.15 + $seasonal * 0.15;
    $total = $base * 0.85 + $hist * 0.15;
    return [
        'commission' => (int) round($commission),
        'impulsePrice' => (int) round($impulse),
        'painClarity' => (int) round($pain),
        'videoEase' => (int) round($video),
        'seasonal' => (int) round($seasonal),
        'expectedCommission' => (int) round($expected),
        'historyBoost' => (int) round($hist),
        'learningBoost' => 0,
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

function event_proximity_boost(string $category, ?string $ymd = null): array
{
    $ts = $ymd ? strtotime($ymd . ' 12:00:00') : time();
    $month = (int) date('n', $ts);
    $day = (int) date('j', $ts);
    $cat = mb_strtolower($category);

    // Thai Mother's Day — 12 August
    if ($month === 8 && $day >= 1 && $day <= 12) {
        $giftKeys = ['แม่', 'ของขวัญ', 'สุขภาพ', 'บ้าน', 'ความงาม', 'ครัว', 'ผิว', 'ดูแล', 'ดอกไม้', 'นวด'];
        $hit = false;
        foreach ($giftKeys as $k) {
            if ($cat !== '' && (str_contains($cat, mb_strtolower($k)) || str_contains(mb_strtolower($k), $cat))) {
                $hit = true;
                break;
            }
        }
        if (!$hit) {
            return ['boost' => 0, 'label' => null];
        }
        $daysUntil = 12 - $day;
        $boost = (int) round(3 + 7 * (1 - $daysUntil / 12));
        $boost = max(3, min(10, $boost));
        $label = $daysUntil === 0
            ? 'วันแม่วันนี้ — หมวดของขวัญ/ดูแล'
            : "ใกล้วันแม่ (อีก {$daysUntil} วัน)";
        return ['boost' => $boost, 'label' => $label];
    }

    // Back-to-school / เปิดเทอมปลาย — Aug 13–31
    if ($month === 8 && $day >= 13 && $day <= 31) {
        $schoolKeys = ['นักเรียน', 'เครื่องเขียน', 'กระเป๋า', 'แกเจ็ต', 'หูฟัง', 'เปิดเทอม', 'เรียน', 'แท็บเล็ต', 'ปากกา', 'โน้ตบุ๊ก', 'นักศึกษา'];
        $hit = false;
        foreach ($schoolKeys as $k) {
            if ($cat !== '' && (str_contains($cat, mb_strtolower($k)) || str_contains(mb_strtolower($k), $cat))) {
                $hit = true;
                break;
            }
        }
        if (!$hit) {
            return ['boost' => 0, 'label' => null];
        }
        $distFromPeak = abs($day - 20);
        $boost = (int) round(9 - $distFromPeak * 0.35);
        $boost = max(4, min(9, $boost));
        return ['boost' => $boost, 'label' => 'ช่วงเปิดเทอมปลายเดือน — หมวดเรียน/แกเจ็ต/กระเป๋า'];
    }

    // Soft bridge: early September school carry-over
    if ($month === 9 && $day <= 10) {
        $schoolKeys = ['นักเรียน', 'เครื่องเขียน', 'กระเป๋า', 'แกเจ็ต', 'หูฟัง', 'เรียน'];
        $hit = false;
        foreach ($schoolKeys as $k) {
            if ($cat !== '' && (str_contains($cat, mb_strtolower($k)) || str_contains(mb_strtolower($k), $cat))) {
                $hit = true;
                break;
            }
        }
        if (!$hit) {
            return ['boost' => 0, 'label' => null];
        }
        return ['boost' => 4, 'label' => 'ต้นเดือนหลังเปิดเทอม — หมวดเรียนยังมีโอกาสทดลอง'];
    }

    return ['boost' => 0, 'label' => null];
}

function generate_content_pack(array $product, int $variant = 0): array
{
    $pain = first_pain($product);
    $sell = first_sell($product);
    $platformHook = match ($product['platform'] ?? 'shopee') {
        'tiktok_shop' => 'โชว์ของจริงในคลิปสั้น แล้วค่อยเปิดดูรายละเอียดใน TikTok Shop ได้',
        'facebook' => "แชร์ตัวเลือกหมวด {$product['category']} ให้ดูสเปกก่อน แล้วค่อยตัดสินใจเอง",
        default => "เปิดดูสเปก/รีวิวบน Shopee ก่อนตัดสินใจ — ตัวเลือกหมวด {$product['category']}",
    };
    $hooks = rotate_arr([
        "เคยเจอไหม… {$pain}",
        $platformHook,
        "ถ้ากำลังหาของช่วยเรื่อง{$product['category']} ลองฟังก่อนตัดสินใจ",
        "{$sell} — ราคาประมาณ " . price_label($product['price']),
        "ของชิ้นเล็กที่คน" . ($product['targetAudience'] ?: 'ใช้งานจริง') . "พูดถึงบ่อย",
        'ไม่ต้องซื้อแพงก่อน ลองดูตัวเลือกนี้ก่อนได้',
        "เล่าจากมุมคนใช้จริง: อยากลดเรื่อง{$pain}",
        "สั้น ๆ ตรง ๆ — จุดที่ชอบคือ {$sell}",
    ], $variant);
    $hooks = array_slice($hooks, 0, 5);

    $ctas = rotate_arr([
        'สนใจดูรายละเอียดต่อได้ที่ลิงก์ในคอมเมนต์/ไบโอ — อ่านรีวิวและสเปกก่อนตัดสินใจนะ',
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
    $cta = $pack['ctas'][$ctaIndex] ?? $pack['ctas'][0] ?? '';
    if ($channel === 'tiktok') {
        // voiceover already includes opening hook + disclosure
        $vo = $pack['tiktokScript']['voiceover'] ?? '';
        $tags = implode(' ', array_merge(
            array_slice($pack['hashtagsTh'] ?? [], 0, 3),
            array_slice($pack['hashtagsEn'] ?? [], 0, 2)
        ));
        return trim("{$vo}\n\n{$cta}\n\n{$tags}");
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

/**
 * Soft filming priority: ease × rank × expected baht × short-form schedule boost.
 * Experimental — never claims guaranteed sales.
 */
function build_filming_queue(array $ranked, array $pairs, string $date): array
{
    $packByProduct = [];
    foreach ($pairs as $pair) {
        $packByProduct[$pair['product']['id']] = $pair['pack'];
    }

    $todayShort = [];
    $stmt = db()->prepare("SELECT product_id FROM schedule WHERE post_date=? AND status IN ('draft','approved','posted') AND channel IN ('tiktok','facebook_reels')");
    $stmt->execute([$date]);
    foreach ($stmt->fetchAll() as $row) {
        $todayShort[$row['product_id']] = true;
    }

    $n = max(count($ranked), 1);
    $items = [];
    foreach ($ranked as $index => $r) {
        $p = $r['product'];
        $pack = $packByProduct[$p['id']] ?? null;
        $ease = max(1, min(5, (int)$p['videoEase']));
        $baht = max(0, (float)$p['price'] * (float)$p['commissionRate'] / 100);
        $rankFit = $n <= 1 ? 100 : (1 - $index / ($n - 1)) * 100;
        $bahtScore = max(0, min(100, ($baht / 40) * 100));
        $onToday = isset($todayShort[$p['id']]);
        $priority = $ease * 20 * 0.4 + $rankFit * 0.3 + $bahtScore * 0.2 + ($onToday ? 10 : 0);
        $reasons = [];
        if ($ease >= 4) $reasons[] = 'ถ่ายง่าย';
        elseif ($ease <= 2) $reasons[] = 'ถ่ายยากกว่า — เตรียมสไลด์/พากย์สั้นก่อน';
        if ($index === 0) $reasons[] = 'ติด Top ranking';
        if ($baht >= 20) $reasons[] = 'ค่าคอมคาดหวัง ~฿' . number_format($baht, 0) . '/ชิ้น';
        if ($onToday) $reasons[] = 'มีคิว short/reels วันนี้';
        if (!$reasons) $reasons[] = 'ลำดับตามคะแนนรวมทดลอง';
        $items[] = [
            'productName' => $p['name'],
            'priority' => round($priority, 1),
            'reason' => implode(' · ', $reasons),
            'videoPriorityNote' => $pack['videoPriorityNote'] ?? 'เตรียมคลิปสั้น pain → สาธิต 1 จุด → CTA + disclosure',
            'firstChecklist' => $pack['filmingChecklist'][0] ?? null,
            'sellingAngle' => $pack['sellingAngles'][0] ?? null,
        ];
    }
    usort($items, fn($a, $b) => $b['priority'] <=> $a['priority']);
    return $items;
}

/** Soft overclaim patterns — mirrors Next.js compliance gate. */
function overclaim_patterns(): array
{
    return [
        ['pattern' => '/รับประกันรายได้|การันตีรายได้|รายได้ชัวร์|รวยแน่|รวยแน่นอน/ui', 'label' => 'เคลมรายได้แน่นอน'],
        ['pattern' => '/ขายดีอันดับ\s*1|ขายดีที่สุด|ที่ดีที่สุด|เบอร์หนึ่งแน่นอน/ui', 'label' => 'คำโฆษณาเกินจริง'],
        ['pattern' => '/ต้องซื้อเลย|รีบซื้อด่วน!!!+|หมดแล้วหมดเลย!!!+|โอกาสสุดท้าย!!!+/ui', 'label' => 'เร่งซื้อแบบสแปม'],
        ['pattern' => '/หายห่วง\s*100%|ได้ผล\s*100%|ชัวร์\s*100%/ui', 'label' => 'รับประกันผลเกินจริง'],
        ['pattern' => '/ฟรี!!!+|ถูกที่สุดในโลก|ถูกที่สุดแน่นอน/ui', 'label' => 'ราคาเกินจริง'],
    ];
}

/**
 * Hard gate before Approve — never auto-publishes.
 * @return array{ok:bool,errors:string[]}
 */
function evaluate_approve_gate(string $caption): array
{
    $errors = [];
    if (!str_contains($caption, AFFILIATE_DISCLOSURE)) {
        $errors[] = 'ขาด affiliate disclosure — สร้างแคปชันใหม่หรือแก้ก่อน Approve';
    }
    foreach (overclaim_patterns() as $rule) {
        if (preg_match($rule['pattern'], $caption, $m)) {
            $errors[] = 'พบถ้อยคำเสี่ยง (' . $rule['label'] . '): “' . ($m[0] ?? $rule['label']) . '”';
        }
    }
    return ['ok' => count($errors) === 0, 'errors' => $errors];
}

/** Flag missing disclosure on today's draft/approved captions. */
function audit_draft_captions(string $date): array
{
    $stmt = db()->prepare("SELECT id, channel, caption_preview, status FROM schedule WHERE post_date=? AND status IN ('draft','approved')");
    $stmt->execute([$date]);
    $rows = $stmt->fetchAll();
    $missing = 0;
    $warns = 0;
    foreach ($rows as $row) {
        $gate = evaluate_approve_gate((string)$row['caption_preview']);
        if (!$gate['ok']) {
            foreach ($gate['errors'] as $err) {
                if (str_contains($err, 'disclosure')) $missing++;
                else $warns++;
            }
        }
    }
    if (!$rows) {
        return ['Compliance: ยังไม่มี draft/approved วันนี้ให้ตรวจ'];
    }
    if ($missing === 0 && $warns === 0) {
        return ['Compliance: ตรวจ ' . count($rows) . ' แคปชัน — มี disclosure และไม่พบคำโฆษณาเกินจริง'];
    }
    return ["Compliance: พบปัญหา disclosure/คำโฆษณา — แก้ก่อน Approve/โพสต์ (ขาด disclosure ~{$missing} · คำเตือน ~{$warns})"];
}

/**
 * Rebuild draft caption with a new content pack variant.
 * Never publishes; skipped posts revive as draft.
 * @return array{ok:bool,message?:string,error?:string,packId?:string}
 */
function regenerate_schedule_draft(string $id): array
{
    $stmt = db()->prepare('SELECT * FROM schedule WHERE id=?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) {
        return ['ok' => false, 'error' => 'ไม่พบโพสต์ในตาราง'];
    }
    $status = (string)$row['status'];
    if ($status === 'posted') {
        return ['ok' => false, 'error' => 'โพสต์แล้ว — ไม่สร้างแคปชันทับของเก่า'];
    }
    if ($status === 'approved') {
        return ['ok' => false, 'error' => 'อนุมัติแล้ว — ข้ามก่อนถ้าต้องการสร้างแคปชันใหม่'];
    }

    $product = get_product((string)$row['product_id']);
    if (!$product) {
        return ['ok' => false, 'error' => 'ไม่พบสินค้าของโพสต์นี้'];
    }
    if (isset($product['active']) && (int)$product['active'] === 0) {
        return ['ok' => false, 'error' => 'สินค้าถูกพักไว้ — เปิดใช้งานก่อนสร้างแคปชันใหม่'];
    }

    $countStmt = db()->prepare('SELECT COUNT(*) FROM content_packs WHERE product_id=?');
    $countStmt->execute([$product['id']]);
    $prior = (int)$countStmt->fetchColumn();
    $oldVariant = 0;
    if (!empty($row['content_pack_id'])) {
        $old = db()->prepare('SELECT variant FROM content_packs WHERE id=?');
        $old->execute([$row['content_pack_id']]);
        $oldVariant = (int)($old->fetchColumn() ?: 0);
    }
    $variant = $oldVariant + $prior + 1;
    $pack = generate_content_pack($product, $variant);
    save_content_pack($pack);

    $hookIndex = $variant % max(1, count($pack['hooks']));
    $ctaIndex = $variant % max(1, count($pack['ctas']));
    $caption = caption_for_channel($pack, (string)$row['channel'], $hookIndex, $ctaIndex);

    $upd = db()->prepare(
        "UPDATE schedule SET content_pack_id=?, hook_index=?, cta_index=?, caption_preview=?, status='draft', approved_at=NULL WHERE id=?"
    );
    $upd->execute([$pack['id'], $hookIndex, $ctaIndex, $caption, $id]);

    return [
        'ok' => true,
        'packId' => $pack['id'],
        'message' => "สร้างแคปชันใหม่แล้ว (variant {$variant}) — ยังเป็น draft ต้อง Approve ก่อนโพสต์ด้วยมือ",
    ];
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

    $filmQueue = build_filming_queue($ranked, $pairs, $date);
    $shootFirst = $filmQueue[0] ?? null;
    $filmLabelParts = [];
    foreach (array_slice($filmQueue, 0, 3) as $i => $q) {
        $filmLabelParts[] = ($i + 1) . ') ' . $q['productName'];
    }
    $compliance = audit_draft_captions($date);

    $recs = [
        $ranked ? 'Top โปรโมตวันนี้: ' . implode(', ', array_map(fn($r) => $r['product']['name'], $ranked)) : 'ยังไม่มีสินค้า',
        $expired > 0 ? "ข้าม draft ค้าง {$expired} ชิ้น (เก่ากว่า " . stale_draft_days() . ' วัน)' : null,
        $filmLabelParts ? 'คิวถ่ายวิดีโอวันนี้ (ทดลอง): ' . implode(' → ', $filmLabelParts) : 'ยังไม่มีคิววิดีโอ',
        $shootFirst ? 'ถ่ายก่อน: ' . $shootFirst['productName'] . ' — ' . $shootFirst['reason'] . ' — ' . $shootFirst['videoPriorityNote'] : null,
        !empty($shootFirst['firstChecklist']) ? 'Checklist ถ่ายวิดีโอ (ตัวแรก): ' . $shootFirst['firstChecklist'] : null,
        ...$compliance,
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
        $recs[] = 'โพสต์ที่เวิร์กสุด: ' . $top['productName'] . ' (' . $top['post']['channel'] . ') — CTR ~' . number_format($top['ctr'] * 100, 1) . '% · ค่าคอม/คลิก ~฿' . number_format($top['roiPerClick'], 1) . ' (กรอกต้นทุนโปรโมทใน Next.js Lab เพื่อ ROI%)';
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
    $recs[] = 'แคปชันที่ไม่ผ่าน disclosure/คำโฆษณาจะ Approve ไม่ได้ — กดสร้างแคปชันใหม่ที่ตารางโพสต์';
    $recs[] = 'ถ้าสินค้าอ่อนต่อเนื่อง แนะนำพักชั่วคราวเองที่หน้าสินค้า (ระบบไม่พักอัตโนมัติ)';
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
