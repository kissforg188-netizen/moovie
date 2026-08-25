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

/**
 * Soft caption quality for human draft review (0–100). Never auto-publishes.
 * @return array{score:int,grade:string,tips:string[],label:string}
 */
function score_caption_quality(string $caption, string $channel = 'unknown'): array
{
    $text = trim($caption);
    $tips = [];
    $score = 40;
    if ($text === '') {
        return [
            'score' => 0,
            'grade' => 'D',
            'tips' => ['ยังไม่มีแคปชัน'],
            'label' => 'ต้องแก้ — อย่า Approve จนกว่าจะผ่าน',
        ];
    }

    $len = mb_strlen($text);
    $ranges = [
        'tiktok' => [80, 500],
        'facebook_reels' => [60, 400],
        'facebook_group' => [120, 900],
        'facebook_post' => [100, 800],
    ];
    [$min, $max] = $ranges[$channel] ?? [80, 700];

    if (str_contains($text, AFFILIATE_DISCLOSURE)) {
        $score += 22;
    } else {
        $score -= 25;
        $tips[] = 'เพิ่ม disclosure ก่อน Approve';
    }

    $gate = evaluate_approve_gate($text);
    $overclaim = 0;
    foreach ($gate['errors'] as $err) {
        if (!str_contains($err, 'disclosure')) {
            $overclaim++;
        }
    }
    if ($overclaim === 0 && str_contains($text, AFFILIATE_DISCLOSURE)) {
        $score += 12;
    } elseif ($overclaim > 0) {
        $score -= min(30, $overclaim * 12);
        $tips[] = 'ลดถ้อยคำโฆษณาเกินจริง';
    }

    if (preg_match('/ช่วยเลือก|ลองดู|เหมาะกับ|ถ้าสนใจ|อาจช่วย|สำหรับคนที่|เช็คราคา|ดูรายละเอียด/u', $text)) {
        $score += 10;
    } else {
        $tips[] = 'เติมน้ำเสียงช่วยเลือกของ';
    }
    if (preg_match('/รีบซื้อ|ต้องซื้อ|ด่วน|หมดแล้ว|โอกาสสุดท้าย|รวย|การันตี|รับประกันรายได้/u', $text)) {
        $score -= 15;
        $tips[] = 'เลี่ยงคำเร่งซื้อ/สแปม';
    }
    if (preg_match('/ลิงก์ใน|ลิงก์ใต้|ดูรายละเอียด|เปิดดู|ลองเทียบ|เช็คราคา|bio|ตะกร้า|โปรไฟล์/u', $text)) {
        $score += 8;
    } else {
        $tips[] = 'เพิ่ม CTA อ่อน ๆ';
    }

    if ($len >= $min && $len <= $max) {
        $score += 10;
    } elseif ($len < $min) {
        $score -= 8;
        $tips[] = "แคปชันสั้นไป (เป้า {$min}–{$max} ตัวอักษร)";
    } else {
        $score -= 6;
        $tips[] = "แคปชันยาวไป — ตัดให้เหลือ ~{$max} ตัวอักษร";
    }

    if (in_array($channel, ['tiktok', 'facebook_reels'], true)) {
        preg_match_all('/#[\w\x{0E00}-\x{0E7F}]+/u', $text, $m);
        $tags = count($m[0] ?? []);
        if ($tags >= 3 && $tags <= 12) {
            $score += 6;
        } elseif ($tags === 0) {
            $tips[] = 'เพิ่ม hashtag ไทย/อังกฤษ 3–8 ตัว';
        } elseif ($tags > 12) {
            $score -= 4;
            $tips[] = 'hashtag เยอะเกิน';
        }
    }

    $score = max(0, min(100, (int)round($score)));
    $grade = $score >= 85 ? 'A' : ($score >= 70 ? 'B' : ($score >= 50 ? 'C' : 'D'));
    $labels = [
        'A' => 'ดีมาก — พร้อมรีวิว Approve',
        'B' => 'ใช้ได้ — ปรับเล็กน้อยจะคมขึ้น',
        'C' => 'ปานกลาง — แนะนำแก้ก่อน Approve',
        'D' => 'ต้องแก้ — อย่า Approve จนกว่าจะผ่าน',
    ];
    return [
        'score' => $score,
        'grade' => $grade,
        'tips' => array_slice($tips, 0, 4),
        'label' => $labels[$grade],
    ];
}

/**
 * Daily Action Digest — human checklist before Approve / evening metrics.
 * Never auto-publishes.
 * @return array{date:string,summary:string,counts:array,actions:array<int,array>,lines:array<int,string>,disclaimer:string}
 */
function build_daily_digest(?string $date = null): array
{
    $date = $date ?: today_iso();
    $yesterday = date('Y-m-d', strtotime($date . ' -1 day'));

    $stmt = db()->prepare("SELECT s.*, p.name AS product_name FROM schedule s LEFT JOIN products p ON p.id=s.product_id WHERE s.post_date=? ORDER BY s.suggested_time");
    $stmt->execute([$date]);
    $today = $stmt->fetchAll() ?: [];

    $stmt2 = db()->prepare("SELECT s.*, p.name AS product_name FROM schedule s LEFT JOIN products p ON p.id=s.product_id WHERE s.status='posted' AND s.post_date IN (?,?)");
    $stmt2->execute([$date, $yesterday]);
    $recentPosted = $stmt2->fetchAll() ?: [];

    $drafts = array_values(array_filter($today, fn($s) => in_array($s['status'], ['draft', 'generated', 'pending'], true)));
    $approved = array_values(array_filter($today, fn($s) => $s['status'] === 'approved'));
    $blocked = [];
    foreach ($drafts as $s) {
        $gate = evaluate_approve_gate((string)$s['caption_preview']);
        if (!$gate['ok']) {
            $blocked[] = $s + ['_gate' => $gate];
        }
    }

    $missing = [];
    foreach ($recentPosted as $s) {
        $views = (int)($s['views'] ?? 0);
        $clicks = (int)($s['clicks'] ?? 0);
        $orders = (int)($s['orders_count'] ?? 0);
        $comm = (float)($s['commission_earned'] ?? 0);
        $notes = trim((string)($s['metrics_notes'] ?? ''));
        // Treat all-zero with no notes as not filled
        if ($views === 0 && $clicks === 0 && $orders === 0 && $comm <= 0 && $notes === '') {
            $missing[] = $s;
        }
    }

    $activeProducts = 0;
    $pausedProducts = 0;
    foreach (all_products() as $p) {
        $paused = array_key_exists('active', $p)
            && ($p['active'] === false || $p['active'] === 0 || $p['active'] === '0');
        if ($paused) {
            $pausedProducts++;
        } else {
            $activeProducts++;
        }
    }

    $actions = [];
    if (!$today) {
        $actions[] = [
            'priority' => 'now',
            'title' => 'รัน Morning Automation',
            'detail' => 'ยังไม่มี draft วันนี้ — รัน Morning เพื่อคัดสินค้า + สร้างตาราง draft (ยังไม่โพสต์จริง)',
        ];
    }
    foreach (array_slice($blocked, 0, 5) as $s) {
        $err = $s['_gate']['errors'][0] ?? 'ไม่ผ่านเกณฑ์ Approve';
        $actions[] = [
            'priority' => 'now',
            'title' => 'แก้แคปชันก่อน Approve · ' . ($s['product_name'] ?? ''),
            'detail' => channel_label((string)$s['channel']) . ' ' . ($s['suggested_time'] ?? '') . ' — ' . $err,
        ];
    }
    foreach (array_slice($drafts, 0, 5) as $s) {
        $gate = evaluate_approve_gate((string)$s['caption_preview']);
        if (!$gate['ok']) {
            continue;
        }
        $q = score_caption_quality((string)$s['caption_preview'], (string)$s['channel']);
        $actions[] = [
            'priority' => ($q['grade'] === 'C' || $q['grade'] === 'D') ? 'soon' : 'now',
            'title' => 'ตรวจ draft เกรด ' . $q['grade'] . ' · ' . ($s['product_name'] ?? ''),
            'detail' => channel_label((string)$s['channel']) . ' ' . ($s['suggested_time'] ?? '') . ' · คะแนน ' . $q['score'] . '/100',
        ];
    }
    foreach (array_slice($approved, 0, 5) as $s) {
        $actions[] = [
            'priority' => 'soon',
            'title' => 'โพสต์ด้วยมือแล้วกดยืนยัน · ' . ($s['product_name'] ?? ''),
            'detail' => channel_label((string)$s['channel']) . ' แนะนำ ' . ($s['suggested_time'] ?? '') . ' — ระบบไม่โพสต์ให้อัตโนมัติ',
        ];
    }
    foreach (array_slice($missing, 0, 5) as $s) {
        $actions[] = [
            'priority' => 'soon',
            'title' => 'กรอกผลโพสต์ · ' . ($s['product_name'] ?? ''),
            'detail' => ($s['post_date'] ?? '') . ' ' . channel_label((string)$s['channel']) . ' — ใส่ views/clicks/orders/ค่าคอม ที่หน้า Results',
        ];
    }
    if (!$actions) {
        $actions[] = [
            'priority' => 'later',
            'title' => 'คิววันนี้เรียบร้อย',
            'detail' => 'ไม่มี draft ค้าง / ไม่มีผลที่ต้องกรอก',
        ];
    }

    $counts = [
        'draftPending' => count($drafts),
        'approveBlocked' => count($blocked),
        'approvedWaitingPost' => count($approved),
        'missingMetrics' => count($missing),
        'activeProducts' => $activeProducts,
        'pausedProducts' => $pausedProducts,
    ];
    $parts = ["วันนี้ draft {$counts['draftPending']}"];
    if ($counts['approveBlocked']) {
        $parts[] = "บล็อก Approve {$counts['approveBlocked']}";
    }
    if ($counts['approvedWaitingPost']) {
        $parts[] = "รอโพสต์มือ {$counts['approvedWaitingPost']}";
    }
    if ($counts['missingMetrics']) {
        $parts[] = "รอกรอกผล {$counts['missingMetrics']}";
    }
    $summary = implode(' · ', $parts);

    $lines = ["Digest {$date}: {$summary}", "สินค้า active {$activeProducts} · พัก {$pausedProducts}"];
    foreach (array_slice($actions, 0, 12) as $a) {
        $tag = $a['priority'] === 'now' ? 'ตอนนี้' : ($a['priority'] === 'soon' ? 'ถัดไป' : 'ภายหลัง');
        $lines[] = "[{$tag}] {$a['title']} — {$a['detail']}";
    }
    $lines[] = INCOME_DISCLAIMER;

    return [
        'date' => $date,
        'summary' => $summary,
        'counts' => $counts,
        'actions' => $actions,
        'lines' => $lines,
        'disclaimer' => INCOME_DISCLAIMER,
    ];
}

/**
 * Tomorrow Plan — evening counterpart to Daily Action Digest.
 * Actionable picks + fatigue warnings; never auto-publishes.
 * @return array{date:string,tomorrowDate:string,summary:string,picks:array,channelTips:array,fatigueWarnings:array,filmingOrder:array,checklist:array,lines:array,disclaimer:string}
 */
function build_tomorrow_plan(?string $date = null): array
{
    $date = $date ?: today_iso();
    $tomorrow = date('Y-m-d', strtotime($date . ' +1 day'));
    $cooldown = 3;
    $windowStart = date('Y-m-d', strtotime($date . ' -' . ($cooldown - 1) . ' day'));
    $maxPosts = 3;

    $ranked = rank_products(8);
    $fatigueWarnings = [];
    $fatigued = [];
    $stmt = db()->prepare(
        "SELECT product_id, COUNT(*) AS n FROM schedule
         WHERE post_date BETWEEN ? AND ?
           AND status IN ('draft','generated','pending','approved','posted')
         GROUP BY product_id"
    );
    $stmt->execute([$windowStart, $date]);
    $countsByProduct = [];
    foreach ($stmt->fetchAll() ?: [] as $row) {
        $countsByProduct[$row['product_id']] = (int)$row['n'];
    }

    $productsById = [];
    foreach (all_products() as $p) {
        $productsById[$p['id']] = $p;
        $paused = array_key_exists('active', $p)
            && ($p['active'] === false || $p['active'] === 0 || $p['active'] === '0');
        if ($paused) {
            continue;
        }
        $n = $countsByProduct[$p['id']] ?? 0;
        if ($n >= 3) {
            $fatigued[$p['id']] = true;
            $fatigueWarnings[] = $p['name'] . ": ถูกจัดคิว/โพสต์ {$n} ครั้งใน {$cooldown} วัน — แนะนำพักหมุนของชิ้นอื่น (กันสแปม)";
        }
    }

    $picks = [];
    foreach ($ranked as $row) {
        if (count($picks) >= 3) {
            break;
        }
        $p = $row['product'];
        $pid = $p['id'];
        if (!empty($fatigued[$pid]) && $picks) {
            continue;
        }
        $pain = '';
        if (!empty($p['pain_points'])) {
            $decoded = is_string($p['pain_points']) ? decode_list($p['pain_points']) : (array)$p['pain_points'];
            $pain = (string)($decoded[0] ?? '');
        }
        $sell = '';
        if (!empty($p['selling_points'])) {
            $decoded = is_string($p['selling_points']) ? decode_list($p['selling_points']) : (array)$p['selling_points'];
            $sell = (string)($decoded[0] ?? '');
        }
        $reasons = [];
        if ((float)($p['video_ease'] ?? 3) >= 4) {
            $reasons[] = 'ถ่ายคลิปสั้นง่าย';
        }
        $price = (float)($p['price'] ?? 0);
        if ($price > 0 && $price <= 499) {
            $reasons[] = 'ราคาใกล้ impulse buy';
        }
        if ($pain !== '') {
            $reasons[] = 'pain point ชัด';
        }
        if (!empty($fatigued[$pid])) {
            $reasons[] = 'ใกล้ล้า — ใช้มุมใหม่หรือพักถ้ามีตัวเลือกอื่น';
        }
        if (!$reasons) {
            $reasons[] = 'คะแนนจัดอันดับสูงในชุดข้อมูลตอนนี้';
        }
        $hook = $pain !== '' ? "เคยเจอไหม… {$pain}" : 'ลองดูสเปกก่อนตัดสินใจ';
        $angle = $sell !== '' ? $sell : 'ช่วยเปรียบเทียบสเปกให้เลือกของที่เหมาะ';
        $picks[] = [
            'productId' => $pid,
            'productName' => $p['name'],
            'platform' => $p['platform'] ?? 'shopee',
            'reason' => implode(' · ', $reasons),
            'suggestedAngle' => $angle,
            'suggestedHook' => $hook,
            'filmFirst' => count($picks) === 0,
            'recentPostCount' => $countsByProduct[$pid] ?? 0,
        ];
    }

    $channelTips = [
        ['channel' => 'tiktok', 'label' => channel_label('tiktok'), 'tip' => 'คลิป 15–30 วินาที โชว์ของจริง + เปิดด้วย hook แล้วปิดด้วย disclosure'],
        ['channel' => 'facebook_reels', 'label' => channel_label('facebook_reels'), 'tip' => 'แนวช่วยเลือกของ สั้น กระชับ ไม่ขายแข็ง'],
        ['channel' => 'facebook_post', 'label' => channel_label('facebook_post'), 'tip' => 'แคปชันยาวขึ้นได้เล็กน้อย แต่ต้องมี disclosure ทุกครั้ง'],
    ];

    $filmingOrder = [];
    foreach ($picks as $i => $pick) {
        $filmingOrder[] = ($i + 1) . '. ' . $pick['productName'] . ' — ' . $pick['reason'] . ' · มุม: ' . $pick['suggestedAngle'];
    }

    $checklist = [];
    if ($picks) {
        $names = implode(', ', array_map(fn($p) => $p['productName'], $picks));
        $checklist[] = "เตรียมถ่าย/ตัดคลิปสำหรับ: {$names}";
        $checklist[] = 'เช้าวันถัดไปรัน Morning เพื่อสร้าง draft ใหม่ — ยังไม่โพสต์จริง';
    } else {
        $checklist[] = 'เพิ่มสินค้า affiliate อย่างน้อย 1 ชิ้นก่อนรัน Morning';
    }
    $checklist[] = "เป้าโพสต์วันถัดไปไม่เกิน {$maxPosts} ชิ้น · คูลดาวน์ product+channel {$cooldown} วัน";
    $checklist[] = 'ตรวจ disclosure + ไม่ใช้คำโฆษณาเกินจริง ก่อนกด Approve ทุกชิ้น';
    if ($fatigueWarnings) {
        $checklist[] = 'มีสินค้าใกล้ล้า — หมุนหมวด/มุมขาย อย่าโพสต์ซ้ำไร้คุณภาพ';
    }

    $summary = $picks
        ? 'แผน ' . $tomorrow . ': โฟกัส ' . count($picks) . ' สินค้า · ถ่ายก่อน ' . $picks[0]['productName']
        : 'แผน ' . $tomorrow . ': ยังไม่มีสินค้าพอจัดแผน — เพิ่มของแล้วรัน Morning';

    $lines = ["Tomorrow Plan {$date} → {$tomorrow}: {$summary}"];
    foreach ($picks as $i => $p) {
        $lines[] = ($i + 1) . ". {$p['productName']} ({$p['platform']}) — {$p['reason']} · hook: {$p['suggestedHook']}";
    }
    foreach ($fatigueWarnings as $w) {
        $lines[] = 'พักหมุน: ' . $w;
    }
    foreach ($channelTips as $c) {
        $lines[] = "ช่องทาง {$c['label']}: {$c['tip']}";
    }
    foreach ($filmingOrder as $f) {
        $lines[] = 'ถ่าย: ' . $f;
    }
    foreach ($checklist as $c) {
        $lines[] = 'เช็ค: ' . $c;
    }
    $lines[] = INCOME_DISCLAIMER;

    return [
        'date' => $date,
        'tomorrowDate' => $tomorrow,
        'summary' => $summary,
        'picks' => $picks,
        'channelTips' => $channelTips,
        'fatigueWarnings' => $fatigueWarnings,
        'filmingOrder' => $filmingOrder,
        'checklist' => $checklist,
        'lines' => $lines,
        'disclaimer' => INCOME_DISCLAIMER,
    ];
}

/** Soft review-order score for Approve Priority Queue (never auto-publishes). */
function score_approve_priority(array $input): float
{
    $gateOk = !empty($input['gateOk']);
    $qualityScore = (float)($input['qualityScore'] ?? 0);
    $qualityGrade = (string)($input['qualityGrade'] ?? 'D');
    $expectedBahtScore = (float)($input['expectedBahtScore'] ?? 0);
    $videoEase = (float)($input['videoEase'] ?? 3);
    $channel = (string)($input['channel'] ?? 'facebook_post');
    $suggestedTime = (string)($input['suggestedTime'] ?? '12:00');

    $score = 0.0;
    $score += min(40.0, $expectedBahtScore * 0.35);
    $score += min(35.0, $qualityScore * 0.35);

    $shortForm = in_array($channel, ['tiktok', 'facebook_reels'], true);
    if ($shortForm) {
        $score += min(12.0, max(0.0, $videoEase) * 2.2);
    } else {
        $score += 4.0;
    }

    $hour = (int)substr($suggestedTime, 0, 2);
    $score += max(0.0, 10.0 - abs($hour - 10) * 0.8);

    if (!$gateOk) {
        $score *= 0.35;
    } elseif ($qualityGrade === 'C') {
        $score *= 0.75;
    } elseif ($qualityGrade === 'D') {
        $score *= 0.55;
    }

    return round(max(0.0, min(100.0, $score)), 1);
}

/**
 * Approve Priority Queue — order today's drafts for human review.
 * @return array{date:string,summary:string,counts:array,items:array,lines:array,disclaimer:string}
 */
function build_approve_queue(?string $date = null): array
{
    $date = $date ?: today_iso();
    $stmt = db()->prepare("SELECT s.*, p.name AS product_name, p.price, p.commission_rate, p.video_ease FROM schedule s LEFT JOIN products p ON p.id=s.product_id WHERE s.post_date=? AND s.status IN ('draft','generated','pending') ORDER BY s.suggested_time");
    $stmt->execute([$date]);
    $rows = $stmt->fetchAll() ?: [];

    $bandRank = ['ready' => 0, 'fix_first' => 1, 'blocked' => 2];
    $items = [];
    foreach ($rows as $row) {
        $caption = (string)$row['caption_preview'];
        $channel = (string)$row['channel'];
        $gate = evaluate_approve_gate($caption);
        $quality = score_caption_quality($caption, $channel);
        $gateOk = !empty($gate['ok']);
        $grade = (string)$quality['grade'];
        $band = !$gateOk ? 'blocked' : (($grade === 'C' || $grade === 'D') ? 'fix_first' : 'ready');
        $price = (float)($row['price'] ?? 0);
        $rate = (float)($row['commission_rate'] ?? 0);
        $expectedBaht = max(0.0, $price) * max(0.0, $rate) / 100.0;
        $expectedBahtScore = expected_commission_score($price, $rate);
        $priority = score_approve_priority([
            'gateOk' => $gateOk,
            'qualityScore' => (float)$quality['score'],
            'qualityGrade' => $grade,
            'expectedBahtScore' => $expectedBahtScore,
            'videoEase' => (float)($row['video_ease'] ?? 3),
            'channel' => $channel,
            'suggestedTime' => (string)$row['suggested_time'],
        ]);
        $channelLabel = channel_label($channel);
        $productName = (string)($row['product_name'] ?? $row['product_id']);
        $bahtLabel = $expectedBaht > 0
            ? 'คอมคาดการณ์ ~฿' . (string)(int)round($expectedBaht) . '/ชิ้น'
            : 'ยังไม่ครบราคา/คอม';

        if ($band === 'blocked') {
            $reason = "บล็อก Approve · {$channelLabel} · คุณภาพ {$grade} ({$quality['score']}) · {$bahtLabel}";
            $nextAction = $gate['errors'][0] ?? 'แก้ disclosure / คำโฆษณาก่อน Approve';
        } elseif ($band === 'fix_first') {
            $reason = "ควรปรับแคปชันก่อน · {$channelLabel} · {$grade} · {$bahtLabel}";
            $tip = $quality['tips'][0] ?? '';
            $nextAction = $tip !== ''
                ? 'ปรับแคปชัน: ' . $tip
                : 'ปรับน้ำเสียง/ความยาวแล้วค่อย Approve';
        } else {
            $reason = "พร้อมตรวจ Approve · {$channelLabel} · {$grade} · {$bahtLabel}";
            $nextAction = 'Approve ได้ — แล้วยังต้องโพสต์ด้วยมือ (ระบบไม่โพสต์ให้อัตโนมัติ)';
        }

        $items[] = [
            'scheduleId' => (string)$row['id'],
            'productId' => (string)$row['product_id'],
            'productName' => $productName,
            'channel' => $channel,
            'channelLabelTh' => $channelLabel,
            'suggestedTime' => (string)$row['suggested_time'],
            'status' => (string)$row['status'],
            'gateOk' => $gateOk,
            'gateErrors' => $gate['errors'] ?? [],
            'qualityGrade' => $grade,
            'qualityScore' => (int)$quality['score'],
            'priority' => $priority,
            'band' => $band,
            'reason' => $reason,
            'nextAction' => $nextAction,
            'href' => '?page=calendar',
            'expectedBaht' => $expectedBaht,
        ];
    }

    usort($items, function ($a, $b) use ($bandRank) {
        $bandDiff = ($bandRank[$a['band']] ?? 9) - ($bandRank[$b['band']] ?? 9);
        if ($bandDiff !== 0) return $bandDiff;
        if ($b['priority'] != $a['priority']) {
            return $b['priority'] <=> $a['priority'];
        }
        return strcmp($a['suggestedTime'], $b['suggestedTime']);
    });

    $counts = [
        'ready' => count(array_filter($items, fn($i) => $i['band'] === 'ready')),
        'fixFirst' => count(array_filter($items, fn($i) => $i['band'] === 'fix_first')),
        'blocked' => count(array_filter($items, fn($i) => $i['band'] === 'blocked')),
        'total' => count($items),
    ];

    $summary = $counts['total'] === 0
        ? "คิว Approve {$date}: ยังไม่มี draft — รัน Morning ก่อน"
        : "คิว Approve {$date}: พร้อม {$counts['ready']} · ควรแก้ {$counts['fixFirst']} · บล็อก {$counts['blocked']} (ไม่โพสต์อัตโนมัติ)";

    $lines = ["Approve Queue {$date}: {$summary}"];
    foreach (array_slice($items, 0, 5) as $item) {
        $tag = $item['band'] === 'ready' ? 'พร้อม' : ($item['band'] === 'fix_first' ? 'แก้ก่อน' : 'บล็อก');
        $lines[] = "[{$tag}] {$item['suggestedTime']} {$item['productName']} · {$item['channelLabelTh']} · ลำดับ {$item['priority']} · {$item['nextAction']}";
    }
    if ($counts['ready'] > 0) {
        $first = null;
        foreach ($items as $item) {
            if ($item['band'] === 'ready') {
                $first = $item;
                break;
            }
        }
        if ($first) {
            $lines[] = "เริ่ม Approve จาก: {$first['productName']} ({$first['suggestedTime']} · {$first['channelLabelTh']})";
        }
    } elseif ($counts['blocked'] > 0 || $counts['fixFirst'] > 0) {
        $lines[] = 'ยังไม่มีชิ้นพร้อม Approve — กดสร้างแคปชันใหม่หรือแก้ disclosure ก่อน';
    }
    $lines[] = 'ทุกชิ้นยังเป็น draft จนกว่าคุณจะ Approve แล้วโพสต์ด้วยมือ';

    return [
        'date' => $date,
        'summary' => $summary,
        'counts' => $counts,
        'items' => $items,
        'lines' => $lines,
        'disclaimer' => INCOME_DISCLAIMER,
    ];
}

function approve_queue_to_markdown(array $queue): string
{
    $rows = [];
    foreach ($queue['items'] as $idx => $i) {
        $n = $idx + 1;
        $gate = !empty($i['gateOk']) ? 'ผ่าน' : 'ไม่ผ่าน';
        $rows[] = "{$n}. **[{$i['band']}]** {$i['suggestedTime']} · {$i['productName']} · {$i['channelLabelTh']}\n"
            . "   ลำดับ {$i['priority']}/100 · คุณภาพ {$i['qualityGrade']} ({$i['qualityScore']}) · gate {$gate}\n"
            . "   {$i['reason']}\n"
            . "   ทำต่อ: {$i['nextAction']}";
    }
    if (!$rows) {
        $rows[] = '_(ยังไม่มี draft วันนี้)_';
    }
    return "# Approve Priority Queue · {$queue['date']}\n\n"
        . $queue['summary'] . "\n\n"
        . "- พร้อม Approve: {$queue['counts']['ready']}\n"
        . "- ควรแก้แคปชันก่อน: {$queue['counts']['fixFirst']}\n"
        . "- บล็อก (disclosure/คำโฆษณา): {$queue['counts']['blocked']}\n\n"
        . "## ลำดับแนะนำให้ตรวจ\n"
        . implode("\n", $rows) . "\n\n"
        . "> ระบบไม่โพสต์อัตโนมัติ — Approve แล้วต้องโพสต์ด้วยมือ\n\n"
        . $queue['disclaimer'] . "\n";
}

/**
 * Manual Publish Queue — order approved drafts for human posting.
 * Never auto-publishes; checklist only after Approve.
 * @return array{date:string,nowHm:string,grade:string,score:int,summary:string,counts:array,items:array,actions:array,checklist:array,lines:array,disclaimer:string}
 */
function build_publish_queue(?string $date = null, ?string $nowHm = null): array
{
    $date = $date ?: today_iso();
    $nowHm = $nowHm ?: date('H:i');
    $nowParts = array_map('intval', explode(':', $nowHm));
    $nowMinutes = ($nowParts[0] ?? 12) * 60 + ($nowParts[1] ?? 0);

    $stmt = db()->query("SELECT s.*, p.name AS product_name, p.price, p.commission_rate, p.video_ease FROM schedule s LEFT JOIN products p ON p.id=s.product_id WHERE s.status='approved'");
    $rows = $stmt ? ($stmt->fetchAll() ?: []) : [];

    $bandRank = ['overdue' => 0, 'due_now' => 1, 'today' => 2, 'upcoming' => 3];
    $bandLabel = ['overdue' => 'ค้าง', 'due_now' => 'ถึงเวลา', 'today' => 'วันนี้', 'upcoming' => 'เร็วๆ นี้'];
    $items = [];

    foreach ($rows as $row) {
        $postDate = (string)$row['post_date'];
        $suggested = (string)$row['suggested_time'];
        $slotParts = array_map('intval', explode(':', $suggested ?: '12:00'));
        $slotMinutes = ($slotParts[0] ?? 12) * 60 + ($slotParts[1] ?? 0);

        if ($postDate < $date) {
            $band = 'overdue';
        } elseif ($postDate > $date) {
            $band = 'upcoming';
        } elseif ($slotMinutes <= $nowMinutes) {
            $band = 'due_now';
        } else {
            $band = 'today';
        }

        $caption = (string)$row['caption_preview'];
        $channel = (string)$row['channel'];
        $gate = evaluate_approve_gate($caption);
        $gateOk = !empty($gate['ok']);
        $needsFilm = in_array($channel, ['tiktok', 'facebook_reels'], true);
        $packReady = $gateOk; // approved + gate → ready to copy (parity soft)
        $price = (float)($row['price'] ?? 0);
        $rate = (float)($row['commission_rate'] ?? 0);
        $expectedBaht = max(0.0, $price) * max(0.0, $rate) / 100.0;
        $expectedBahtScore = expected_commission_score($price, $rate);
        $videoEase = (float)($row['video_ease'] ?? 3);

        $priority = 40.0;
        if ($band === 'overdue') $priority += 35;
        elseif ($band === 'due_now') $priority += 28;
        elseif ($band === 'today') $priority += 14;
        else $priority += 4;
        if ($packReady) $priority += 12;
        if ($gateOk) $priority += 10;
        else $priority -= 25;
        $priority += min(12.0, $expectedBahtScore * 0.12);
        if ($needsFilm) $priority += min(10.0, max(0.0, $videoEase) * 1.8);
        else $priority += 5;
        if ($band === 'today' || $band === 'due_now') {
            $priority += max(0.0, 8.0 - abs($slotMinutes - $nowMinutes) / 30.0);
        }
        $priority = round(max(0.0, min(100.0, $priority)) * 10) / 10;

        $channelLabel = channel_label($channel);
        $productName = (string)($row['product_name'] ?? $row['product_id']);
        $bahtLabel = $expectedBaht > 0
            ? 'คอมคาดการณ์ ~฿' . (string)(int)round($expectedBaht) . '/ชิ้น'
            : 'ยังไม่ครบราคา/คอม';
        $reason = ($bandLabel[$band] ?? $band) . " · {$channelLabel} · {$postDate} {$suggested} · {$bahtLabel}"
            . ($gateOk ? '' : ' · gate ไม่ผ่าน');

        if (!$gateOk) {
            $nextAction = $gate['errors'][0] ?? 'แก้แคปชัน/disclosure ก่อนโพสต์';
        } elseif ($band === 'overdue') {
            $nextAction = 'โพสต์ค้างก่อน หรือ Skip ถ้าเลิกโปรโมตมุมนี้';
        } elseif ($band === 'due_now') {
            $nextAction = 'ถึงเวลาแล้ว — คัดลอก pack แล้วโพสต์ด้วยมือ';
        } elseif ($band === 'today') {
            $nextAction = "รอถึง {$suggested} หรือโพสต์เมื่อพร้อม (ยังไม่ auto)";
        } else {
            $nextAction = "เตรียมล่วงหน้าสำหรับ {$postDate}";
        }

        $steps = [];
        if ($band === 'overdue') {
            $steps[] = 'ชิ้นนี้ค้างจากวันก่อน — โพสต์หรือ Skip เพื่อไม่ให้คิวตัน';
        }
        if (!$gateOk) {
            $steps[] = 'แก้ disclosure / คำโฆษณาก่อน (หรือ regenerate แล้ว Approve ใหม่)';
        }
        $steps[] = $packReady
            ? 'คัดลอก Posting Pack (แคปชัน + ลิงก์ + hashtag)'
            : 'เปิดตารางโพสต์ → คัดลอก Posting Pack';
        $steps[] = $needsFilm
            ? "ถ่าย/อัปโหลดคลิปสั้นสำหรับ {$channelLabel}"
            : "วางแคปชันลง {$channelLabel} ด้วยมือ";
        $steps[] = 'ตรวจ disclosure ในโพสต์จริงอีกครั้ง';
        $steps[] = 'หลังโพสต์แล้ว → กด Mark posted ที่ตาราง';

        $items[] = [
            'scheduleId' => (string)$row['id'],
            'productId' => (string)$row['product_id'],
            'productName' => $productName,
            'channel' => $channel,
            'channelLabelTh' => $channelLabel,
            'date' => $postDate,
            'suggestedTime' => $suggested,
            'status' => 'approved',
            'band' => $band,
            'priority' => $priority,
            'packReady' => $packReady,
            'gateOk' => $gateOk,
            'gateErrors' => $gate['errors'] ?? [],
            'needsFilm' => $needsFilm,
            'steps' => $steps,
            'reason' => $reason,
            'nextAction' => $nextAction,
            'href' => '?page=calendar',
            'expectedBaht' => $expectedBaht,
        ];
    }

    usort($items, function ($a, $b) use ($bandRank) {
        $bandDiff = ($bandRank[$a['band']] ?? 9) - ($bandRank[$b['band']] ?? 9);
        if ($bandDiff !== 0) return $bandDiff;
        if ($b['priority'] != $a['priority']) return $b['priority'] <=> $a['priority'];
        $dateDiff = strcmp($a['date'], $b['date']);
        if ($dateDiff !== 0) return $dateDiff;
        return strcmp($a['suggestedTime'], $b['suggestedTime']);
    });

    $counts = [
        'overdue' => count(array_filter($items, fn($i) => $i['band'] === 'overdue')),
        'dueNow' => count(array_filter($items, fn($i) => $i['band'] === 'due_now')),
        'today' => count(array_filter($items, fn($i) => $i['band'] === 'today')),
        'upcoming' => count(array_filter($items, fn($i) => $i['band'] === 'upcoming')),
        'total' => count($items),
        'needsAttention' => count(array_filter($items, fn($i) => $i['band'] === 'overdue' || $i['band'] === 'due_now' || empty($i['gateOk']))),
    ];

    $blocked = count(array_filter($items, fn($i) => empty($i['gateOk'])));
    $notReady = count(array_filter($items, fn($i) => empty($i['packReady'])));
    $score = 100;
    $score -= min(40, $counts['overdue'] * 18);
    $score -= min(20, $counts['dueNow'] * 6);
    $score -= min(25, $blocked * 12);
    $score -= min(10, $notReady * 4);
    if ($counts['total'] === 0) $score = 90;
    $score = max(0, min(100, (int)round($score)));
    $grade = $score >= 85 ? 'A' : ($score >= 70 ? 'B' : ($score >= 50 ? 'C' : 'D'));

    $summary = $counts['total'] === 0
        ? "คิวโพสต์มือ {$date}: ยังไม่มีชิ้นที่ Approve — ตรวจคิว Approve ก่อน (ระบบไม่โพสต์ให้อัตโนมัติ)"
        : "คิวโพสต์มือ {$date}: ค้าง {$counts['overdue']} · ถึงเวลา {$counts['dueNow']} · วันนี้ {$counts['today']} · เร็วๆ นี้ {$counts['upcoming']} · เกรดคิว {$grade}";

    $actions = [];
    if ($counts['overdue'] > 0) {
        $first = null;
        foreach ($items as $item) {
            if ($item['band'] === 'overdue') { $first = $item; break; }
        }
        $actions[] = [
            'id' => 'clear-overdue',
            'title' => 'เคลียร์โพสต์ค้าง',
            'detail' => $first
                ? "เริ่มที่ {$first['productName']} ({$first['channelLabelTh']}) — โพสต์หรือ Skip"
                : "มี {$counts['overdue']} ชิ้นค้าง",
        ];
    }
    if ($counts['dueNow'] > 0) {
        $first = null;
        foreach ($items as $item) {
            if ($item['band'] === 'due_now' && !empty($item['gateOk'])) { $first = $item; break; }
        }
        $actions[] = [
            'id' => 'post-due',
            'title' => 'โพสต์ชิ้นที่ถึงเวลา',
            'detail' => $first
                ? "{$first['suggestedTime']} · {$first['productName']} · คัดลอก Posting Pack"
                : "มี {$counts['dueNow']} ชิ้นถึงเวลาแล้ว",
        ];
    }
    if ($blocked > 0) {
        $actions[] = [
            'id' => 'fix-gate',
            'title' => 'แก้ชิ้นที่ gate ไม่ผ่าน',
            'detail' => 'อย่าโพสต์ถ้าขาด disclosure หรือมีคำโฆษณาเกินจริง',
        ];
    }
    if ($counts['today'] > 0 && $counts['dueNow'] === 0 && $counts['overdue'] === 0) {
        $next = null;
        foreach ($items as $item) {
            if ($item['band'] === 'today') { $next = $item; break; }
        }
        $actions[] = [
            'id' => 'prep-today',
            'title' => 'เตรียมแพ็กวันนี้',
            'detail' => $next
                ? "ชิ้นถัดไป {$next['suggestedTime']} · {$next['productName']}"
                : 'เตรียมแคปชัน/คลิปก่อนถึงเวลา',
        ];
    }
    if (!$actions) {
        $actions[] = [
            'id' => 'approve-first',
            'title' => 'Approve draft ก่อน',
            'detail' => 'คิวโพสต์มือว่าง — ไปที่ Approve Queue แล้วค่อยกลับมาโพสต์ด้วยมือ',
        ];
    }
    $actions = array_slice($actions, 0, 5);

    $checklist = [
        'โพสต์เฉพาะชิ้นที่สถานะ approved เท่านั้น',
        'คัดลอก Posting Pack แล้ววางด้วยมือ — ระบบไม่โพสต์อัตโนมัติ',
        'ตรวจ disclosure ในโพสต์จริงทุกครั้ง',
        'หลังโพสต์ กด Mark posted แล้วกรอกผลเย็นที่ Results Intake',
        'ชิ้นค้างหลายวัน → โพสต์หรือ Skip เพื่อไม่ให้ซ้ำ/สแปม',
    ];

    $lines = [
        "Publish Queue · {$date} {$nowHm}: เกรด {$grade} ({$score}/100)",
        $summary,
    ];
    foreach (array_slice($items, 0, 5) as $item) {
        $tag = $bandLabel[$item['band']] ?? $item['band'];
        $lines[] = "[{$tag}] {$item['date']} {$item['suggestedTime']} {$item['productName']} · {$item['channelLabelTh']} · ลำดับ {$item['priority']} · {$item['nextAction']}";
    }
    if ($counts['needsAttention'] > 0) {
        $first = null;
        foreach ($items as $item) {
            if ($item['band'] === 'overdue' || $item['band'] === 'due_now' || empty($item['gateOk'])) {
                $first = $item;
                break;
            }
        }
        if ($first) {
            $lines[] = "เริ่มโพสต์จาก: {$first['productName']} ({$first['date']} {$first['suggestedTime']} · {$first['channelLabelTh']})";
        }
    } elseif ($counts['total'] > 0) {
        $lines[] = 'คิววันนี้ยังไม่ถึงเวลา — เตรียม pack/คลิปล่วงหน้าได้';
    } else {
        $lines[] = 'ยังไม่มี approved รอโพสต์ — อย่าโพสต์จาก draft โดยตรง';
    }
    $lines[] = 'ระบบไม่โพสต์อัตโนมัติ — Approve แล้วต้องโพสต์ด้วยมือ';

    return [
        'date' => $date,
        'nowHm' => $nowHm,
        'grade' => $grade,
        'score' => $score,
        'summary' => $summary,
        'counts' => $counts,
        'items' => $items,
        'actions' => $actions,
        'checklist' => $checklist,
        'lines' => $lines,
        'disclaimer' => INCOME_DISCLAIMER,
    ];
}

function publish_queue_to_markdown(array $queue): string
{
    $bandLabel = ['overdue' => 'ค้าง', 'due_now' => 'ถึงเวลา', 'today' => 'วันนี้', 'upcoming' => 'เร็วๆ นี้'];
    $rows = [];
    foreach ($queue['items'] as $idx => $i) {
        $n = $idx + 1;
        $tag = $bandLabel[$i['band']] ?? $i['band'];
        $pack = !empty($i['packReady']) ? 'พร้อมคัดลอก' : 'ยังไม่พร้อม';
        $gate = !empty($i['gateOk']) ? 'ผ่าน' : 'ไม่ผ่าน';
        $steps = '';
        foreach ($i['steps'] as $s) {
            $steps .= "   - {$s}\n";
        }
        $rows[] = "{$n}. **[{$tag}]** {$i['date']} {$i['suggestedTime']} · {$i['productName']} · {$i['channelLabelTh']}\n"
            . "   ลำดับ {$i['priority']}/100 · pack {$pack} · gate {$gate}\n"
            . "   {$i['reason']}\n"
            . "   ทำต่อ: {$i['nextAction']}\n"
            . "   Checklist:\n{$steps}";
    }
    if (!$rows) {
        $rows[] = '_(ยังไม่มีชิ้นที่ Approve)_';
    }
    $actionLines = [];
    foreach ($queue['actions'] as $a) {
        $actionLines[] = "- **{$a['title']}**: {$a['detail']}";
    }
    $checkLines = [];
    foreach ($queue['checklist'] as $c) {
        $checkLines[] = "- {$c}";
    }
    return "# Manual Publish Queue · {$queue['date']} ({$queue['nowHm']})\n\n"
        . $queue['summary'] . "\n\n"
        . "- เกรดคิว: {$queue['grade']} ({$queue['score']}/100)\n"
        . "- ค้าง: {$queue['counts']['overdue']}\n"
        . "- ถึงเวลา: {$queue['counts']['dueNow']}\n"
        . "- วันนี้ (ยังไม่ถึงเวลา): {$queue['counts']['today']}\n"
        . "- เร็วๆ นี้: {$queue['counts']['upcoming']}\n\n"
        . "## ลำดับแนะนำให้โพสต์ด้วยมือ\n"
        . implode("\n", $rows) . "\n\n"
        . "## Actions\n"
        . implode("\n", $actionLines) . "\n\n"
        . "## Checklist\n"
        . implode("\n", $checkLines) . "\n\n"
        . "> ระบบไม่โพสต์อัตโนมัติ — Approve แล้วต้องคัดลอกไปโพสต์ด้วยมือ แล้ว Mark posted\n\n"
        . $queue['disclaimer'] . "\n";
}

/** Soft baht commission per sale from catalog (price × rate%). */
function expected_commission_baht(float $price, float $rate): float
{
    return max(0.0, $price) * max(0.0, $rate) / 100.0;
}

/**
 * Soft ROI Lab — experimental commission ranges from logged metrics.
 * Never auto-publishes; never claims guaranteed income.
 */
function build_soft_roi_lab(?string $date = null, int $windowDays = 14): array
{
    $date = $date ?: today_iso();
    $window = max(7, min(30, $windowDays));
    $from = date('Y-m-d', strtotime($date . ' -' . ($window - 1) . ' days'));

    $stmt = db()->prepare(
        "SELECT s.*, p.name AS product_name, p.platform, p.price, p.commission_rate, p.active
         FROM schedule s
         LEFT JOIN products p ON p.id = s.product_id
         WHERE s.post_date BETWEEN ? AND ?
           AND s.metrics_at IS NOT NULL"
    );
    $stmt->execute([$from, $date]);
    $posted = $stmt->fetchAll();

    $commissions = [];
    $totalViews = 0;
    $totalClicks = 0;
    $totalOrders = 0;
    $roiSamples = [];
    $byProduct = [];

    foreach ($posted as $s) {
        $views = max(0, (int)$s['views']);
        $clicks = max(0, (int)$s['clicks']);
        $orders = max(0, (int)$s['orders_count']);
        $comm = max(0.0, (float)$s['commission_earned']);
        $spend = max(0.0, (float)($s['promo_spend'] ?? 0));
        $commissions[] = $comm;
        $totalViews += $views;
        $totalClicks += $clicks;
        $totalOrders += $orders;
        if ($spend > 0) {
            $roiSamples[] = ($comm - $spend) / $spend;
        }
        $pid = (string)$s['product_id'];
        if (!isset($byProduct[$pid])) {
            $byProduct[$pid] = [
                'name' => (string)($s['product_name'] ?: $pid),
                'platform' => (string)($s['platform'] ?: 'shopee'),
                'price' => (float)($s['price'] ?? 0),
                'rate' => (float)($s['commission_rate'] ?? 0),
                'commissions' => [],
                'views' => [],
                'clicks' => [],
                'orders' => [],
                'rois' => [],
            ];
        }
        $byProduct[$pid]['commissions'][] = $comm;
        $byProduct[$pid]['views'][] = $views;
        $byProduct[$pid]['clicks'][] = $clicks;
        $byProduct[$pid]['orders'][] = $orders;
        if ($spend > 0) {
            $byProduct[$pid]['rois'][] = ($comm - $spend) / $spend;
        }
    }

    $avgCommission = $commissions ? array_sum($commissions) / count($commissions) : 0.0;
    $baseline = [
        'avgCtr' => $totalViews > 0 ? round($totalClicks / $totalViews, 2) : 0.0,
        'avgOrdersPerClick' => $totalClicks > 0 ? round($totalOrders / $totalClicks, 2) : 0.0,
        'avgCommissionPerPost' => round($avgCommission, 1),
        'avgRoi' => $roiSamples ? round(array_sum($roiSamples) / count($roiSamples), 2) : null,
    ];

    $percentile = static function (array $sorted, float $p): float {
        $n = count($sorted);
        if ($n === 0) return 0.0;
        if ($n === 1) return (float)$sorted[0];
        $idx = ($n - 1) * $p;
        $lo = (int)floor($idx);
        $hi = (int)ceil($idx);
        if ($lo === $hi) return (float)$sorted[$lo];
        $w = $idx - $lo;
        return $sorted[$lo] * (1 - $w) + $sorted[$hi] * $w;
    };

    $productsOut = [];
    $allProducts = all_products();
    $seen = [];
    foreach ($allProducts as $p) {
        if (($p['active'] ?? true) === false && !isset($byProduct[$p['id']])) continue;
        $seen[$p['id']] = true;
        $agg = $byProduct[$p['id']] ?? null;
        $samples = $agg ? count($agg['commissions']) : 0;
        $sorted = $agg ? $agg['commissions'] : [];
        sort($sorted, SORT_NUMERIC);
        $rangeLow = $samples ? round($percentile($sorted, 0.25), 1) : 0.0;
        $rangeMid = $samples ? round($percentile($sorted, 0.5), 1) : 0.0;
        $rangeHigh = $samples ? round($percentile($sorted, 0.75), 1) : 0.0;
        $sumViews = $agg ? array_sum($agg['views']) : 0;
        $sumClicks = $agg ? array_sum($agg['clicks']) : 0;
        $sumOrders = $agg ? array_sum($agg['orders']) : 0;
        $avgCtr = $sumViews > 0 ? $sumClicks / $sumViews : 0.0;
        $avgOpc = $sumClicks > 0 ? $sumOrders / $sumClicks : 0.0;
        $avgRoi = ($agg && $agg['rois']) ? array_sum($agg['rois']) / count($agg['rois']) : null;
        $confidence = $samples >= 5 ? 'solid' : ($samples >= 2 ? 'ok' : 'thin');
        $catalogBaht = round(expected_commission_baht((float)$p['price'], (float)$p['commissionRate']), 1);

        if ($samples === 0) {
            $band = 'no_data';
        } elseif ($samples < 2) {
            $band = 'watch';
        } elseif ($rangeMid >= 30 && $avgCtr >= 0.02 && ($avgRoi === null || $avgRoi >= 0)) {
            $band = 'promising';
        } elseif ($rangeMid < 5 && $avgCtr < 0.01) {
            $band = 'cold';
        } else {
            $band = 'watch';
        }

        if ($band === 'no_data') {
            $tip = 'ยังไม่มีเมตริก — Approve → โพสต์มือ 1–2 ชิ้น แล้วกรอกผลก่อนอ่านช่วงนี้';
        } elseif ($confidence === 'thin') {
            $tip = "n={$samples} ยังบาง — ใช้ช่วง ฿{$rangeLow}–{$rangeHigh} เป็นสมมติฐานทดลองเท่านั้น";
        } elseif ($band === 'promising') {
            $tip = "ช่วงกลาง ~฿{$rangeMid}/โพสต์ (ทดลอง) — ลองมุมเดิม + hook ใหม่ 1 แบบ";
        } elseif ($band === 'cold') {
            $tip = 'สัญญาณอ่อน — พักหรือเปลี่ยนมุมขาย/ช่องทางก่อนลงแรงถ่าย';
        } elseif ($avgRoi !== null && $avgRoi < 0) {
            $tip = 'ROI จากต้นทุนที่กรอกติดลบ — ลดสเปนหรือปรับคอนเทนต์';
        } else {
            $tip = "ติดตามต่อ — ช่วงทดลอง ฿{$rangeLow}–{$rangeHigh}";
        }

        $productsOut[] = [
            'productId' => $p['id'],
            'productName' => $p['name'],
            'platform' => $p['platform'],
            'samples' => $samples,
            'avgCommission' => $samples ? round(array_sum($agg['commissions']) / $samples, 1) : 0.0,
            'rangeLow' => $rangeLow,
            'rangeMid' => $rangeMid,
            'rangeHigh' => $rangeHigh,
            'avgCtr' => round($avgCtr, 2),
            'avgOrdersPerClick' => round($avgOpc, 2),
            'avgRoi' => $avgRoi !== null ? round($avgRoi, 2) : null,
            'spendSamples' => $agg ? count($agg['rois']) : 0,
            'catalogBaht' => $catalogBaht,
            'confidence' => $confidence,
            'band' => $band,
            'tip' => $tip,
        ];
    }

    // Include orphan product ids from metrics
    foreach ($byProduct as $pid => $agg) {
        if (isset($seen[$pid])) continue;
        $samples = count($agg['commissions']);
        $sorted = $agg['commissions'];
        sort($sorted, SORT_NUMERIC);
        $rangeLow = round($percentile($sorted, 0.25), 1);
        $rangeMid = round($percentile($sorted, 0.5), 1);
        $rangeHigh = round($percentile($sorted, 0.75), 1);
        $productsOut[] = [
            'productId' => $pid,
            'productName' => $agg['name'],
            'platform' => $agg['platform'],
            'samples' => $samples,
            'avgCommission' => round(array_sum($agg['commissions']) / max(1, $samples), 1),
            'rangeLow' => $rangeLow,
            'rangeMid' => $rangeMid,
            'rangeHigh' => $rangeHigh,
            'avgCtr' => 0.0,
            'avgOrdersPerClick' => 0.0,
            'avgRoi' => $agg['rois'] ? round(array_sum($agg['rois']) / count($agg['rois']), 2) : null,
            'spendSamples' => count($agg['rois']),
            'catalogBaht' => round(expected_commission_baht($agg['price'], $agg['rate']), 1),
            'confidence' => $samples >= 5 ? 'solid' : ($samples >= 2 ? 'ok' : 'thin'),
            'band' => $samples >= 2 ? 'watch' : 'watch',
            'tip' => "n={$samples} — ช่วงทดลอง ฿{$rangeLow}–{$rangeHigh}",
        ];
    }

    usort($productsOut, static function ($a, $b) {
        $bandRank = ['promising' => 0, 'watch' => 1, 'cold' => 2, 'no_data' => 3];
        $ar = $bandRank[$a['band']] ?? 9;
        $br = $bandRank[$b['band']] ?? 9;
        if ($ar !== $br) return $ar <=> $br;
        $aw = $a['rangeMid'] * ($a['confidence'] === 'solid' ? 1.2 : ($a['confidence'] === 'ok' ? 1.0 : 0.6));
        $bw = $b['rangeMid'] * ($b['confidence'] === 'solid' ? 1.2 : ($b['confidence'] === 'ok' ? 1.0 : 0.6));
        if ($bw != $aw) return $bw <=> $aw;
        return $b['catalogBaht'] <=> $a['catalogBaht'];
    });

    // Projections for today's draft/approved
    $stmt = db()->prepare(
        "SELECT s.*, p.name AS product_name, p.price, p.commission_rate
         FROM schedule s LEFT JOIN products p ON p.id=s.product_id
         WHERE s.post_date=? AND s.status IN ('draft','approved')
         ORDER BY s.suggested_time"
    );
    $stmt->execute([$date]);
    $todaySlots = $stmt->fetchAll();
    $histById = [];
    foreach ($productsOut as $row) {
        $histById[$row['productId']] = $row;
    }
    $projections = [];
    foreach ($todaySlots as $s) {
        $pid = (string)$s['product_id'];
        $hist = $histById[$pid] ?? null;
        $name = (string)($s['product_name'] ?: $pid);
        $ch = channel_label((string)$s['channel']);
        if ($hist && $hist['samples'] >= 2) {
            $low = $hist['rangeLow'];
            $mid = $hist['rangeMid'];
            $high = $hist['rangeHigh'];
            $conf = $hist['confidence'];
            $basis = 'จากประวัติ ' . $hist['samples'] . ' โพสต์ของสินค้านี้';
        } elseif ($hist && $hist['samples'] === 1) {
            $mid = $hist['rangeMid'];
            $low = round($mid * 0.5, 1);
            $high = round($mid * 1.5, 1);
            $conf = 'thin';
            $basis = 'จาก 1 โพสต์ก่อนหน้า (ช่วงกว้าง — ทดลอง)';
        } elseif ($avgCommission > 0) {
            $mid = round($avgCommission, 1);
            $low = round($avgCommission * 0.4, 1);
            $high = round($avgCommission * 1.6, 1);
            $conf = count($posted) >= 5 ? 'solid' : (count($posted) >= 2 ? 'ok' : 'thin');
            $basis = 'จากค่าเฉลี่ยทั้งแล็บ (' . count($posted) . ' โพสต์ในหน้าต่าง)';
        } else {
            $catalog = expected_commission_baht((float)($s['price'] ?? 0), (float)($s['commission_rate'] ?? 0));
            $mid = round($catalog * 0.3, 1);
            $low = 0.0;
            $high = round($catalog * 0.8, 1);
            $conf = 'thin';
            $basis = 'ยังไม่มีเมตริก — ใช้ค่าคอมแคตตาล็อกแบบลดน้ำหนัก (prior ทดลอง)';
        }
        $projections[] = [
            'scheduleId' => $s['id'],
            'productId' => $pid,
            'productName' => $name,
            'channel' => $s['channel'],
            'channelLabel' => $ch,
            'status' => $s['status'],
            'date' => $s['post_date'],
            'projectedMid' => $mid,
            'projectedLow' => $low,
            'projectedHigh' => $high,
            'confidence' => $conf,
            'basis' => $basis,
            'tip' => $s['status'] === 'draft'
                ? 'ยังเป็น draft — ตรวจ disclosure แล้ว Approve ก่อนโพสต์มือ'
                : 'Approve แล้ว — คัดลอกไปโพสต์ด้วยมือ แล้ว Mark posted + กรอกผล',
        ];
    }
    usort($projections, static fn($a, $b) => $b['projectedMid'] <=> $a['projectedMid']);

    $promising = count(array_filter($productsOut, fn($p) => $p['band'] === 'promising'));
    $thin = count(array_filter($productsOut, fn($p) => $p['samples'] > 0 && $p['confidence'] === 'thin'));
    $withData = count(array_filter($productsOut, fn($p) => $p['samples'] > 0));

    $score = 35;
    $score += min(25, count($posted) * 4);
    $score += min(15, $withData * 3);
    $score += min(10, $promising * 5);
    $score += min(10, count($roiSamples) * 3);
    if (!count($posted)) $score = min($score, 40);
    if ($baseline['avgRoi'] !== null && $baseline['avgRoi'] < 0) $score -= 8;
    $score = (int)max(0, min(100, round($score)));
    $grade = $score >= 85 ? 'A' : ($score >= 70 ? 'B' : ($score >= 50 ? 'C' : 'D'));

    $summary = !count($posted)
        ? 'Soft ROI Lab: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลหลังโพสต์มือก่อน ช่วงคาดการณ์ยังเป็น prior ทดลอง'
        : 'Soft ROI Lab: ' . count($posted) . ' โพสต์มีเมตริก · สินค้าที่มีข้อมูล ' . $withData
            . ' · ช่วงค่าคอมเฉลี่ย/โพสต์ ~฿' . $baseline['avgCommissionPerPost'] . ' (ทดลอง ไม่การันตี)';

    $actions = [];
    if (!count($posted)) {
        $actions[] = [
            'id' => 'fill-first',
            'title' => 'กรอกผลโพสต์แรก',
            'detail' => 'Approve → โพสต์มือ → Mark posted → กรอก views/clicks/orders/ค่าคอม',
        ];
    } else {
        $actions[] = [
            'id' => 'log-spend',
            'title' => 'บันทึกต้นทุนโปรโมทเมื่อมี',
            'detail' => 'ใส่ promo spend ในเมตริกเพื่อคำนวณ ROI% จริง — ถ้าไม่กรอก ระบบจะไม่เคลม ROI',
        ];
    }
    if ($promising > 0) {
        $actions[] = [
            'id' => 'test-promising',
            'title' => 'ทดลองสินค้ากลุ่มน่าลอง',
            'detail' => "มี {$promising} ชิ้นสัญญาณดี — ใช้ hook ใหม่ 1 แบบต่อชิ้น ไม่สแปมข้อความเดิม",
        ];
    }
    if ($thin > 0) {
        $actions[] = [
            'id' => 'thicken-data',
            'title' => 'เพิ่มตัวอย่างก่อนสรุป',
            'detail' => "{$thin} สินค้าข้อมูลยังบาง — อ่านช่วงค่าคอมแบบสมมติฐาน ไม่ใช่เป้าขาย",
        ];
    }
    $actions[] = [
        'id' => 'no-guarantee',
        'title' => 'ไม่ใช้ตัวเลขนี้การันตีรายได้',
        'detail' => INCOME_DISCLAIMER,
    ];

    $checklist = [
        'ทุกตัวเลขในแล็บมาจากเมตริกที่คุณกรอกเอง — ไม่ดึงจาก API แพลตฟอร์ม',
        'ช่วง low/mid/high เป็นค่าทดลอง (percentile) ไม่ใช่คำสัญญา',
        'ROI% คำนวณเฉพาะโพสต์ที่มี promo spend > 0',
        'โพสต์จริงต้องมี disclosure และต้อง Approve ก่อน — ระบบไม่โพสต์อัตโนมัติ',
        'ถ้าข้อมูลบาง (n<2) ให้ทดลองต่อ ไม่ล็อคมุมขาย',
    ];

    $bandLabel = ['promising' => 'น่าลอง', 'watch' => 'เฝ้าดู', 'cold' => 'อ่อน', 'no_data' => 'ยังไม่มีข้อมูล'];
    $confLabel = ['thin' => 'ข้อมูลบาง', 'ok' => 'พอใช้', 'solid' => 'หนาขึ้น'];
    $lines = ["Soft ROI Lab {$date}: เกรด {$grade} ({$score}/100) · {$summary}"];
    if ($baseline['avgRoi'] !== null) {
        $lines[] = 'ROI เฉลี่ยจากต้นทุนที่กรอก ~' . round($baseline['avgRoi'] * 100, 1) . '% (n=' . count($roiSamples) . ') — ทดลอง';
    } elseif (count($posted) > 0) {
        $lines[] = 'ยังไม่มี promo spend — ยังคำนวณ ROI% ไม่ได้ (แสดงแค่ช่วงค่าคอม/โพสต์)';
    }
    $withSamples = array_values(array_filter($productsOut, fn($p) => $p['samples'] > 0));
    foreach (array_slice($withSamples, 0, 3) as $p) {
        $lines[] = ($bandLabel[$p['band']] ?? $p['band']) . ' · ' . $p['productName']
            . ': ฿' . $p['rangeLow'] . '–' . $p['rangeHigh'] . '/โพสต์ ('
            . ($confLabel[$p['confidence']] ?? $p['confidence']) . ', n=' . $p['samples'] . ')';
    }
    foreach (array_slice($projections, 0, 2) as $pr) {
        $lines[] = 'คาดการณ์ทดลองวันนี้ · ' . $pr['productName'] . ' (' . $pr['channelLabel'] . '): ~฿'
            . $pr['projectedMid'] . ' [' . $pr['projectedLow'] . '–' . $pr['projectedHigh'] . ']';
    }
    $lines[] = INCOME_DISCLAIMER;

    return [
        'date' => $date,
        'fromDate' => $from,
        'windowDays' => $window,
        'grade' => $grade,
        'score' => $score,
        'summary' => $summary,
        'counts' => [
            'postsWithMetrics' => count($posted),
            'productsWithData' => $withData,
            'spendTracked' => count($roiSamples),
            'promising' => $promising,
            'thin' => $thin,
            'projections' => count($projections),
        ],
        'baseline' => $baseline,
        'products' => $productsOut,
        'projections' => $projections,
        'actions' => array_slice($actions, 0, 5),
        'checklist' => $checklist,
        'lines' => $lines,
        'disclaimer' => INCOME_DISCLAIMER,
    ];
}

function soft_roi_lab_to_markdown(array $lab): string
{
    $bandLabel = ['promising' => 'น่าลอง', 'watch' => 'เฝ้าดู', 'cold' => 'อ่อน', 'no_data' => 'ยังไม่มีข้อมูล'];
    $confLabel = ['thin' => 'ข้อมูลบาง', 'ok' => 'พอใช้', 'solid' => 'หนาขึ้น'];
    $productRows = [];
    $idx = 0;
    foreach ($lab['products'] as $p) {
        if (($p['samples'] ?? 0) <= 0) continue;
        $idx++;
        $band = $bandLabel[$p['band']] ?? $p['band'];
        $conf = $confLabel[$p['confidence']] ?? $p['confidence'];
        $roi = $p['avgRoi'] !== null
            ? ' · ROI ~' . round($p['avgRoi'] * 100, 1) . '% (มีต้นทุน)'
            : ' · ยังไม่มี ROI% (ไม่กรอกต้นทุน)';
        $productRows[] = "{$idx}. **[{$band}]** {$p['productName']} · n={$p['samples']} · {$conf}\n"
            . "   ช่วงค่าคอม/โพสต์ (ทดลอง): ฿{$p['rangeLow']} – ฿{$p['rangeMid']} – ฿{$p['rangeHigh']}\n"
            . '   CTR ~' . round($p['avgCtr'] * 100, 1) . '% · ออเดอร์/คลิก ~' . $p['avgOrdersPerClick'] . $roi . "\n"
            . "   {$p['tip']}";
    }
    if (!$productRows) {
        $productRows[] = '_(ยังไม่มีเมตริก — กรอกผลหลังโพสต์มือ)_';
    }
    $projectionRows = [];
    foreach ($lab['projections'] as $i => $p) {
        $n = $i + 1;
        $conf = $confLabel[$p['confidence']] ?? $p['confidence'];
        $projectionRows[] = "{$n}. {$p['productName']} · {$p['channelLabel']} · {$p['status']}\n"
            . "   คาดการณ์ทดลอง: ~฿{$p['projectedMid']} [{$p['projectedLow']}–{$p['projectedHigh']}] ({$conf})\n"
            . "   ฐาน: {$p['basis']}\n"
            . "   {$p['tip']}";
    }
    if (!$projectionRows) {
        $projectionRows[] = '_(ไม่มี draft/approved วันนี้)_';
    }
    $actionLines = [];
    foreach ($lab['actions'] as $a) {
        $actionLines[] = "- **{$a['title']}**: {$a['detail']}";
    }
    $checkLines = [];
    foreach ($lab['checklist'] as $c) {
        $checkLines[] = "- {$c}";
    }
    $roiLine = $lab['baseline']['avgRoi'] !== null
        ? '- ROI เฉลี่ย (มีต้นทุน): ~' . round($lab['baseline']['avgRoi'] * 100, 1) . "%\n"
        : "- ROI%: ยังคำนวณไม่ได้ (ยังไม่กรอก promo spend)\n";

    return "# Soft ROI Lab · {$lab['date']}\n\n"
        . $lab['summary'] . "\n\n"
        . "- เกรดแล็บ: {$lab['grade']} ({$lab['score']}/100)\n"
        . "- หน้าต่าง: {$lab['fromDate']} → {$lab['date']} ({$lab['windowDays']} วัน)\n"
        . "- โพสต์มีเมตริก: {$lab['counts']['postsWithMetrics']}\n"
        . "- สินค้าที่มีข้อมูล: {$lab['counts']['productsWithData']}\n"
        . "- มีต้นทุนโปรโมท: {$lab['counts']['spendTracked']}\n"
        . '- CTR เฉลี่ย: ~' . round($lab['baseline']['avgCtr'] * 100, 1) . "%\n"
        . "- ค่าคอมเฉลี่ย/โพสต์: ~฿{$lab['baseline']['avgCommissionPerPost']}\n"
        . $roiLine . "\n"
        . "## สินค้าในช่วงทดลอง\n"
        . implode("\n", $productRows) . "\n\n"
        . "## คาดการณ์คิววันนี้ (ทดลอง)\n"
        . implode("\n", $projectionRows) . "\n\n"
        . "## Actions\n"
        . implode("\n", $actionLines) . "\n\n"
        . "## Checklist\n"
        . implode("\n", $checkLines) . "\n\n"
        . "> ตัวเลขทั้งหมดเป็นการทดลองจากข้อมูลที่กรอก — ไม่รับประกันรายได้ และระบบไม่โพสต์อัตโนมัติ\n\n"
        . $lab['disclaimer'] . "\n";
}

/**
 * Winner Playbook — keep/stop/try from posted metrics (soft, never auto-publish).
 * @return array{date:string,windowDays:int,samplePosts:int,summary:string,keepDoing:array,stopOrPause:array,channelTips:array,hookTips:array,ctaTips:array,timeTips:array,experiments:array,checklist:array,lines:array,disclaimer:string}
 */
function build_winner_playbook(?string $date = null, int $windowDays = 14): array
{
    $date = $date ?: today_iso();
    $window = max(7, min(30, $windowDays));
    $from = date('Y-m-d', strtotime($date . ' -' . ($window - 1) . ' days'));
    $stmt = db()->prepare("SELECT s.*, p.name AS product_name, p.active FROM schedule s LEFT JOIN products p ON p.id=s.product_id WHERE s.post_date BETWEEN ? AND ? AND s.metrics_at IS NOT NULL");
    $stmt->execute([$from, $date]);
    $rows = $stmt->fetchAll() ?: [];

    $byProduct = [];
    $byChannel = [];
    $byHook = [];
    $byCta = [];
    $byTime = [];
    foreach ($rows as $r) {
        $pid = (string)$r['product_id'];
        $views = max((int)$r['views'], 0);
        $clicks = max((int)$r['clicks'], 0);
        $orders = max((int)$r['orders_count'], 0);
        $commission = max((float)$r['commission_earned'], 0);
        $ctr = $views > 0 ? $clicks / $views : 0;
        $opc = $clicks > 0 ? $orders / $clicks : 0;
        $score = $ctr * 40 + $opc * 30 + min($commission / 100, 1) * 30;
        if (!isset($byProduct[$pid])) {
            $byProduct[$pid] = [
                'productId' => $pid,
                'productName' => (string)($r['product_name'] ?? $pid),
                'posts' => 0,
                'orders' => 0,
                'commission' => 0.0,
                'ctrSum' => 0.0,
                'scoreSum' => 0.0,
                'active' => (int)($r['active'] ?? 1) === 1,
            ];
        }
        $byProduct[$pid]['posts']++;
        $byProduct[$pid]['orders'] += $orders;
        $byProduct[$pid]['commission'] += $commission;
        $byProduct[$pid]['ctrSum'] += $ctr;
        $byProduct[$pid]['scoreSum'] += $score;

        $ch = (string)$r['channel'];
        if (!isset($byChannel[$ch])) $byChannel[$ch] = ['n' => 0, 'score' => 0.0];
        $byChannel[$ch]['n']++;
        $byChannel[$ch]['score'] += $score;

        $hook = (int)$r['hook_index'];
        if (!isset($byHook[$hook])) $byHook[$hook] = ['n' => 0, 'score' => 0.0];
        $byHook[$hook]['n']++;
        $byHook[$hook]['score'] += $score;

        $cta = (int)$r['cta_index'];
        if (!isset($byCta[$cta])) $byCta[$cta] = ['n' => 0, 'score' => 0.0];
        $byCta[$cta]['n']++;
        $byCta[$cta]['score'] += $score;

        $time = (string)$r['suggested_time'];
        if ($time !== '') {
            if (!isset($byTime[$time])) $byTime[$time] = ['n' => 0, 'score' => 0.0];
            $byTime[$time]['n']++;
            $byTime[$time]['score'] += $score;
        }
    }

    uasort($byProduct, fn($a, $b) => ($b['scoreSum'] / max($b['posts'], 1)) <=> ($a['scoreSum'] / max($a['posts'], 1)));
    $keepDoing = [];
    foreach (array_slice($byProduct, 0, 3, true) as $row) {
        $avgCtr = $row['posts'] > 0 ? $row['ctrSum'] / $row['posts'] : 0;
        $keepDoing[] = [
            'productId' => $row['productId'],
            'productName' => $row['productName'],
            'why' => 'โพสต์ ' . $row['posts'] . ' ชิ้น · ออเดอร์ ' . $row['orders']
                . ' · ค่าคอมที่กรอก ฿' . number_format($row['commission'], 0)
                . ' · CTR เฉลี่ย ~' . number_format($avgCtr * 100, 1) . '%',
            'sampleSize' => $row['posts'],
            'commission' => $row['commission'],
            'orders' => $row['orders'],
            'avgCtr' => $avgCtr,
        ];
    }

    $stopOrPause = [];
    foreach ($byProduct as $row) {
        if (!$row['active']) continue;
        if ($row['posts'] < 2) continue;
        if ($row['orders'] === 0 && $row['commission'] <= 0) {
            $stopOrPause[] = [
                'productId' => $row['productId'],
                'productName' => $row['productName'],
                'why' => 'โพสต์ ' . $row['posts'] . ' ชิ้นแล้วยังไม่มีออเดอร์/ค่าคอม — พิจารณาพักหรือเปลี่ยนมุมขาย (ไม่พักอัตโนมัติ)',
            ];
        }
        if (count($stopOrPause) >= 5) break;
    }

    $channelTips = [];
    if ($byChannel) {
        uasort($byChannel, fn($a, $b) => ($b['score'] / max($b['n'], 1)) <=> ($a['score'] / max($a['n'], 1)));
        $channels = array_keys($byChannel);
        $best = $channels[0];
        $channelTips[] = [
            'channel' => $best,
            'label' => channel_label($best),
            'tip' => 'คะแนนเฉลี่ยดีกว่าในชุดข้อมูลนี้ (n=' . $byChannel[$best]['n'] . ') — ลองจัดสล็อตคุณภาพก่อน',
        ];
        $weak = $channels[count($channels) - 1];
        if ($weak !== $best) {
            $channelTips[] = [
                'channel' => $weak,
                'label' => channel_label($weak),
                'tip' => 'อ่อนกว่าช่องอื่น (n=' . $byChannel[$weak]['n'] . ') — อย่าถี่ขึ้น ให้ปรับ hook/CTA ก่อน',
            ];
        }
    }

    $hookTips = [];
    if (count($byHook) >= 2) {
        uasort($byHook, fn($a, $b) => ($b['score'] / max($b['n'], 1)) <=> ($a['score'] / max($a['n'], 1)));
        $bestHook = array_key_first($byHook);
        $hookTips[] = 'ในหน้าต่างนี้ hook #' . ((int)$bestHook + 1) . ' คะแนนเฉลี่ยดีกว่า (n=' . $byHook[$bestHook]['n'] . ') — ใช้เป็นสมมติฐานทดสอบ ไม่ใช่การันตี';
    } else {
        $hookTips[] = 'ยังไม่พอข้อมูลเปรียบเทียบ hook — อนุมัติ draft แล้วลองคนละ hook 1–2 ชิ้น';
    }

    $ctaTips = [];
    if (count($byCta) >= 2) {
        uasort($byCta, fn($a, $b) => ($b['score'] / max($b['n'], 1)) <=> ($a['score'] / max($a['n'], 1)));
        $bestCta = array_key_first($byCta);
        $ctaTips[] = 'ในหน้าต่างนี้ CTA #' . ((int)$bestCta + 1) . ' คะแนนเฉลี่ยดีกว่า (n=' . $byCta[$bestCta]['n'] . ') — ทดลอง ไม่การันตี';
    } else {
        $ctaTips[] = 'ยังไม่พอข้อมูล CTA — ใช้ CTA อ่อนโยน + disclosure ทุกครั้ง';
    }

    $timeTips = [];
    if (count($byTime) >= 2) {
        uasort($byTime, fn($a, $b) => ($b['score'] / max($b['n'], 1)) <=> ($a['score'] / max($a['n'], 1)));
        $bestTime = array_key_first($byTime);
        $timeTips[] = 'สล็อต ' . $bestTime . ' คะแนนเฉลี่ยดีกว่า (n=' . $byTime[$bestTime]['n'] . ') — ทดลองไม่บังคับ';
    } else {
        $timeTips[] = 'ยังไม่พอข้อมูลช่วงเวลา — โพสต์ตามตาราง draft 2–3 ชิ้น/วันพอ';
    }

    $experiments = [];
    if ($keepDoing) {
        $experiments[] = [
            'title' => 'ต่อยอด “' . $keepDoing[0]['productName'] . '” ด้วย hook ใหม่',
            'detail' => 'Approve draft ที่ใช้ hook คนละแบบจากเดิม 1 ชิ้น แล้วกรอกผลเย็น — อย่าโพสต์ซ้ำแคปชันเดิม',
        ];
    }
    if ($stopOrPause) {
        $experiments[] = [
            'title' => 'พัก “' . $stopOrPause[0]['productName'] . '” แล้วโฟกัส keep',
            'detail' => 'กดพักเองที่หน้าสินค้า (ระบบไม่พักอัตโนมัติ) แล้วโฟกัสสินค้าที่ keep doing',
        ];
    }
    if (!$experiments) {
        $experiments[] = [
            'title' => 'เก็บข้อมูลคุณภาพก่อนขยาย',
            'detail' => 'รัน Morning → Approve 1–2 draft → โพสต์มือ → กรอกผลเย็น แล้วค่อยอ่าน Playbook ใหม่',
        ];
    }

    $checklist = [
        'ตรวจ disclosure ทุกแคปชันก่อน Approve',
        'โพสต์ด้วยมือหลัง Approve เท่านั้น — ระบบไม่โพสต์ให้อัตโนมัติ',
        'อย่าโพสต์ซ้ำข้อความเดิมในวันเดียว',
        'กรอก views/clicks/orders/ค่าคอมเย็นนี้เพื่ออัปเดต Playbook',
        'ถ้าสินค้าอ่อนต่อเนื่อง ให้พักเอง ไม่ต้องเพิ่มรอบ',
    ];

    $samplePosts = count($rows);
    $summary = $samplePosts === 0
        ? "Winner Playbook {$date}: ยังไม่มีเมตริกใน {$window} วัน — เก็บผลจริงก่อนสรุป keep/stop"
        : "Winner Playbook {$date}: จาก {$samplePosts} โพสต์/{$window} วัน · keep " . count($keepDoing) . ' · พิจารณาพัก ' . count($stopOrPause) . ' (ทดลอง ไม่การันตีรายได้)';

    $lines = ["Winner Playbook {$date}: {$summary}"];
    foreach (array_slice($keepDoing, 0, 3) as $i => $k) {
        $lines[] = 'Keep ' . ($i + 1) . ') ' . $k['productName'] . ' — ' . $k['why'];
    }
    foreach (array_slice($stopOrPause, 0, 2) as $s) {
        $lines[] = 'Stop/พัก: ' . $s['productName'] . ' — ' . $s['why'];
    }
    if ($channelTips) {
        $lines[] = 'ช่องทาง: ' . $channelTips[0]['label'] . ' — ' . $channelTips[0]['tip'];
    }
    foreach (array_slice($experiments, 0, 2) as $e) {
        $lines[] = 'ทดลอง: ' . $e['title'];
    }
    $lines[] = 'Playbook เป็นสมมติฐานจากข้อมูลที่กรอก — ไม่โพสต์อัตโนมัติและไม่การันตีรายได้';

    return [
        'date' => $date,
        'windowDays' => $window,
        'samplePosts' => $samplePosts,
        'summary' => $summary,
        'keepDoing' => $keepDoing,
        'stopOrPause' => $stopOrPause,
        'channelTips' => $channelTips,
        'hookTips' => $hookTips,
        'ctaTips' => $ctaTips,
        'timeTips' => $timeTips,
        'experiments' => $experiments,
        'checklist' => $checklist,
        'lines' => $lines,
        'disclaimer' => INCOME_DISCLAIMER,
    ];
}

function winner_playbook_to_markdown(array $playbook): string
{
    $keep = [];
    foreach ($playbook['keepDoing'] as $i => $k) {
        $n = $i + 1;
        $keep[] = "{$n}. **{$k['productName']}**\n   {$k['why']}\n   ออเดอร์ {$k['orders']} · ค่าคอม ฿" . number_format((float)$k['commission'], 0) . ' · CTR ~' . number_format(((float)$k['avgCtr']) * 100, 1) . '%';
    }
    if (!$keep) $keep[] = '_(ยังไม่มีสินค้า keep — เก็บเมตริกต่อ)_';

    $stop = [];
    foreach ($playbook['stopOrPause'] as $i => $s) {
        $n = $i + 1;
        $stop[] = "{$n}. **{$s['productName']}** — {$s['why']}";
    }
    if (!$stop) $stop[] = '_(ยังไม่มีคำแนะนำพัก)_';

    $channels = [];
    foreach ($playbook['channelTips'] as $c) {
        $channels[] = "- **{$c['label']}**: {$c['tip']}";
    }
    if (!$channels) $channels[] = '_(ยังไม่พอข้อมูลช่องทาง)_';

    $experiments = [];
    foreach ($playbook['experiments'] as $i => $e) {
        $n = $i + 1;
        $experiments[] = "{$n}. **{$e['title']}**\n   {$e['detail']}";
    }
    $checklist = array_map(fn($c) => '- ' . $c, $playbook['checklist']);

    return "# Winner Playbook · {$playbook['date']}\n\n"
        . $playbook['summary'] . "\n\n"
        . "หน้าต่างข้อมูล: {$playbook['windowDays']} วัน · โพสต์ที่มีเมตริก: {$playbook['samplePosts']}\n\n"
        . "## Keep doing\n" . implode("\n", $keep) . "\n\n"
        . "## Stop / พักชั่วคราว\n" . implode("\n", $stop) . "\n\n"
        . "## ช่องทาง\n" . implode("\n", $channels) . "\n\n"
        . "## Hook\n" . implode("\n", array_map(fn($t) => '- ' . $t, $playbook['hookTips'])) . "\n\n"
        . "## CTA\n" . implode("\n", array_map(fn($t) => '- ' . $t, $playbook['ctaTips'])) . "\n\n"
        . "## ช่วงเวลา\n" . implode("\n", array_map(fn($t) => '- ' . $t, $playbook['timeTips'])) . "\n\n"
        . "## ทดลองถัดไป\n" . implode("\n", $experiments) . "\n\n"
        . "## Checklist\n" . implode("\n", $checklist) . "\n\n"
        . "> ระบบไม่โพสต์อัตโนมัติ — Approve แล้วต้องโพสต์ด้วยมือ\n\n"
        . $playbook['disclaimer'] . "\n";
}

/**
 * Weekly Review Brief — rolling 7-day retrospective from manual metrics.
 * Soft experimental insights only; never auto-publishes or claims guaranteed income.
 * @return array{date:string,fromDate:string,windowDays:int,summary:string,totals:array,topPosts:array,weakPosts:array,channelMix:array,productLeaders:array,dataGaps:array,nextWeekFocus:array,checklist:array,lines:array,disclaimer:string}
 */
function build_weekly_review(?string $date = null, int $windowDays = 7): array
{
    $date = $date ?: today_iso();
    $window = max(3, min(14, $windowDays));
    $from = date('Y-m-d', strtotime($date . ' -' . ($window - 1) . ' days'));

    $stmt = db()->prepare('SELECT s.*, p.name AS product_name, p.active FROM schedule s LEFT JOIN products p ON p.id=s.product_id WHERE s.post_date BETWEEN ? AND ?');
    $stmt->execute([$from, $date]);
    $rows = $stmt->fetchAll() ?: [];

    $scheduled = count($rows);
    $posted = 0;
    $withMetrics = [];
    $missingMetrics = 0;
    foreach ($rows as $r) {
        if ((string)$r['status'] === 'posted') {
            $posted++;
            if (empty($r['metrics_at'])) {
                $missingMetrics++;
            }
        }
        if (!empty($r['metrics_at'])) {
            $withMetrics[] = $r;
        }
    }

    $views = 0;
    $clicks = 0;
    $orders = 0;
    $commission = 0.0;
    $ctrSum = 0.0;
    $perfs = [];
    $byChannel = [];
    $byProduct = [];

    foreach ($withMetrics as $r) {
        $v = max((int)$r['views'], 0);
        $c = max((int)$r['clicks'], 0);
        $o = max((int)$r['orders_count'], 0);
        $comm = max((float)$r['commission_earned'], 0);
        $ctr = $v > 0 ? $c / $v : 0;
        $opc = $c > 0 ? $o / $c : 0;
        $score = $ctr * 40 + $opc * 30 + min($comm / 100, 1) * 30;
        $views += $v;
        $clicks += $c;
        $orders += $o;
        $commission += $comm;
        $ctrSum += $ctr;
        $pid = (string)$r['product_id'];
        $name = (string)($r['product_name'] ?? $pid);
        $perfs[] = [
            'scheduleId' => (string)$r['id'],
            'productId' => $pid,
            'productName' => $name,
            'channel' => (string)$r['channel'],
            'date' => (string)$r['post_date'],
            'commission' => $comm,
            'orders' => $o,
            'ctr' => $ctr,
            'score' => $score,
        ];
        $ch = (string)$r['channel'];
        if (!isset($byChannel[$ch])) {
            $byChannel[$ch] = ['n' => 0, 'score' => 0.0, 'commission' => 0.0, 'orders' => 0];
        }
        $byChannel[$ch]['n']++;
        $byChannel[$ch]['score'] += $score;
        $byChannel[$ch]['commission'] += $comm;
        $byChannel[$ch]['orders'] += $o;

        if (!isset($byProduct[$pid])) {
            $byProduct[$pid] = [
                'productId' => $pid,
                'productName' => $name,
                'posts' => 0,
                'orders' => 0,
                'commission' => 0.0,
                'scoreSum' => 0.0,
            ];
        }
        $byProduct[$pid]['posts']++;
        $byProduct[$pid]['orders'] += $o;
        $byProduct[$pid]['commission'] += $comm;
        $byProduct[$pid]['scoreSum'] += $score;
    }

    usort($perfs, fn($a, $b) => $b['score'] <=> $a['score']);
    $avgCtr = count($withMetrics) > 0 ? $ctrSum / count($withMetrics) : 0;

    $topPosts = [];
    foreach (array_slice($perfs, 0, 3) as $p) {
        $whyParts = [
            channel_label($p['channel']) . ' · ' . $p['date'],
            'CTR ~' . number_format($p['ctr'] * 100, 1) . '%',
            $p['commission'] > 0
                ? 'ค่าคอมที่กรอก ฿' . number_format($p['commission'], 0)
                : 'ยังไม่มีค่าคอม',
            $p['orders'] > 0 ? 'ออเดอร์ ' . $p['orders'] : 'ยังไม่มีออเดอร์',
        ];
        $topPosts[] = [
            'scheduleId' => $p['scheduleId'],
            'productId' => $p['productId'],
            'productName' => $p['productName'],
            'channel' => $p['channel'],
            'channelLabel' => channel_label($p['channel']),
            'date' => $p['date'],
            'why' => implode(' · ', $whyParts),
            'commission' => $p['commission'],
            'orders' => $p['orders'],
            'ctr' => $p['ctr'],
            'score' => $p['score'],
        ];
    }

    $weakPosts = [];
    $weakCandidates = array_reverse($perfs);
    foreach ($weakCandidates as $p) {
        if ($p['commission'] > 0 || $p['orders'] > 0) {
            continue;
        }
        $weakPosts[] = [
            'scheduleId' => $p['scheduleId'],
            'productId' => $p['productId'],
            'productName' => $p['productName'],
            'channel' => $p['channel'],
            'channelLabel' => channel_label($p['channel']),
            'date' => $p['date'],
            'why' => 'คะแนนอ่อน · CTR ~' . number_format($p['ctr'] * 100, 1) . '% — พิจารณาเปลี่ยน hook/มุมขาย ไม่ต้องเพิ่มความถี่',
            'commission' => $p['commission'],
            'orders' => $p['orders'],
            'ctr' => $p['ctr'],
            'score' => $p['score'],
        ];
        if (count($weakPosts) >= 3) {
            break;
        }
    }

    $channelMix = [];
    if ($byChannel) {
        uasort($byChannel, fn($a, $b) => ($b['score'] / max($b['n'], 1)) <=> ($a['score'] / max($a['n'], 1)));
        $idx = 0;
        $nCh = count($byChannel);
        foreach ($byChannel as $ch => $row) {
            $tip = 'รักษาคุณภาพแคปชัน + disclosure ทุกครั้ง';
            if ($idx === 0 && $nCh > 1) {
                $tip = 'ช่องนี้คะแนนเฉลี่ยดีกว่าในสัปดาห์นี้ — จัดสล็อตคุณภาพก่อน (ทดลอง)';
            } elseif ($idx === $nCh - 1 && $nCh > 1) {
                $tip = 'อ่อนกว่าช่องอื่น — ปรับ hook/CTA ก่อนเพิ่มรอบ (ห้ามสแปม)';
            }
            $channelMix[] = [
                'channel' => $ch,
                'label' => channel_label($ch),
                'posts' => $row['n'],
                'commission' => $row['commission'],
                'orders' => $row['orders'],
                'avgScore' => $row['score'] / max($row['n'], 1),
                'tip' => $tip,
            ];
            $idx++;
        }
    }

    uasort($byProduct, fn($a, $b) => ($b['scoreSum'] / max($b['posts'], 1)) <=> ($a['scoreSum'] / max($a['posts'], 1)));
    $productLeaders = [];
    foreach (array_slice($byProduct, 0, 3, true) as $row) {
        $productLeaders[] = [
            'productId' => $row['productId'],
            'productName' => $row['productName'],
            'commission' => $row['commission'],
            'orders' => $row['orders'],
            'posts' => $row['posts'],
        ];
    }

    $dataGaps = [];
    if ($scheduled === 0) {
        $dataGaps[] = 'ยังไม่มีโพสต์ในหน้าต่างนี้ — รัน Morning แล้ว Approve ก่อนโพสต์มือ';
    }
    if ($missingMetrics > 0) {
        $dataGaps[] = "โพสต์ที่ mark แล้วแต่ยังไม่กรอกผล {$missingMetrics} ชิ้น — กรอก views/clicks/orders/ค่าคอมที่หน้า Results";
    }
    if (count($withMetrics) === 0 && $posted > 0) {
        $dataGaps[] = 'มีโพสต์แล้วแต่ยังไม่มีเมตริก — Weekly Review จะแม่นขึ้นหลังกรอกผล';
    }
    if (count($withMetrics) > 0 && count($withMetrics) < 3) {
        $dataGaps[] = 'ตัวอย่างเมตริกยังน้อย (n=' . count($withMetrics) . ') — อ่านแนวโน้มเบา ๆ อย่าสรุปหนัก';
    }
    $activeCount = 0;
    foreach (all_products() as $p) {
        if ((int)($p['active'] ?? 1) === 1) {
            $activeCount++;
        }
    }
    if ($activeCount < 3) {
        $dataGaps[] = 'สินค้าที่ใช้งานน้อยกว่า 3 — เพิ่มรายการ manual เพื่อกระจายการทดลอง';
    }
    if (!$dataGaps) {
        $dataGaps[] = 'ข้อมูลครบพอสำหรับรีวิวสัปดาห์นี้ — ใช้เป็นสมมติฐานทดสอบ ไม่การันตีรายได้';
    }

    $nextWeekFocus = [];
    if ($productLeaders) {
        $nextWeekFocus[] = [
            'id' => 'double-down',
            'title' => 'ต่อยอด “' . $productLeaders[0]['productName'] . '” ด้วย hook ใหม่',
            'detail' => 'Approve draft คนละ hook จากเดิม 1 ชิ้น แล้วกรอกผล — อย่าโพสต์ซ้ำแคปชันเดิม',
        ];
    }
    if ($weakPosts) {
        $nextWeekFocus[] = [
            'id' => 'rescue-or-pause',
            'title' => 'ทบทวน “' . $weakPosts[0]['productName'] . '”',
            'detail' => 'เปลี่ยน pain point/มุมขาย หรือพักเองชั่วคราว — ระบบไม่พักอัตโนมัติ',
        ];
    }
    if ($channelMix && count($channelMix) > 1) {
        $nextWeekFocus[] = [
            'id' => 'channel-quality',
            'title' => 'โฟกัสคุณภาพที่ ' . $channelMix[0]['label'],
            'detail' => 'จัด 1–2 สล็อตคุณภาพ/วัน ไม่เพิ่มความถี่เกิน maxPostsPerDay',
        ];
    }
    if ($missingMetrics > 0) {
        $nextWeekFocus[] = [
            'id' => 'close-metrics',
            'title' => 'ปิดช่องว่างเมตริกก่อนขยาย',
            'detail' => "กรอกผลที่ขาด {$missingMetrics} ชิ้นก่อนสรุป keep/stop รอบใหม่",
        ];
    }
    if (!$nextWeekFocus) {
        $nextWeekFocus[] = [
            'id' => 'baseline',
            'title' => 'เก็บ baseline คุณภาพก่อนขยาย',
            'detail' => 'Morning → Approve 1–2 draft → โพสต์มือ + disclosure → กรอกผลเย็น',
        ];
    }
    $nextWeekFocus = array_slice($nextWeekFocus, 0, 4);

    $checklist = [
        'ตรวจ disclosure ทุกแคปชันก่อน Approve',
        'โพสต์ด้วยมือหลัง Approve เท่านั้น — ระบบไม่โพสต์ให้อัตโนมัติ',
        'อย่าโพสต์ซ้ำข้อความเดิมในวันเดียว',
        'กรอก views/clicks/orders/ค่าคอมหลังโพสต์เพื่ออัปเดต Weekly Review',
        'ใช้ตัวเลขเป็นสมมติฐานทดลอง — ไม่การันตีรายได้',
    ];

    $nMetrics = count($withMetrics);
    $summary = $nMetrics === 0
        ? "Weekly Review {$date}: ยังไม่มีเมตริกใน {$window} วัน ({$from}–{$date}) — เก็บผลจริงก่อนสรุป"
        : "Weekly Review {$date}: {$nMetrics} โพสต์มีเมตริก · ค่าคอมที่กรอก ฿" . number_format($commission, 0)
            . ' · ออเดอร์ ' . $orders
            . ' · CTR เฉลี่ย ~' . number_format($avgCtr * 100, 1) . '% (ทดลอง ไม่การันตี)';

    $lines = ["Weekly Review {$date}: {$summary}"];
    if ($productLeaders) {
        $lines[] = 'สินค้าเด่นสัปดาห์นี้: ' . $productLeaders[0]['productName']
            . ' · ค่าคอมที่กรอก ฿' . number_format($productLeaders[0]['commission'], 0)
            . ' · ออเดอร์ ' . $productLeaders[0]['orders'];
    }
    if ($topPosts) {
        $lines[] = 'โพสต์เด่น: ' . $topPosts[0]['productName'] . ' @ ' . $topPosts[0]['channelLabel'] . ' — ' . $topPosts[0]['why'];
    }
    if ($channelMix) {
        $lines[] = 'ช่องทางเด่น: ' . $channelMix[0]['label'] . ' (n=' . $channelMix[0]['posts'] . ') — ' . $channelMix[0]['tip'];
    }
    if ($missingMetrics > 0) {
        $lines[] = "ช่องว่างข้อมูล: รอกรอกผล {$missingMetrics} ชิ้นที่ Results";
    }
    foreach (array_slice($nextWeekFocus, 0, 2) as $a) {
        $lines[] = 'โฟกัสสัปดาห์หน้า: ' . $a['title'];
    }
    $lines[] = 'Weekly Review อ่านจากเมตริกที่กรอกเอง — ไม่โพสต์อัตโนมัติและไม่การันตีรายได้';

    return [
        'date' => $date,
        'fromDate' => $from,
        'windowDays' => $window,
        'summary' => $summary,
        'totals' => [
            'scheduled' => $scheduled,
            'posted' => $posted,
            'withMetrics' => $nMetrics,
            'missingMetrics' => $missingMetrics,
            'views' => $views,
            'clicks' => $clicks,
            'orders' => $orders,
            'commission' => $commission,
            'promoSpend' => 0.0,
            'avgCtr' => $avgCtr,
            'roi' => null,
        ],
        'topPosts' => $topPosts,
        'weakPosts' => $weakPosts,
        'channelMix' => $channelMix,
        'productLeaders' => $productLeaders,
        'dataGaps' => $dataGaps,
        'nextWeekFocus' => $nextWeekFocus,
        'checklist' => $checklist,
        'lines' => $lines,
        'disclaimer' => INCOME_DISCLAIMER,
    ];
}

function weekly_review_to_markdown(array $review): string
{
    $t = $review['totals'];
    $top = $review['topPosts']
        ? implode("\n", array_map(function ($p, $i) {
            return ($i + 1) . '. **' . $p['productName'] . '** (' . $p['channelLabel'] . ' · ' . $p['date'] . ') — ' . $p['why'];
        }, $review['topPosts'], array_keys($review['topPosts'])))
        : '- ยังไม่มีโพสต์เด่น';
    $weak = $review['weakPosts']
        ? implode("\n", array_map(function ($p, $i) {
            return ($i + 1) . '. **' . $p['productName'] . '** (' . $p['channelLabel'] . ' · ' . $p['date'] . ') — ' . $p['why'];
        }, $review['weakPosts'], array_keys($review['weakPosts'])))
        : '- ยังไม่มีโพสต์อ่อนชัดเจน';
    $channels = $review['channelMix']
        ? implode("\n", array_map(fn($c) => '- **' . $c['label'] . '** · n=' . $c['posts']
            . ' · ค่าคอม ฿' . number_format($c['commission'], 0)
            . ' · ออเดอร์ ' . $c['orders'] . ' — ' . $c['tip'], $review['channelMix']))
        : '- ยังไม่พอข้อมูลช่องทาง';
    $leaders = $review['productLeaders']
        ? implode("\n", array_map(function ($p, $i) {
            return ($i + 1) . '. **' . $p['productName'] . '** · โพสต์ ' . $p['posts']
                . ' · ออเดอร์ ' . $p['orders']
                . ' · ค่าคอม ฿' . number_format($p['commission'], 0);
        }, $review['productLeaders'], array_keys($review['productLeaders'])))
        : '- ยังไม่มีสินค้าเด่น';
    $focus = implode("\n", array_map(function ($a, $i) {
        return ($i + 1) . '. **' . $a['title'] . '** — ' . $a['detail'];
    }, $review['nextWeekFocus'], array_keys($review['nextWeekFocus'])));
    $gaps = implode("\n", array_map(fn($g) => '- ' . $g, $review['dataGaps']));
    $checklist = implode("\n", array_map(fn($c) => '- [ ] ' . $c, $review['checklist']));

    return "# Weekly Review · {$review['date']}\n\n"
        . $review['summary'] . "\n\n"
        . "หน้าต่าง: {$review['fromDate']} → {$review['date']} ({$review['windowDays']} วัน)\n\n"
        . "## สรุปตัวเลข (จากที่กรอกเอง)\n"
        . "- ตารางในหน้าต่าง: {$t['scheduled']}\n"
        . "- โพสต์แล้ว: {$t['posted']}\n"
        . "- มีเมตริก: {$t['withMetrics']}\n"
        . "- รอกรอกผล: {$t['missingMetrics']}\n"
        . '- Views: ' . number_format($t['views']) . "\n"
        . '- Clicks: ' . number_format($t['clicks']) . "\n"
        . "- Orders: {$t['orders']}\n"
        . '- ค่าคอมที่กรอก: ฿' . number_format($t['commission'], 0) . "\n"
        . '- CTR เฉลี่ย: ~' . number_format($t['avgCtr'] * 100, 1) . "%\n\n"
        . "## สินค้าเด่น\n{$leaders}\n\n"
        . "## โพสต์เด่น\n{$top}\n\n"
        . "## โพสต์ที่ควรทบทวน\n{$weak}\n\n"
        . "## ช่องทาง\n{$channels}\n\n"
        . "## ช่องว่างข้อมูล\n{$gaps}\n\n"
        . "## โฟกัสสัปดาห์หน้า\n{$focus}\n\n"
        . "## Checklist\n{$checklist}\n\n"
        . $review['disclaimer'] . "\n"
        . "> ไม่โพสต์อัตโนมัติ — ต้อง Approve แล้วโพสต์ด้วยมือ\n";
}

/** Normalize caption for soft duplicate detection (anti-spam). */
function caption_fingerprint(string $text): string
{
    $t = mb_strtolower($text, 'UTF-8');
    $t = preg_replace('/\s+/u', ' ', $t) ?? $t;
    $t = preg_replace('#https?://\S+#u', '', $t) ?? $t;
    $t = trim($t);
    return mb_substr($t, 0, 180, 'UTF-8');
}

/**
 * Posting Hygiene Brief — anti-spam health from schedule + settings.
 * Soft guidance only; never auto-publishes or claims guaranteed income.
 * @return array{date:string,fromDate:string,windowDays:int,grade:string,score:int,summary:string,cooldownDays:int,maxPostsPerDay:int,staleDraftDays:int,todayActive:int,todayRoomLeft:int,staleDraftCount:int,coolingPairs:array,hotProducts:array,channelMix:array,nearDuplicates:array,doNotPost:array,actions:array,checklist:array,lines:array,disclaimer:string}
 */
function build_posting_hygiene(?string $date = null, int $windowDays = 7): array
{
    $date = $date ?: today_iso();
    $window = max(3, min(14, $windowDays));
    $from = date('Y-m-d', strtotime($date . ' -' . ($window - 1) . ' days'));
    $cooldown = cooldown_days();
    $maxPosts = max_posts_per_day();
    $staleDays = stale_draft_days();

    $stmt = db()->prepare("SELECT s.*, p.name AS product_name FROM schedule s LEFT JOIN products p ON p.id=s.product_id WHERE s.post_date BETWEEN ? AND ? AND s.status <> 'skipped'");
    $stmt->execute([$from, $date]);
    $inWindow = $stmt->fetchAll() ?: [];

    $stmt = db()->prepare("SELECT s.*, p.name AS product_name FROM schedule s LEFT JOIN products p ON p.id=s.product_id WHERE s.post_date=? AND s.status <> 'skipped'");
    $stmt->execute([$date]);
    $todayActiveRows = $stmt->fetchAll() ?: [];
    $todayActive = count($todayActiveRows);
    $todayRoomLeft = max(0, $maxPosts - $todayActive);

    $stmt = db()->prepare("SELECT COUNT(*) FROM schedule WHERE status='draft' AND post_date < DATE_SUB(?, INTERVAL ? DAY)");
    $stmt->execute([$date, $staleDays]);
    $staleDraftCount = (int)$stmt->fetchColumn();

    // Cooling pairs within cooldown window
    $cooldownFrom = date('Y-m-d', strtotime($date . ' -' . $cooldown . ' days'));
    $stmt = db()->prepare("SELECT s.*, p.name AS product_name FROM schedule s LEFT JOIN products p ON p.id=s.product_id WHERE s.post_date BETWEEN ? AND ? AND s.status <> 'skipped' ORDER BY s.post_date DESC");
    $stmt->execute([$cooldownFrom, $date]);
    $recentRows = $stmt->fetchAll() ?: [];
    $lastByPair = [];
    foreach ($recentRows as $r) {
        $key = $r['product_id'] . ':' . $r['channel'];
        if (!isset($lastByPair[$key])) {
            $lastByPair[$key] = $r;
        }
    }
    $coolingPairs = [];
    foreach ($lastByPair as $r) {
        $gap = (int)round((strtotime($date) - strtotime((string)$r['post_date'])) / 86400);
        if ($gap < 0 || $gap > $cooldown) continue;
        $daysLeft = $cooldown - $gap + 1;
        $label = channel_label((string)$r['channel']);
        $name = (string)($r['product_name'] ?: $r['product_id']);
        $coolingPairs[] = [
            'productId' => (string)$r['product_id'],
            'productName' => $name,
            'channel' => (string)$r['channel'],
            'channelLabel' => $label,
            'lastDate' => (string)$r['post_date'],
            'daysAgo' => $gap,
            'daysLeft' => $daysLeft,
            'tip' => $gap === 0
                ? 'ใช้คิววันนี้แล้ว — อย่าอนุมัติซ้ำช่องทางเดิม'
                : "พักอีก ~{$daysLeft} วันก่อนหมุน {$label} คู่เดิม",
        ];
    }
    usort($coolingPairs, fn($a, $b) => $b['daysLeft'] <=> $a['daysLeft'] ?: strcmp($a['productName'], $b['productName']));
    $coolingPairs = array_slice($coolingPairs, 0, 8);

    // Hot products
    $hotFrom = date('Y-m-d', strtotime($date . ' -' . ($cooldown - 1) . ' days'));
    $stmt = db()->prepare("SELECT s.product_id, p.name AS product_name, COUNT(*) AS n FROM schedule s LEFT JOIN products p ON p.id=s.product_id WHERE s.post_date BETWEEN ? AND ? AND s.status <> 'skipped' GROUP BY s.product_id, p.name HAVING COUNT(*) >= 3 ORDER BY n DESC LIMIT 5");
    $stmt->execute([$hotFrom, $date]);
    $hotProducts = [];
    foreach ($stmt->fetchAll() ?: [] as $r) {
        $n = (int)$r['n'];
        $name = (string)($r['product_name'] ?: $r['product_id']);
        $hotProducts[] = [
            'productId' => (string)$r['product_id'],
            'productName' => $name,
            'recentPosts' => $n,
            'tip' => "ถูกจัดคิว/โพสต์ {$n} ครั้งใน {$cooldown} วัน — หมุนสินค้าอื่นก่อน (กันสแปม)",
        ];
    }

    // Channel mix
    $channelCounts = [];
    foreach ($inWindow as $r) {
        $ch = (string)$r['channel'];
        $channelCounts[$ch] = ($channelCounts[$ch] ?? 0) + 1;
    }
    $mixTotal = max(count($inWindow), 1);
    $channelMix = [];
    foreach (['tiktok', 'facebook_reels', 'facebook_post', 'facebook_group'] as $ch) {
        $posts = $channelCounts[$ch] ?? 0;
        $share = $posts / $mixTotal;
        $tip = 'กระจายพอใช้';
        if (!$inWindow) $tip = 'ยังไม่มีโพสต์ในหน้าต่าง';
        elseif ($share >= 0.55) $tip = 'หนาแน่นเกินไป — สลับช่องทางอื่น';
        elseif ($posts === 0) $tip = 'ยังว่าง — เหมาะสำหรับทดลองกระจาย';
        $channelMix[] = [
            'channel' => $ch,
            'label' => channel_label($ch),
            'posts' => $posts,
            'share' => $share,
            'tip' => $tip,
        ];
    }

    // Near duplicates
    $fpMap = [];
    foreach ($inWindow as $r) {
        $cap = (string)$r['caption_preview'];
        $fp = caption_fingerprint($cap);
        if (mb_strlen($fp, 'UTF-8') < 24) continue;
        if (!isset($fpMap[$fp])) {
            $fpMap[$fp] = [
                'count' => 0,
                'sample' => mb_substr($cap, 0, 120, 'UTF-8'),
                'dates' => [],
                'names' => [],
            ];
        }
        $fpMap[$fp]['count']++;
        $fpMap[$fp]['dates'][(string)$r['post_date']] = true;
        $fpMap[$fp]['names'][(string)($r['product_name'] ?: $r['product_id'])] = true;
    }
    $nearDuplicates = [];
    foreach ($fpMap as $fp => $v) {
        if ($v['count'] < 2) continue;
        $names = array_keys($v['names']);
        $dates = array_keys($v['dates']);
        sort($dates);
        $nearDuplicates[] = [
            'fingerprint' => $fp,
            'count' => $v['count'],
            'sampleCaption' => $v['sample'],
            'dates' => $dates,
            'productNames' => $names,
            'tip' => 'แคปชันคล้ายกัน — กดสร้างแคปชันใหม่หรือเปลี่ยน hook/มุมขายก่อน Approve',
        ];
    }
    usort($nearDuplicates, fn($a, $b) => $b['count'] <=> $a['count']);
    $nearDuplicates = array_slice($nearDuplicates, 0, 5);

    $doNotPost = [];
    foreach (array_slice($hotProducts, 0, 3) as $h) {
        $doNotPost[] = $h['productName'] . ': ลดความถี่ — ' . $h['tip'];
    }
    foreach (array_slice($nearDuplicates, 0, 2) as $d) {
        $doNotPost[] = 'แคปชันซ้ำ (' . $d['count'] . ' ชิ้น · ' . implode(', ', $d['productNames']) . '): อย่า Approve จนกว่าจะ regenerate';
    }
    if ($todayRoomLeft === 0 && $todayActive >= $maxPosts) {
        $doNotPost[] = "คิววันนี้เต็มแล้ว ({$todayActive}/{$maxPosts}) — อย่า force Morning เพื่อเพิ่ม draft";
    }
    if (!$doNotPost) {
        $doNotPost[] = 'ยังไม่พบสัญญาณสแปมชัด — คงคุณภาพ + disclosure ทุกชิ้น';
    }

    $score = 100;
    $score -= min(30, count($hotProducts) * 10);
    $score -= min(25, count($nearDuplicates) * 12);
    if ($todayActive > $maxPosts) $score -= 20;
    elseif ($todayRoomLeft === 0 && $todayActive >= $maxPosts) $score -= 5;
    $score -= min(15, $staleDraftCount * 5);
    $dominant = $channelMix[0];
    foreach ($channelMix as $row) {
        if ($row['share'] > $dominant['share']) $dominant = $row;
    }
    if ($dominant['share'] >= 0.55 && count($inWindow) >= 3) $score -= 10;
    if (count($coolingPairs) >= $maxPosts * 2) $score -= 5;
    $score = max(0, min(100, (int)round($score)));
    $grade = $score >= 85 ? 'A' : ($score >= 70 ? 'B' : ($score >= 50 ? 'C' : 'D'));

    $actions = [];
    if ($hotProducts) {
        $actions[] = [
            'id' => 'rotate-hot',
            'title' => 'หมุนสินค้าที่ถูกใช้บ่อย',
            'detail' => implode(', ', array_map(fn($h) => $h['productName'], array_slice($hotProducts, 0, 2))),
        ];
    }
    if ($nearDuplicates) {
        $actions[] = [
            'id' => 'regen-dupes',
            'title' => 'สร้างแคปชันใหม่ให้ชิ้นที่คล้ายกัน',
            'detail' => 'ใช้ปุ่ม regenerate บนตารางโพสต์ — ยังเป็น draft ต้อง Approve',
        ];
    }
    if ($staleDraftCount > 0) {
        $actions[] = [
            'id' => 'expire-stale',
            'title' => 'เคลียร์ draft ค้าง',
            'detail' => "มี {$staleDraftCount} draft เก่ากว่า {$staleDays} วัน — Morning จะข้ามให้อัตโนมัติ",
        ];
    }
    if ($dominant['share'] >= 0.55 && count($inWindow) >= 3) {
        $actions[] = [
            'id' => 'mix-channels',
            'title' => 'กระจายช่องทาง',
            'detail' => $dominant['label'] . ' หนาแน่น (~' . (int)round($dominant['share'] * 100) . '%) — สลับ Reels/Group/Page',
        ];
    }
    if ($todayRoomLeft > 0) {
        $actions[] = [
            'id' => 'fill-quality',
            'title' => 'เติมคิวอย่างมีคุณภาพ',
            'detail' => "เหลือที่ว่าง {$todayRoomLeft}/{$maxPosts} — รัน Morning แล้ว Approve เฉพาะชิ้นที่ผ่าน disclosure",
        ];
    }
    if (!$actions) {
        $actions[] = [
            'id' => 'keep-clean',
            'title' => 'รักษาสุขอนามัย',
            'detail' => 'คูลดาวน์โอเค · ไม่มีแคปชันซ้ำชัด — Approve ทีละชิ้นหลังตรวจ disclosure',
        ];
    }
    $actions = array_slice($actions, 0, 5);

    $checklist = [
        'ตรวจ disclosure ทุก caption ก่อน Approve',
        'ไม่ Approve ชิ้นที่แคปชันคล้ายกันในหน้าต่างล่าสุด',
        "เคารพคูลดาวน์ product+channel {$cooldown} วัน",
        "ไม่เกิน {$maxPosts} โพสต์คุณภาพ/วัน",
        'ห้ามโพสต์อัตโนมัติ — Approve แล้วคัดลอกไปโพสต์ด้วยมือ',
    ];

    $summary = ($grade === 'A' || $grade === 'B')
        ? "สุขอนามัยการโพสต์เกรด {$grade} ({$score}/100) — คิวค่อนข้างสะอาด ยังต้อง Approve เอง"
        : "สุขอนามัยการโพสต์เกรด {$grade} ({$score}/100) — พบสัญญาณซ้ำ/คิวหนา แนะนำหมุนก่อน Approve";

    $lines = [
        "Posting Hygiene · {$date}: เกรด {$grade} ({$score}/100)",
        $summary,
        "คิววันนี้ {$todayActive}/{$maxPosts} · เหลือที่ว่าง {$todayRoomLeft} · draft ค้าง {$staleDraftCount}",
    ];
    if ($coolingPairs) {
        $bits = [];
        foreach (array_slice($coolingPairs, 0, 3) as $c) {
            $bits[] = $c['productName'] . '/' . $c['channelLabel'];
        }
        $lines[] = 'คู่ที่ยังคูลดาวน์: ' . implode(', ', $bits);
    } else {
        $lines[] = 'ยังไม่มีคู่ product+channel ในคูลดาวน์';
    }
    if ($hotProducts) {
        $lines[] = 'สินค้าใช้บ่อย: ' . implode(', ', array_map(fn($h) => $h['productName'], $hotProducts));
    }
    $lines[] = $nearDuplicates
        ? 'แคปชันใกล้ซ้ำ ' . count($nearDuplicates) . ' กลุ่ม — regenerate ก่อน Approve'
        : 'ไม่พบแคปชันใกล้ซ้ำในหน้าต่าง';
    if ($actions) {
        $lines[] = 'ทำก่อน: ' . $actions[0]['title'] . ' — ' . $actions[0]['detail'];
    }
    $lines[] = 'ไม่โพสต์อัตโนมัติ · ไม่การันตีรายได้ · ทดลองจากข้อมูลจริง';

    return [
        'date' => $date,
        'fromDate' => $from,
        'windowDays' => $window,
        'grade' => $grade,
        'score' => $score,
        'summary' => $summary,
        'cooldownDays' => $cooldown,
        'maxPostsPerDay' => $maxPosts,
        'staleDraftDays' => $staleDays,
        'todayActive' => $todayActive,
        'todayRoomLeft' => $todayRoomLeft,
        'staleDraftCount' => $staleDraftCount,
        'coolingPairs' => $coolingPairs,
        'hotProducts' => $hotProducts,
        'channelMix' => $channelMix,
        'nearDuplicates' => $nearDuplicates,
        'doNotPost' => array_slice($doNotPost, 0, 6),
        'actions' => $actions,
        'checklist' => $checklist,
        'lines' => $lines,
        'disclaimer' => INCOME_DISCLAIMER,
    ];
}

function posting_hygiene_to_markdown(array $hygiene): string
{
    $cooling = $hygiene['coolingPairs']
        ? implode("\n", array_map(fn($c) => '- **' . $c['productName'] . '** · ' . $c['channelLabel'] . ' · ล่าสุด ' . $c['lastDate'] . ' (' . $c['daysAgo'] . ' วันก่อน) — ' . $c['tip'], $hygiene['coolingPairs']))
        : '- ไม่มีคู่ในคูลดาวน์';
    $hot = $hygiene['hotProducts']
        ? implode("\n", array_map(function ($h, $i) {
            return ($i + 1) . '. **' . $h['productName'] . '** · ' . $h['recentPosts'] . ' ครั้ง — ' . $h['tip'];
        }, $hygiene['hotProducts'], array_keys($hygiene['hotProducts'])))
        : '- ยังไม่มีสินค้าใช้บ่อยผิดปกติ';
    $mix = implode("\n", array_map(fn($c) => '- **' . $c['label'] . '** · n=' . $c['posts'] . ' · ~' . (int)round($c['share'] * 100) . '% — ' . $c['tip'], $hygiene['channelMix']));
    $dupes = $hygiene['nearDuplicates']
        ? implode("\n", array_map(function ($d, $i) {
            return ($i + 1) . '. ×' . $d['count'] . ' · ' . implode(', ', $d['productNames']) . ' · วัน ' . implode(', ', $d['dates']) . ' — ' . $d['tip'] . "\n   > " . str_replace("\n", ' ', $d['sampleCaption']);
        }, $hygiene['nearDuplicates'], array_keys($hygiene['nearDuplicates'])))
        : '- ไม่พบแคปชันใกล้ซ้ำ';
    $avoid = implode("\n", array_map(fn($d) => '- ' . $d, $hygiene['doNotPost']));
    $actions = implode("\n", array_map(function ($a, $i) {
        return ($i + 1) . '. **' . $a['title'] . '** — ' . $a['detail'];
    }, $hygiene['actions'], array_keys($hygiene['actions'])));
    $checklist = implode("\n", array_map(fn($c) => '- [ ] ' . $c, $hygiene['checklist']));

    return "# Posting Hygiene · {$hygiene['date']}\n\n"
        . "เกรด **{$hygiene['grade']}** ({$hygiene['score']}/100)\n\n"
        . "{$hygiene['summary']}\n\n"
        . "หน้าต่าง: {$hygiene['fromDate']} → {$hygiene['date']} ({$hygiene['windowDays']} วัน)\n"
        . "คูลดาวน์ {$hygiene['cooldownDays']} วัน · เป้า {$hygiene['maxPostsPerDay']}/วัน · stale {$hygiene['staleDraftDays']} วัน\n\n"
        . "## คิววันนี้\n"
        . "- ใช้งานแล้ว: {$hygiene['todayActive']}/{$hygiene['maxPostsPerDay']}\n"
        . "- เหลือที่ว่าง: {$hygiene['todayRoomLeft']}\n"
        . "- draft ค้าง (เก่าเกิน stale): {$hygiene['staleDraftCount']}\n\n"
        . "## คู่ที่ยังคูลดาวน์\n{$cooling}\n\n"
        . "## สินค้าใช้บ่อย\n{$hot}\n\n"
        . "## สัดส่วนช่องทาง\n{$mix}\n\n"
        . "## แคปชันใกล้ซ้ำ\n{$dupes}\n\n"
        . "## อย่าโพสต์ / ชะลอ\n{$avoid}\n\n"
        . "## ทำก่อน\n{$actions}\n\n"
        . "## Checklist\n{$checklist}\n\n"
        . $hygiene['disclaimer'] . "\n"
        . "> ไม่โพสต์อัตโนมัติ — ต้อง Approve แล้วโพสต์ด้วยมือ\n";
}

/**
 * Results Intake Queue — evening checklist for posts missing metrics.
 * Soft guidance only; never auto-publishes or claims guaranteed income.
 * @return array{date:string,fromDate:string,windowDays:int,grade:string,score:int,summary:string,counts:array,rows:array,actions:array,checklist:array,lines:array,disclaimer:string}
 */
function build_results_intake(?string $date = null, int $windowDays = 7): array
{
    $date = $date ?: today_iso();
    $window = max(3, min(14, $windowDays));
    $from = date('Y-m-d', strtotime($date . ' -' . ($window - 1) . ' days'));

    $stmt = db()->prepare("SELECT s.*, p.name AS product_name FROM schedule s LEFT JOIN products p ON p.id=s.product_id WHERE s.status='posted' AND s.post_date BETWEEN ? AND ? ORDER BY s.post_date ASC, s.suggested_time ASC");
    $stmt->execute([$from, $date]);
    $posted = $stmt->fetchAll() ?: [];

    $rows = [];
    foreach ($posted as $s) {
        $views = (int)($s['views'] ?? 0);
        $clicks = (int)($s['clicks'] ?? 0);
        $orders = (int)($s['orders_count'] ?? 0);
        $comm = (float)($s['commission_earned'] ?? 0);
        $notes = trim((string)($s['notes'] ?? ''));
        $hasMetricsAt = !empty($s['metrics_at']);

        $missing = [];
        $filled = [];
        if ($views > 0) {
            $filled[] = 'views';
        } else {
            $missing[] = 'views';
        }
        if ($clicks > 0) {
            $filled[] = 'clicks';
        } else {
            $missing[] = 'clicks';
        }
        if ($orders > 0) {
            $filled[] = 'orders';
        } else {
            $missing[] = 'orders';
        }
        if ($comm > 0) {
            $filled[] = 'commission';
        } else {
            $missing[] = 'commission';
        }
        if ($notes !== '') {
            $filled[] = 'notes';
        } else {
            $missing[] = 'notes';
        }

        $completeness = 0;
        if ($views > 0) {
            $completeness += 25;
        }
        if ($clicks > 0) {
            $completeness += 25;
        }
        if ($orders > 0 || $comm > 0) {
            $completeness += 25;
        } elseif ($views > 0 && $clicks === 0 && $orders === 0) {
            $completeness += 5;
        }
        if ($comm > 0) {
            $completeness += 15;
        }
        if ($notes !== '') {
            $completeness += 10;
        }
        $completeness = max(0, min(100, $completeness));

        $isEmpty = ($views === 0 && $clicks === 0 && $orders === 0 && $comm <= 0 && $notes === '');
        // Treat missing metrics_at + zeros as empty even if row exists
        if (!$hasMetricsAt && $isEmpty) {
            $isEmpty = true;
        }

        $daysAgo = (int)round((strtotime($date) - strtotime((string)$s['post_date'])) / 86400);
        if ($completeness >= 75 && !$isEmpty) {
            $band = 'complete';
        } elseif (!$isEmpty && $completeness > 0 && $completeness < 75) {
            $band = 'partial';
        } elseif ((string)$s['post_date'] === $date) {
            $band = 'today';
        } else {
            $band = 'overdue';
        }

        $label = channel_label((string)$s['channel']);
        $name = (string)($s['product_name'] ?: $s['product_id']);
        if ($band === 'complete') {
            $tip = 'ผลครบพอวิเคราะห์ต่อได้ — ไม่ต้องกรอกซ้ำถ้าตัวเลขตรงแล้ว';
        } elseif ($band === 'partial') {
            $missCore = array_values(array_filter($missing, fn($f) => $f !== 'notes'));
            $tip = $missCore
                ? 'มีผลบางส่วน — เติม ' . implode(', ', array_slice($missCore, 0, 3)) . ' แล้วค่อยรัน Evening'
                : 'มีผลบางส่วน — เติม notes สั้น ๆ ช่วยจำมุมขายได้';
        } elseif ($band === 'today') {
            $tip = "โพสต์วันนี้บน {$label} — กรอก views/clicks หลังโพสต์ด้วยมือ";
        } else {
            $tip = "ค้างมา {$daysAgo} วัน — กรอกผลก่อนเพื่อให้ learning เย็นนี้มีข้อมูล";
        }

        $priority = 40.0;
        if ($band === 'overdue') {
            $priority += 35;
        } elseif ($band === 'today') {
            $priority += 22;
        } elseif ($band === 'partial') {
            $priority += 15;
        } else {
            $priority -= 20;
        }
        $priority += min(25, (100 - $completeness) * 0.25);
        $priority += min(15, $daysAgo * 4);
        $ch = (string)$s['channel'];
        if ($ch === 'tiktok' || $ch === 'facebook_reels') {
            $priority += 8;
        } else {
            $priority += 3;
        }
        $hour = (int)substr((string)($s['suggested_time'] ?: '12:00'), 0, 2);
        $priority += max(0, 6 - abs($hour - 12) * 0.4);
        if ($band === 'complete') {
            $priority *= 0.25;
        }
        $priority = round(max(0, min(100, $priority)) * 10) / 10;

        $rows[] = [
            'scheduleId' => (string)$s['id'],
            'productId' => (string)$s['product_id'],
            'productName' => $name,
            'channel' => $ch,
            'channelLabel' => $label,
            'date' => (string)$s['post_date'],
            'suggestedTime' => (string)$s['suggested_time'],
            'daysAgo' => $daysAgo,
            'band' => $band,
            'missingFields' => $missing,
            'filledFields' => $filled,
            'completeness' => $completeness,
            'priority' => $priority,
            'tip' => $tip,
            'href' => '?page=results',
        ];
    }

    usort($rows, function ($a, $b) {
        $rank = ['overdue' => 0, 'today' => 1, 'partial' => 2, 'complete' => 3];
        $bd = ($rank[$a['band']] ?? 9) - ($rank[$b['band']] ?? 9);
        if ($bd !== 0) {
            return $bd;
        }
        if ($b['priority'] != $a['priority']) {
            return $b['priority'] <=> $a['priority'];
        }
        $d = strcmp($a['date'], $b['date']);
        return $d !== 0 ? $d : strcmp($a['suggestedTime'], $b['suggestedTime']);
    });

    $counts = [
        'overdue' => count(array_filter($rows, fn($r) => $r['band'] === 'overdue')),
        'today' => count(array_filter($rows, fn($r) => $r['band'] === 'today')),
        'partial' => count(array_filter($rows, fn($r) => $r['band'] === 'partial')),
        'complete' => count(array_filter($rows, fn($r) => $r['band'] === 'complete')),
        'needsAttention' => count(array_filter($rows, fn($r) => $r['band'] !== 'complete')),
        'postedInWindow' => count($rows),
    ];

    if ($counts['postedInWindow'] === 0) {
        $score = 70;
    } else {
        $avg = array_sum(array_column($rows, 'completeness')) / max($counts['postedInWindow'], 1);
        $score = (int)round($avg);
        $score -= min(25, $counts['overdue'] * 8);
        $score -= min(15, $counts['partial'] * 4);
        $score += min(10, $counts['complete'] * 2);
    }
    $score = max(0, min(100, $score));
    if ($score >= 85) {
        $grade = 'A';
    } elseif ($score >= 70) {
        $grade = 'B';
    } elseif ($score >= 50) {
        $grade = 'C';
    } else {
        $grade = 'D';
    }

    $actions = [];
    if ($counts['overdue'] > 0) {
        $first = null;
        foreach ($rows as $r) {
            if ($r['band'] === 'overdue') {
                $first = $r;
                break;
            }
        }
        $actions[] = [
            'id' => 'fill-overdue',
            'title' => 'กรอกผลค้าง ' . $counts['overdue'] . ' ชิ้นก่อน',
            'detail' => $first
                ? 'เริ่มที่ “' . $first['productName'] . '” (' . $first['channelLabel'] . ') · ' . $first['tip']
                : 'โพสต์เก่าที่ยังไม่มีตัวเลขทำให้ learning อ่อน',
        ];
    }
    if ($counts['today'] > 0) {
        $actions[] = [
            'id' => 'fill-today',
            'title' => 'บันทึกผลโพสต์วันนี้ ' . $counts['today'] . ' ชิ้น',
            'detail' => 'หลังโพสต์ด้วยมือ ให้กรอก views/clicks อย่างน้อย — ค่าคอมใส่ทีหลังได้',
        ];
    }
    if ($counts['partial'] > 0) {
        $actions[] = [
            'id' => 'finish-partial',
            'title' => 'เติมผลบางส่วน ' . $counts['partial'] . ' ชิ้น',
            'detail' => 'มีตัวเลขไม่ครบ — เติม orders/commission แล้วรัน Evening อีกรอบ (force)',
        ];
    }
    if ($counts['needsAttention'] === 0 && $counts['postedInWindow'] > 0) {
        $actions[] = [
            'id' => 'run-evening',
            'title' => 'ผลครบแล้ว — รัน Evening ได้',
            'detail' => 'ระบบจะสรุปมุมที่เวิร์กและ foreshadow วันถัดไป (ยังไม่โพสต์อัตโนมัติ)',
        ];
    }
    if ($counts['postedInWindow'] === 0) {
        $actions[] = [
            'id' => 'post-first',
            'title' => 'ยังไม่มีโพสต์ในหน้าต่างนี้',
            'detail' => 'Approve draft → โพสต์ด้วยมือ → กลับมากรอกผลที่นี่',
        ];
    }

    $checklist = [
        'โพสต์ด้วยมือเท่านั้น — ระบบไม่ยิงโพสต์ให้อัตโนมัติ',
        'กรอก views / clicks อย่างน้อยสำหรับทุกโพสต์ที่ขึ้นสถานะ posted',
        'ใส่ commission เมื่อมีออเดอร์จริง — ห้ามเดาตัวเลข',
        'ถ้ายังไม่มียอด ให้ใส่ notes ว่า “ยังไม่แปลง” เพื่อไม่ให้ว่างทั้งก้อน',
        'มี disclosure ในแคปชันทุกครั้งก่อนโพสต์',
        'ตัวเลขเป็นการทดลอง ไม่รับประกันรายได้',
    ];

    $summaryParts = [];
    if ($counts['postedInWindow'] === 0) {
        $summaryParts[] = 'ยังไม่มีโพสต์ใน 7 วันล่าสุดให้กรอกผล';
    } elseif ($counts['needsAttention'] === 0) {
        $summaryParts[] = 'ผลครบ ' . $counts['complete'] . '/' . $counts['postedInWindow'] . ' ชิ้น — พร้อมวิเคราะห์เย็น';
    } else {
        $summaryParts[] = 'รอกรอก/เติมผล ' . $counts['needsAttention'] . '/' . $counts['postedInWindow'] . ' ชิ้น (ค้าง ' . $counts['overdue'] . ' · วันนี้ ' . $counts['today'] . ' · บางส่วน ' . $counts['partial'] . ')';
    }
    $summaryParts[] = "เกรดข้อมูล {$grade} ({$score}/100)";
    $summary = implode(' · ', $summaryParts);

    $lines = ["Results Intake: {$summary}"];
    $i = 0;
    foreach ($rows as $r) {
        if ($r['band'] === 'complete') {
            continue;
        }
        $i++;
        if ($i > 5) {
            break;
        }
        $miss = implode('/', array_slice($r['missingFields'], 0, 3)) ?: '—';
        $lines[] = "กรอกผล #{$i}: {$r['productName']} · {$r['channelLabel']} · {$r['band']} · ขาด {$miss}";
    }
    if ($actions) {
        $lines[] = 'ทำก่อน: ' . $actions[0]['title'];
    }

    return [
        'date' => $date,
        'fromDate' => $from,
        'windowDays' => $window,
        'grade' => $grade,
        'score' => $score,
        'summary' => $summary,
        'counts' => $counts,
        'rows' => $rows,
        'actions' => $actions,
        'checklist' => $checklist,
        'lines' => $lines,
        'disclaimer' => INCOME_DISCLAIMER,
    ];
}

function results_intake_to_markdown(array $intake): string
{
    $attention = array_values(array_filter($intake['rows'], fn($r) => $r['band'] !== 'complete'));
    if (!$attention) {
        $queue = '- ไม่มีรายการค้าง — ผลครบในหน้าต่างนี้';
    } else {
        $parts = [];
        foreach ($attention as $i => $r) {
            $parts[] = ($i + 1) . '. **' . $r['productName'] . '** · ' . $r['channelLabel'] . ' · ' . $r['date'] . ' ' . $r['suggestedTime'] . "\n"
                . '   - แบนด์: ' . $r['band'] . ' · ความครบ ' . $r['completeness'] . '/100 · ลำดับ ' . $r['priority'] . "\n"
                . '   - ขาด: ' . (implode(', ', $r['missingFields']) ?: '—') . "\n"
                . '   - มีแล้ว: ' . (implode(', ', $r['filledFields']) ?: '—') . "\n"
                . '   - ' . $r['tip'];
        }
        $queue = implode("\n", $parts);
    }
    $completeRows = array_values(array_filter($intake['rows'], fn($r) => $r['band'] === 'complete'));
    if (!$completeRows) {
        $complete = '- ยังไม่มีชิ้นที่ครบพอ';
    } else {
        $complete = implode("\n", array_map(function ($r) {
            return '- **' . $r['productName'] . '** · ' . $r['channelLabel'] . ' · ' . $r['date'] . ' (' . $r['completeness'] . '/100)';
        }, array_slice($completeRows, 0, 8)));
    }
    $actions = implode("\n", array_map(function ($a, $i) {
        return ($i + 1) . '. **' . $a['title'] . '** — ' . $a['detail'];
    }, $intake['actions'], array_keys($intake['actions'])));
    $checklist = implode("\n", array_map(fn($c) => '- [ ] ' . $c, $intake['checklist']));
    $c = $intake['counts'];

    return "# Results Intake · {$intake['date']}\n\n"
        . "เกรด **{$intake['grade']}** ({$intake['score']}/100)\n\n"
        . "{$intake['summary']}\n\n"
        . "หน้าต่าง: {$intake['fromDate']} → {$intake['date']} ({$intake['windowDays']} วัน)\n\n"
        . "## สรุปจำนวน\n"
        . "- โพสต์ในหน้าต่าง: {$c['postedInWindow']}\n"
        . "- ต้องสนใจ: {$c['needsAttention']}\n"
        . "- ค้าง (overdue): {$c['overdue']}\n"
        . "- วันนี้: {$c['today']}\n"
        . "- บางส่วน: {$c['partial']}\n"
        . "- ครบ: {$c['complete']}\n\n"
        . "## คิวกรอกผล (เรียงลำดับ)\n{$queue}\n\n"
        . "## ผลครบแล้ว\n{$complete}\n\n"
        . "## ทำก่อน\n{$actions}\n\n"
        . "## Checklist\n{$checklist}\n\n"
        . $intake['disclaimer'] . "\n"
        . "> ไม่โพสต์อัตโนมัติ — กรอกผลด้วยมือหลังโพสต์จริง\n";
}

/**
 * Creative Performance Board — soft leaderboard for hooks / CTAs / combos.
 * Soft guidance only; never auto-publishes or claims guaranteed income.
 * @return array{date:string,fromDate:string,windowDays:int,grade:string,score:int,summary:string,counts:array,hooks:array,ctas:array,combos:array,tryNext:array,avoidReuse:array,actions:array,checklist:array,lines:array,disclaimer:string}
 */
function build_creative_performance(?string $date = null, int $windowDays = 7): array
{
    $date = $date ?: today_iso();
    $window = max(3, min(14, $windowDays));
    $from = date('Y-m-d', strtotime($date . ' -' . ($window - 1) . ' days'));

    $stmt = db()->prepare("SELECT s.*, p.name AS product_name FROM schedule s LEFT JOIN products p ON p.id=s.product_id WHERE s.status='posted' AND s.post_date BETWEEN ? AND ? ORDER BY s.post_date ASC");
    $stmt->execute([$from, $date]);
    $posted = $stmt->fetchAll() ?: [];

    $hooks = [];
    $ctas = [];
    $combos = [];

    foreach ($posted as $s) {
        $views = (int)($s['views'] ?? 0);
        $clicks = (int)($s['clicks'] ?? 0);
        $orders = (int)($s['orders_count'] ?? 0);
        $comm = (float)($s['commission_earned'] ?? 0);
        $notes = trim((string)($s['notes'] ?? ''));
        if ($views <= 0 && $clicks <= 0 && $orders <= 0 && $comm <= 0 && $notes === '') {
            continue;
        }
        $ctr = $views > 0 ? $clicks / $views : 0.0;
        $opc = $clicks > 0 ? $orders / $clicks : 0.0;
        $score = $ctr * 40 + $opc * 30 + min($comm / 100, 1) * 20 + min($comm / max($clicks, 1), 10);

        $pack = null;
        if (!empty($s['content_pack_id'])) {
            $pstmt = db()->prepare('SELECT * FROM content_packs WHERE id=?');
            $pstmt->execute([$s['content_pack_id']]);
            $prow = $pstmt->fetch();
            if ($prow) {
                $pack = map_pack($prow);
            }
        }
        if (!$pack) {
            $pack = latest_pack((string)$s['product_id']) ?: ['hooks' => [], 'ctas' => []];
        }
        $hookIndex = (int)($s['hook_index'] ?? 0);
        $ctaIndex = (int)($s['cta_index'] ?? 0);
        $hookRaw = $pack['hooks'][$hookIndex] ?? ($pack['hooks'][0] ?? ('hook #' . ($hookIndex + 1)));
        $ctaRaw = $pack['ctas'][$ctaIndex] ?? ($pack['ctas'][0] ?? ('CTA #' . ($ctaIndex + 1)));
        $hookFp = creative_fingerprint((string)$hookRaw);
        $ctaFp = creative_fingerprint((string)$ctaRaw);
        $hookLabel = mb_substr(preg_replace('/\s+/u', ' ', trim((string)$hookRaw)), 0, 56);
        $ctaLabel = mb_substr(preg_replace('/\s+/u', ' ', trim((string)$ctaRaw)), 0, 56);
        $ch = (string)$s['channel'];

        if (!isset($hooks[$hookFp])) {
            $hooks[$hookFp] = [
                'kind' => 'hook',
                'index' => $hookIndex,
                'label' => $hookLabel,
                'fingerprint' => $hookFp,
                'samples' => 0,
                'scoreSum' => 0.0,
                'ctrSum' => 0.0,
                'commission' => 0.0,
                'orders' => 0,
                'channels' => [],
            ];
        }
        $hooks[$hookFp]['samples']++;
        $hooks[$hookFp]['scoreSum'] += $score;
        $hooks[$hookFp]['ctrSum'] += $ctr;
        $hooks[$hookFp]['commission'] += $comm;
        $hooks[$hookFp]['orders'] += $orders;
        $hooks[$hookFp]['channels'][$ch] = true;

        if (!isset($ctas[$ctaFp])) {
            $ctas[$ctaFp] = [
                'kind' => 'cta',
                'index' => $ctaIndex,
                'label' => $ctaLabel,
                'fingerprint' => $ctaFp,
                'samples' => 0,
                'scoreSum' => 0.0,
                'ctrSum' => 0.0,
                'commission' => 0.0,
                'orders' => 0,
                'channels' => [],
            ];
        }
        $ctas[$ctaFp]['samples']++;
        $ctas[$ctaFp]['scoreSum'] += $score;
        $ctas[$ctaFp]['ctrSum'] += $ctr;
        $ctas[$ctaFp]['commission'] += $comm;
        $ctas[$ctaFp]['orders'] += $orders;
        $ctas[$ctaFp]['channels'][$ch] = true;

        $comboKey = $hookFp . '||' . $ctaFp;
        if (!isset($combos[$comboKey])) {
            $combos[$comboKey] = [
                'hookIndex' => $hookIndex,
                'ctaIndex' => $ctaIndex,
                'hookLabel' => $hookLabel,
                'ctaLabel' => $ctaLabel,
                'samples' => 0,
                'scoreSum' => 0.0,
                'commission' => 0.0,
            ];
        }
        $combos[$comboKey]['samples']++;
        $combos[$comboKey]['scoreSum'] += $score;
        $combos[$comboKey]['commission'] += $comm;
    }

    $mapAngle = function (array $acc): array {
        $n = max(1, (int)$acc['samples']);
        $avg = $acc['scoreSum'] / $n;
        $band = 'thin';
        if ((int)$acc['samples'] < 2) {
            $band = 'thin';
        } elseif ($avg >= 18) {
            $band = 'leader';
        } elseif ($avg >= 10) {
            $band = 'solid';
        } else {
            $band = 'weak';
        }
        $kind = $acc['kind'];
        if ($band === 'thin') {
            $tip = "{$kind} นี้มี n={$acc['samples']} — ทดลองซ้ำอีก 1–2 ครั้งก่อนสรุป";
        } elseif ($band === 'leader') {
            $tip = "{$kind} นี้คะแนนเฉลี่ยดีในชุดข้อมูล (ทดลอง) — ใช้เป็นสมมติฐาน ไม่การันตี";
        } elseif ($band === 'solid') {
            $tip = "{$kind} ใช้ได้ — ลองจับคู่กับช่องทางอื่นหรือปรับแคปชันเล็กน้อย";
        } else {
            $tip = "{$kind} อ่อนในชุดนี้ — พักซ้ำข้อความเดิม ลองมุมใหม่หลัง Approve";
        }
        return [
            'kind' => $kind,
            'index' => (int)$acc['index'],
            'label' => (string)$acc['label'],
            'fingerprint' => (string)$acc['fingerprint'],
            'samples' => (int)$acc['samples'],
            'avgScore' => round($avg, 1),
            'totalCommission' => round((float)$acc['commission'], 2),
            'totalOrders' => (int)$acc['orders'],
            'avgCtr' => round($acc['ctrSum'] / $n, 3),
            'channels' => array_keys($acc['channels']),
            'band' => $band,
            'tip' => $tip,
        ];
    };

    $hookRows = array_values(array_map($mapAngle, $hooks));
    usort($hookRows, fn($a, $b) => ($b['avgScore'] <=> $a['avgScore']) ?: ($b['samples'] <=> $a['samples']));
    $ctaRows = array_values(array_map($mapAngle, $ctas));
    usort($ctaRows, fn($a, $b) => ($b['avgScore'] <=> $a['avgScore']) ?: ($b['samples'] <=> $a['samples']));

    $comboRows = [];
    foreach ($combos as $c) {
        $avg = $c['samples'] > 0 ? $c['scoreSum'] / $c['samples'] : 0.0;
        $tip = 'ข้อมูลบาง — ทดลองซ้ำก่อนสรุป';
        if ($c['samples'] >= 2 && $avg >= 18) {
            $tip = 'คู่ hook+CTA นี้น่าสนใจในชุดข้อมูล (ทดลอง) — อย่าสแปมซ้ำวันติด';
        } elseif ($c['samples'] >= 2 && $avg < 10) {
            $tip = 'คู่นี้อ่อน — ลอง regenerate มุมใหม่แล้ว Approve ก่อนโพสต์';
        }
        $comboRows[] = [
            'hookIndex' => (int)$c['hookIndex'],
            'ctaIndex' => (int)$c['ctaIndex'],
            'hookLabel' => (string)$c['hookLabel'],
            'ctaLabel' => (string)$c['ctaLabel'],
            'samples' => (int)$c['samples'],
            'avgScore' => round($avg, 1),
            'totalCommission' => round((float)$c['commission'], 2),
            'tip' => $tip,
        ];
    }
    usort($comboRows, fn($a, $b) => ($b['avgScore'] <=> $a['avgScore']) ?: ($b['samples'] <=> $a['samples']));
    $comboRows = array_slice($comboRows, 0, 8);

    $withMetrics = 0;
    foreach ($posted as $s) {
        $views = (int)($s['views'] ?? 0);
        $clicks = (int)($s['clicks'] ?? 0);
        $orders = (int)($s['orders_count'] ?? 0);
        $comm = (float)($s['commission_earned'] ?? 0);
        $notes = trim((string)($s['notes'] ?? ''));
        if ($views > 0 || $clicks > 0 || $orders > 0 || $comm > 0 || $notes !== '') {
            $withMetrics++;
        }
    }
    $leaders = count(array_filter(array_merge($hookRows, $ctaRows), fn($r) => $r['band'] === 'leader'));
    $weak = count(array_filter(array_merge($hookRows, $ctaRows), fn($r) => $r['band'] === 'weak'));

    $score = 35;
    $score += min(30, $withMetrics * 5);
    $score += min(15, count($hookRows) * 4);
    $score += min(10, count($ctaRows) * 4);
    $score += min(10, $leaders * 5);
    $score = max(0, min(100, (int)round($score)));
    $grade = 'D';
    if ($score >= 80) {
        $grade = 'A';
    } elseif ($score >= 65) {
        $grade = 'B';
    } elseif ($score >= 50) {
        $grade = 'C';
    }

    $topHook = null;
    foreach ($hookRows as $h) {
        if ($h['band'] === 'leader' || $h['band'] === 'solid') {
            $topHook = $h;
            break;
        }
    }
    $topCta = null;
    foreach ($ctaRows as $c) {
        if ($c['band'] === 'leader' || $c['band'] === 'solid') {
            $topCta = $c;
            break;
        }
    }

    $tryNext = [];
    if ($topHook) {
        $tryNext[] = 'ลองใช้ hook แนว “' . $topHook['label'] . '” อีกครั้งบนช่องทางอื่น (หลัง Approve)';
    }
    if ($topCta) {
        $tryNext[] = 'ลอง CTA แนว “' . $topCta['label'] . '” กับสินค้าใหม่ในคิวถ่าย';
    }
    foreach (array_slice(array_values(array_filter($hookRows, fn($h) => $h['band'] === 'thin')), 0, 2) as $h) {
        $tryNext[] = 'เก็บตัวอย่าง hook “' . $h['label'] . '” เพิ่ม — ยังสรุปไม่ได้';
    }
    if (!$tryNext) {
        $tryNext[] = 'ยังไม่พอข้อมูลมุมขาย — โพสต์ draft ที่อนุมัติแล้ว 1–2 ชิ้น แล้วกรอกผลเย็นนี้';
    }
    $tryNext = array_slice($tryNext, 0, 5);

    $avoidReuse = [];
    foreach ($hookRows as $h) {
        if ($h['band'] === 'weak' && $h['samples'] >= 2) {
            $avoidReuse[] = 'พักซ้ำ hook “' . $h['label'] . '” (n=' . $h['samples'] . ', คะแนนเฉลี่ย ' . $h['avgScore'] . ')';
        }
    }
    foreach ($ctaRows as $c) {
        if ($c['band'] === 'weak' && $c['samples'] >= 2) {
            $avoidReuse[] = 'พักซ้ำ CTA “' . $c['label'] . '” (n=' . $c['samples'] . ', คะแนนเฉลี่ย ' . $c['avgScore'] . ')';
        }
    }
    foreach (array_slice(array_values(array_filter($comboRows, fn($c) => $c['samples'] >= 2 && $c['avgScore'] < 10)), 0, 2) as $combo) {
        $avoidReuse[] = 'เลี่ยงคู่ hook#' . ($combo['hookIndex'] + 1) . '+CTA#' . ($combo['ctaIndex'] + 1) . ' ที่อ่อนในชุดนี้';
    }
    $avoidReuse = array_slice($avoidReuse, 0, 5);

    $actions = [];
    if ($withMetrics === 0) {
        $actions[] = [
            'id' => 'no-metrics',
            'title' => 'ยังไม่มีผลพอวิเคราะห์มุมขาย',
            'detail' => 'Approve → โพสต์ด้วยมือ → กรอก views/clicks ที่หน้า Results แล้วค่อยดูบอร์ดนี้',
        ];
    } else {
        if ($topHook) {
            $actions[] = [
                'id' => 'reuse-hook',
                'title' => 'ทดลอง hook #' . ($topHook['index'] + 1),
                'detail' => $topHook['label'] . ' · ไม่การันตีผล',
            ];
        }
        if ($weak > 0) {
            $actions[] = [
                'id' => 'regen-weak',
                'title' => 'สร้างแคปชันใหม่มุมอ่อน',
                'detail' => 'ที่ตารางโพสต์ กดสร้างแคปชันใหม่ แล้ว Approve ก่อนโพสต์ — ห้ามสแปมข้อความเดิม',
            ];
        }
        if ($withMetrics < 4) {
            $actions[] = [
                'id' => 'more-samples',
                'title' => 'เก็บตัวอย่างเพิ่ม',
                'detail' => "มี {$withMetrics} โพสต์ที่มีผล — เป้าอย่างน้อย 4–6 ชิ้น/สัปดาห์เพื่อเทียบ hook/CTA",
            ];
        }
    }
    $actions[] = [
        'id' => 'compliance',
        'title' => 'ตรวจ disclosure ก่อน Approve',
        'detail' => 'ทุกแคปชันต้องมีข้อความ affiliate — ระบบบล็อก Approve ถ้าไม่มีหรือมีคำโฆษณาเกินจริง',
    ];
    $actions = array_slice($actions, 0, 5);

    $checklist = [
        'ดู hook/CTA ที่คะแนนดี แล้วใช้เป็นสมมติฐานทดลองเท่านั้น',
        'อย่าคัดลอกแคปชันเดิมซ้ำติดกัน — ใช้ regenerate + Approve',
        'ตรวจ disclosure ก่อนโพสต์ด้วยมือ',
        'กรอกผลที่หน้า Results ให้ครบเพื่อให้บอร์ดนี้แม่นขึ้น',
        'ห้ามเคลมรายได้แน่นอนในแคปชันหรือสตอรี่',
    ];

    $summary = $withMetrics === 0
        ? 'Creative Performance: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลโพสต์ก่อนวิเคราะห์มุมขาย'
        : "Creative Performance: {$withMetrics} โพสต์ · hook " . count($hookRows) . ' / CTA ' . count($ctaRows) . " มุม · เกรดข้อมูล {$grade} (ทดลองจากตัวเลขที่กรอก ไม่การันตี)";

    $lines = [
        "Creative Performance · เกรด {$grade} ({$score}/100)",
        $summary,
    ];
    if ($topHook) {
        $lines[] = 'Hook เด่นในชุดนี้: #' . ($topHook['index'] + 1) . ' “' . $topHook['label'] . '” (n=' . $topHook['samples'] . ')';
    }
    if ($topCta) {
        $lines[] = 'CTA เด่นในชุดนี้: #' . ($topCta['index'] + 1) . ' “' . $topCta['label'] . '” (n=' . $topCta['samples'] . ')';
    }
    if ($avoidReuse) {
        $lines[] = $avoidReuse[0];
    }
    $lines[] = 'ใช้บอร์ดนี้เลือกมุมทดลอง — ยังเป็น draft และต้อง Approve ก่อนโพสต์จริง';

    return [
        'date' => $date,
        'fromDate' => $from,
        'windowDays' => $window,
        'grade' => $grade,
        'score' => $score,
        'summary' => $summary,
        'counts' => [
            'withMetrics' => $withMetrics,
            'uniqueHooks' => count($hookRows),
            'uniqueCtas' => count($ctaRows),
            'combos' => count($comboRows),
            'leaders' => $leaders,
            'weak' => $weak,
        ],
        'hooks' => $hookRows,
        'ctas' => $ctaRows,
        'combos' => $comboRows,
        'tryNext' => $tryNext,
        'avoidReuse' => $avoidReuse,
        'actions' => $actions,
        'checklist' => $checklist,
        'lines' => $lines,
        'disclaimer' => INCOME_DISCLAIMER,
    ];
}

function creative_fingerprint(string $text): string
{
    $t = mb_strtolower($text);
    $t = preg_replace('/[^\p{L}\p{N}\s]/u', ' ', $t) ?? '';
    $t = preg_replace('/\s+/u', ' ', trim($t)) ?? '';
    return mb_substr($t, 0, 80);
}

function creative_performance_to_markdown(array $board): string
{
    if (!$board['hooks']) {
        $hookList = '- ยังไม่มี hook ให้จัดอันดับ';
    } else {
        $parts = [];
        foreach (array_slice($board['hooks'], 0, 8) as $i => $h) {
            $parts[] = ($i + 1) . '. **#' . ($h['index'] + 1) . '** [' . $h['band'] . '] “' . $h['label'] . '” · n=' . $h['samples'] . ' · avg ' . $h['avgScore'] . ' · ค่าคอม ฿' . $h['totalCommission'] . "\n"
                . '   - ' . $h['tip'];
        }
        $hookList = implode("\n", $parts);
    }
    if (!$board['ctas']) {
        $ctaList = '- ยังไม่มี CTA ให้จัดอันดับ';
    } else {
        $parts = [];
        foreach (array_slice($board['ctas'], 0, 8) as $i => $c) {
            $parts[] = ($i + 1) . '. **#' . ($c['index'] + 1) . '** [' . $c['band'] . '] “' . $c['label'] . '” · n=' . $c['samples'] . ' · avg ' . $c['avgScore'] . ' · ออเดอร์ ' . $c['totalOrders'] . "\n"
                . '   - ' . $c['tip'];
        }
        $ctaList = implode("\n", $parts);
    }
    if (!$board['combos']) {
        $comboList = '- ยังไม่มีคู่ hook+CTA';
    } else {
        $comboList = implode("\n", array_map(function ($c) {
            return '- hook#' . ($c['hookIndex'] + 1) . ' + CTA#' . ($c['ctaIndex'] + 1) . ' · n=' . $c['samples'] . ' · avg ' . $c['avgScore'] . "\n"
                . '  - ' . $c['hookLabel'] . ' / ' . $c['ctaLabel'] . "\n"
                . '  - ' . $c['tip'];
        }, $board['combos']));
    }
    $tryNext = implode("\n", array_map(fn($t) => '- ' . $t, $board['tryNext']));
    $avoid = $board['avoidReuse']
        ? implode("\n", array_map(fn($t) => '- ' . $t, $board['avoidReuse']))
        : '- ไม่มีมุมอ่อนชัดในชุดนี้';
    $actions = implode("\n", array_map(function ($a, $i) {
        return ($i + 1) . '. **' . $a['title'] . '** — ' . $a['detail'];
    }, $board['actions'], array_keys($board['actions'])));
    $checklist = implode("\n", array_map(fn($c) => '- [ ] ' . $c, $board['checklist']));
    $c = $board['counts'];

    return "# Creative Performance · {$board['date']}\n\n"
        . "เกรดข้อมูล **{$board['grade']}** ({$board['score']}/100)\n\n"
        . "{$board['summary']}\n\n"
        . "หน้าต่าง: {$board['fromDate']} → {$board['date']} ({$board['windowDays']} วัน)\n\n"
        . "## สรุปจำนวน\n"
        . "- โพสต์มีเมตริก: {$c['withMetrics']}\n"
        . "- Hook ไม่ซ้ำ: {$c['uniqueHooks']}\n"
        . "- CTA ไม่ซ้ำ: {$c['uniqueCtas']}\n"
        . "- คู่ hook+CTA: {$c['combos']}\n"
        . "- มุมเด่น (leader): {$c['leaders']}\n"
        . "- มุมอ่อน (weak): {$c['weak']}\n\n"
        . "## Hook leaderboard\n{$hookList}\n\n"
        . "## CTA leaderboard\n{$ctaList}\n\n"
        . "## คู่ที่ลองแล้ว\n{$comboList}\n\n"
        . "## ลองต่อไป\n{$tryNext}\n\n"
        . "## พักซ้ำ\n{$avoid}\n\n"
        . "## ทำก่อน\n{$actions}\n\n"
        . "## Checklist\n{$checklist}\n\n"
        . $board['disclaimer'] . "\n"
        . "> ไม่โพสต์อัตโนมัติ — ใช้เป็นสมมติฐานทดลองหลัง Approve เท่านั้น\n";
}

/** Morning brief lines for caption quality of today's drafts. */
function quality_brief_lines(string $date): array
{
    $stmt = db()->prepare("SELECT s.caption_preview, s.channel, s.status, p.name AS product_name FROM schedule s LEFT JOIN products p ON p.id=s.product_id WHERE s.post_date=? AND s.status IN ('draft','approved')");
    $stmt->execute([$date]);
    $rows = $stmt->fetchAll();
    if (!$rows) {
        return ['คุณภาพแคปชัน: ยังไม่มี draft วันนี้ให้ตรวจ'];
    }
    $scores = [];
    $weak = 0;
    $best = null;
    foreach ($rows as $row) {
        $q = score_caption_quality((string)$row['caption_preview'], (string)$row['channel']);
        $scores[] = $q['score'];
        if ($q['grade'] === 'C' || $q['grade'] === 'D') {
            $weak++;
        }
        if ($best === null || $q['score'] > $best['score']) {
            $best = ['score' => $q['score'], 'grade' => $q['grade'], 'name' => $row['product_name'] ?? 'draft', 'tip' => $q['tips'][0] ?? ''];
        }
    }
    $avg = (int)round(array_sum($scores) / max(count($scores), 1));
    $lines = ["คุณภาพแคปชันวันนี้: เฉลี่ย {$avg}/100 · ควรแก้ก่อน {$weak}/" . count($rows) . ' ชิ้น'];
    if ($best && $best['grade'] === 'A') {
        $lines[] = 'ชิ้นที่พร้อม Approve ก่อน: ' . $best['name'] . " ({$best['score']}/100)";
    } elseif ($best && ($best['grade'] === 'C' || $best['grade'] === 'D') && $best['tip']) {
        $lines[] = 'คุณภาพแคปชัน “' . $best['name'] . "”: {$best['grade']} ({$best['score']}/100) · {$best['tip']}";
    }
    return $lines;
}

/**
 * Ready-to-copy posting pack for manual publish after Approve.
 * @return array{text:string,readyToCopy:bool,complianceOk:bool,productName:string,status:string}
 */
function build_posting_pack(string $scheduleId): array
{
    $stmt = db()->prepare('SELECT s.*, p.name AS product_name, p.affiliate_url, p.platform FROM schedule s LEFT JOIN products p ON p.id=s.product_id WHERE s.id=?');
    $stmt->execute([$scheduleId]);
    $row = $stmt->fetch();
    if (!$row) {
        return ['ok' => false, 'error' => 'ไม่พบตารางโพสต์'];
    }

    $pack = null;
    if (!empty($row['content_pack_id'])) {
        $pstmt = db()->prepare('SELECT * FROM content_packs WHERE id=?');
        $pstmt->execute([$row['content_pack_id']]);
        $packRow = $pstmt->fetch();
        $pack = $packRow ? map_pack($packRow) : null;
    }

    $caption = (string)$row['caption_preview'];
    $gate = evaluate_approve_gate($caption);
    $status = (string)$row['status'];
    $notes = $gate['ok']
        ? ['ผ่าน disclosure + ไม่พบคำโฆษณาเกินจริงในแคปชัน']
        : $gate['errors'];
    if ($status === 'draft') {
        $notes[] = 'ยังเป็น draft — ต้อง Approve ก่อนโพสต์จริง (ระบบไม่โพสต์ให้อัตโนมัติ)';
    } elseif ($status === 'skipped') {
        $notes[] = 'โพสต์นี้ถูกข้ามแล้ว — ไม่ควรโพสต์';
    }
    $ready = in_array($status, ['approved', 'posted'], true) && $gate['ok'];

    $hookIndex = (int)($row['hook_index'] ?? 0);
    $ctaIndex = (int)($row['cta_index'] ?? 0);
    $hook = $pack['hooks'][$hookIndex] ?? ($pack['hooks'][0] ?? '');
    $cta = $pack['ctas'][$ctaIndex] ?? ($pack['ctas'][0] ?? '');
    $hashtags = $pack
        ? array_merge(array_slice($pack['hashtagsTh'] ?? [], 0, 5), array_slice($pack['hashtagsEn'] ?? [], 0, 4))
        : [];
    $channel = (string)$row['channel'];
    $isShort = in_array($channel, ['tiktok', 'facebook_reels'], true);

    $lines = [
        '📦 Posting Pack · ' . $row['suggested_time'] . ' · ' . channel_label($channel),
        'สินค้า: ' . ($row['product_name'] ?? $row['product_id']),
        'สถานะ: ' . $status . ($ready ? ' · พร้อมคัดลอกไปโพสต์มือ' : ''),
        '',
        '— Checklist ก่อนโพสต์ —',
    ];
    foreach ($notes as $n) {
        $lines[] = '• ' . $n;
    }
    $lines[] = '- [ ] ไม่โพสต์ซ้ำช่องทางเดิมในวันเดียวกันแบบไร้คุณภาพ';
    $lines[] = '- [ ] มี disclosure ในแคปชัน';
    $lines[] = '- [ ] ไม่การันตีรายได้ / ไม่ใช้คำโฆษณาเกินจริง';
    $lines[] = '';
    if (!empty($row['affiliate_url'])) {
        $lines[] = 'ลิงก์ affiliate:';
        $lines[] = $row['affiliate_url'];
        $lines[] = '';
    }
    if ($hook !== '') $lines[] = 'Hook: ' . $hook;
    if ($cta !== '') $lines[] = 'CTA: ' . $cta;
    if ($hook !== '' || $cta !== '') $lines[] = '';

    if ($isShort && $pack) {
        $scenes = $pack['tiktokScript']['scenes'] ?? [];
        if ($scenes) {
            $lines[] = 'สคริปต์สั้น:';
            foreach ($scenes as $s) {
                $lines[] = '  [' . ($s['time'] ?? '') . '] ' . ($s['line'] ?? '');
            }
            $lines[] = '';
        }
        $checks = $pack['filmingChecklist'] ?? [];
        if ($checks) {
            $lines[] = 'เช็คลิสต์ถ่าย:';
            foreach ($checks as $c) {
                $lines[] = '- [ ] ' . $c;
            }
            $lines[] = '';
        }
    }

    $lines[] = '— Caption (คัดลอกทั้งก้อน) —';
    $lines[] = $caption;
    $lines[] = '';
    if ($hashtags) {
        $lines[] = 'Hashtags:';
        $lines[] = implode(' ', $hashtags);
        $lines[] = '';
    }
    $lines[] = 'หมายเหตุ: ' . INCOME_DISCLAIMER;

    return [
        'ok' => true,
        'scheduleId' => $scheduleId,
        'status' => $status,
        'productName' => (string)($row['product_name'] ?? $row['product_id']),
        'complianceOk' => $gate['ok'],
        'readyToCopy' => $ready,
        'text' => implode("\n", $lines),
        'disclaimer' => INCOME_DISCLAIMER,
    ];
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
    $qualityLines = quality_brief_lines($date);
    $approveQueue = build_approve_queue($date);
    $approveLines = array_slice($approveQueue['lines'], 0, 5);
    $playbookLines = array_slice(build_winner_playbook($date)['lines'], 0, 4);
    $weeklyReviewLines = array_slice(build_weekly_review($date)['lines'], 0, 4);
    $hygieneLines = array_slice(build_posting_hygiene($date)['lines'], 0, 5);
    $intakeLines = array_slice(build_results_intake($date)['lines'], 0, 4);
    $creativeLines = array_slice(build_creative_performance($date)['lines'], 0, 4);
    $publishLines = array_slice(build_publish_queue($date)['lines'], 0, 5);
    $roiLines = array_slice(build_soft_roi_lab($date)['lines'], 0, 4);

    $recs = [
        $ranked ? 'Top โปรโมตวันนี้: ' . implode(', ', array_map(fn($r) => $r['product']['name'], $ranked)) : 'ยังไม่มีสินค้า',
        $expired > 0 ? "ข้าม draft ค้าง {$expired} ชิ้น (เก่ากว่า " . stale_draft_days() . ' วัน)' : null,
        $filmLabelParts ? 'คิวถ่ายวิดีโอวันนี้ (ทดลอง): ' . implode(' → ', $filmLabelParts) : 'ยังไม่มีคิววิดีโอ',
        $shootFirst ? 'ถ่ายก่อน: ' . $shootFirst['productName'] . ' — ' . $shootFirst['reason'] . ' — ' . $shootFirst['videoPriorityNote'] : null,
        !empty($shootFirst['firstChecklist']) ? 'Checklist ถ่ายวิดีโอ (ตัวแรก): ' . $shootFirst['firstChecklist'] : null,
        ...$compliance,
        ...$qualityLines,
        ...$approveLines,
        ...$playbookLines,
        ...$weeklyReviewLines,
        ...$hygieneLines,
        ...$intakeLines,
        ...$creativeLines,
        ...$publishLines,
        ...$roiLines,
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
    $tomorrow = build_tomorrow_plan($date);
    $playbook = build_winner_playbook($date);
    $weeklyReview = build_weekly_review($date);
    $hygiene = build_posting_hygiene($date);
    $intake = build_results_intake($date);
    $creative = build_creative_performance($date);
    $publish = build_publish_queue($date);
    $roiLab = build_soft_roi_lab($date);
    $recs = $analysis['recs'];
    foreach (array_slice($tomorrow['lines'], 0, 6) as $line) {
        $recs[] = $line;
    }
    foreach (array_slice($playbook['lines'], 0, 6) as $line) {
        $recs[] = $line;
    }
    foreach (array_slice($weeklyReview['lines'], 0, 6) as $line) {
        $recs[] = $line;
    }
    foreach (array_slice($hygiene['lines'], 0, 5) as $line) {
        $recs[] = $line;
    }
    foreach (array_slice($intake['lines'], 0, 6) as $line) {
        $recs[] = $line;
    }
    foreach (array_slice($creative['lines'], 0, 6) as $line) {
        $recs[] = $line;
    }
    foreach (array_slice($publish['lines'], 0, 6) as $line) {
        $recs[] = $line;
    }
    foreach (array_slice($roiLab['lines'], 0, 5) as $line) {
        $recs[] = $line;
    }
    $recs[] = 'แคปชันที่ไม่ผ่าน disclosure/คำโฆษณาจะ Approve ไม่ได้ — กดสร้างแคปชันใหม่ที่ตารางโพสต์';
    $recs[] = 'ถ้าสินค้าอ่อนต่อเนื่อง แนะนำพักชั่วคราวเองที่หน้าสินค้า (ระบบไม่พักอัตโนมัติ)';
    if (($intake['counts']['needsAttention'] ?? 0) > 0) {
        $recs[] = 'ยังมีผลไม่ครบ ' . $intake['counts']['needsAttention'] . ' ชิ้น — กรอกที่หน้า Results ก่อนรัน Evening ซ้ำ';
    }
    if (($creative['counts']['leaders'] ?? 0) > 0) {
        $recs[] = 'มีมุมขายเด่น ' . $creative['counts']['leaders'] . ' แบบในบอร์ด Creative — ใช้เป็นสมมติฐานทดลอง ไม่การันตี';
    }
    if (($publish['counts']['needsAttention'] ?? 0) > 0) {
        $recs[] = 'ยังมี approved รอโพสต์มือ ' . $publish['counts']['needsAttention'] . ' ชิ้นที่ควรสนใจ — ดู Publish Queue';
    }
    if (($roiLab['counts']['promising'] ?? 0) > 0) {
        $recs[] = 'Soft ROI Lab มี ' . $roiLab['counts']['promising'] . ' สินค้ากลุ่มน่าลอง — ใช้ช่วงค่าคอมเป็นสมมติฐานทดลอง ไม่การันตีรายได้';
    }
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
