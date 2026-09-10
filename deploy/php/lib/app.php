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
 * Channel Fit Lab — soft ranking of TikTok / Facebook / Reels from logged metrics.
 * Never auto-publishes; never claims guaranteed income.
 */
function build_channel_fit_lab(?string $date = null, int $windowDays = 14): array
{
    $date = $date ?: today_iso();
    $window = max(7, min(30, $windowDays));
    $from = date('Y-m-d', strtotime($date . ' -' . ($window - 1) . ' days'));
    $allChannels = ['tiktok', 'facebook_reels', 'facebook_post', 'facebook_group'];

    $stmt = db()->prepare(
        "SELECT s.*, p.name AS product_name
         FROM schedule s
         LEFT JOIN products p ON p.id = s.product_id
         WHERE s.post_date BETWEEN ? AND ?
           AND s.metrics_at IS NOT NULL"
    );
    $stmt->execute([$from, $date]);
    $posted = $stmt->fetchAll() ?: [];

    $byChannel = [];
    foreach ($allChannels as $ch) {
        $byChannel[$ch] = [];
    }
    $totalCommission = 0.0;
    foreach ($posted as $s) {
        $ch = (string)$s['channel'];
        if (!isset($byChannel[$ch])) {
            $byChannel[$ch] = [];
        }
        $byChannel[$ch][] = $s;
        $totalCommission += max(0.0, (float)$s['commission_earned']);
    }
    $globalAvgCommission = $posted ? $totalCommission / count($posted) : 0.0;

    $channelsOut = [];
    foreach ($allChannels as $ch) {
        $list = $byChannel[$ch] ?? [];
        $samples = count($list);
        $views = [];
        $clicks = [];
        $orders = [];
        $comms = [];
        $sumViews = 0;
        $sumClicks = 0;
        $sumOrders = 0;
        foreach ($list as $s) {
            $v = max(0, (int)$s['views']);
            $c = max(0, (int)$s['clicks']);
            $o = max(0, (int)$s['orders_count']);
            $views[] = $v;
            $clicks[] = $c;
            $orders[] = $o;
            $comms[] = max(0.0, (float)$s['commission_earned']);
            $sumViews += $v;
            $sumClicks += $c;
            $sumOrders += $o;
        }
        $avgViews = $samples ? array_sum($views) / $samples : 0.0;
        $avgClicks = $samples ? array_sum($clicks) / $samples : 0.0;
        $avgOrders = $samples ? array_sum($orders) / $samples : 0.0;
        $avgCommission = $samples ? array_sum($comms) / $samples : 0.0;
        $avgCtr = $sumViews > 0 ? $sumClicks / $sumViews : 0.0;
        $avgOpc = $sumClicks > 0 ? $sumOrders / $sumClicks : 0.0;
        $share = count($posted) > 0 ? $samples / count($posted) : 0.0;

        $score = 0.0;
        if ($samples > 0) {
            $commBase = $globalAvgCommission > 0
                ? max(0.0, min(70.0, ($avgCommission / $globalAvgCommission) * 50))
                : max(0.0, min(50.0, $avgCommission * 2));
            $ctrScore = max(0.0, min(20.0, $avgCtr * 200));
            $opcScore = max(0.0, min(15.0, $avgOpc * 100));
            $orderScore = max(0.0, min(15.0, $avgOrders * 8));
            $score = $commBase + $ctrScore + $opcScore + $orderScore;
            if ($share >= 0.7 && $samples >= 3) {
                $score -= 12;
            } elseif ($share >= 0.55 && $samples >= 2) {
                $score -= 6;
            }
            if ($samples === 1) {
                $score *= 0.75;
            }
            $score = (int)round(max(0.0, min(100.0, $score)));
        }

        $confidence = $samples >= 4 ? 'solid' : ($samples >= 2 ? 'ok' : 'thin');
        if ($samples === 0) {
            $band = 'no_data';
        } elseif ($score >= 65 && $samples >= 2) {
            $band = 'strong';
        } elseif ($score >= 45) {
            $band = 'ok';
        } else {
            $band = 'weak';
        }

        if ($samples === 0) {
            $tip = 'ยังไม่มีผลในช่องนี้ — ลอง draft 1 ชิ้นแล้วกรอกเมตริก (อย่าโพสต์ซ้ำวันเดียวกัน)';
        } elseif ($band === 'strong') {
            $tip = 'ช่องนี้ดูเวิร์กกว่าในหน้าต่างนี้ (ทดลอง) — ใช้ต่อได้ แต่สลับมุมขาย/สินค้าเพื่อไม่ให้ซ้ำ';
        } elseif ($band === 'weak') {
            $tip = 'ผลอ่อนในช่องนี้ — ลองเปลี่ยน hook/มุม หรือย้ายไปช่องที่แข็งแรงกว่าในรอบถัดไป';
        } elseif ($share >= 0.55) {
            $tip = 'ใช้ช่องนี้บ่อย (' . round($share * 100) . '%) — กระจายไปช่องอื่นเพื่อลดความซ้ำ';
        } else {
            $tip = 'เก็บข้อมูลต่ออีก 1–2 โพสต์ในช่องนี้ก่อนสรุป — ตัวเลขยังเป็นสมมติฐาน';
        }

        $channelsOut[] = [
            'channel' => $ch,
            'channelLabel' => channel_label($ch),
            'samples' => $samples,
            'avgViews' => round($avgViews, 1),
            'avgClicks' => round($avgClicks, 1),
            'avgOrders' => round($avgOrders, 2),
            'avgCommission' => round($avgCommission, 1),
            'avgCtr' => round($avgCtr, 2),
            'avgOrdersPerClick' => round($avgOpc, 2),
            'score' => $score,
            'band' => $band,
            'confidence' => $confidence,
            'shareOfPosts' => round($share, 2),
            'tip' => $tip,
        ];
    }

    usort($channelsOut, static function ($a, $b) {
        if ($a['score'] === $b['score']) {
            return $b['samples'] <=> $a['samples'];
        }
        return $b['score'] <=> $a['score'];
    });

    $withData = array_values(array_filter($channelsOut, fn($c) => $c['samples'] > 0));
    $strong = count(array_filter($channelsOut, fn($c) => $c['band'] === 'strong'));
    $topShare = 0.0;
    foreach ($channelsOut as $c) {
        $topShare = max($topShare, (float)$c['shareOfPosts']);
    }
    $unbalanced = $topShare >= 0.55 && count($posted) >= 3;

    $scoredAvg = $withData
        ? array_sum(array_column($withData, 'score')) / count($withData)
        : 0.0;
    $labScore = (int)round($scoredAvg);
    if (count($withData) >= 3) {
        $labScore = min(100, $labScore + 8);
    } elseif (count($withData) === 1 && count($posted) >= 3) {
        $labScore = max(0, $labScore - 10);
    }
    if ($unbalanced) {
        $labScore = max(0, $labScore - 8);
    }
    $labScore = max(0, min(100, $labScore));

    if (count($withData) === 0) {
        $grade = 'D';
    } elseif ($labScore >= 75) {
        $grade = 'A';
    } elseif ($labScore >= 58) {
        $grade = 'B';
    } elseif ($labScore >= 40) {
        $grade = 'C';
    } else {
        $grade = 'D';
    }

    $best = null;
    foreach ($withData as $c) {
        if ($c['band'] === 'strong') {
            $best = $c;
            break;
        }
    }
    if (!$best && $withData) {
        $best = $withData[0];
    }
    $weak = array_values(array_filter($withData, fn($c) => $c['band'] === 'weak'));

    if (!$posted) {
        $mixTip = 'ยังไม่มีเมตริกช่องทาง — โพสต์มือแล้วกรอกผลที่ Results ก่อนจัดมิกซ์';
    } elseif ($unbalanced && $best) {
        $mixTip = 'มิกซ์เอนไปทาง ' . $best['channelLabel'] . ' มาก — วันถัดไปลองสลับช่องอื่น 1 ชิ้น (ทดลอง)';
    } elseif ($best) {
        $mixTip = 'ช่องเด่นช่วงนี้: ' . $best['channelLabel'] . ' — ใช้เป็นสมมติฐาน ไม่ล็อคทุกโพสต์ไว้ช่องเดียว';
    } else {
        $mixTip = 'เก็บผลต่ออีก 2–3 โพสต์ข้ามช่องทางก่อนจัดอันดับมิกซ์';
    }

    $slotStmt = db()->prepare(
        "SELECT s.*, p.name AS product_name
         FROM schedule s
         LEFT JOIN products p ON p.id = s.product_id
         WHERE s.post_date = ?
           AND s.status IN ('draft','approved')
         ORDER BY s.suggested_time"
    );
    $slotStmt->execute([$date]);
    $todaySlots = $slotStmt->fetchAll() ?: [];

    $preferred = null;
    foreach ($channelsOut as $c) {
        if ($c['band'] === 'strong') {
            $preferred = $c;
            break;
        }
    }
    if (!$preferred) {
        foreach ($channelsOut as $c) {
            if ($c['band'] === 'ok' && $c['samples'] > 0) {
                $preferred = $c;
                break;
            }
        }
    }

    $suggestions = [];
    foreach (array_slice($todaySlots, 0, 6) as $slot) {
        if (!$preferred) {
            break;
        }
        $currentRow = null;
        foreach ($channelsOut as $c) {
            if ($c['channel'] === $slot['channel']) {
                $currentRow = $c;
                break;
            }
        }
        $productName = (string)($slot['product_name'] ?: $slot['product_id']);
        $sameAsPreferred = $slot['channel'] === $preferred['channel'];
        $currentWeak = $currentRow && (
            $currentRow['band'] === 'weak' ||
            ($currentRow['band'] === 'no_data' && $preferred['band'] === 'strong')
        );

        if ($currentWeak && !$sameAsPreferred) {
            $suggestions[] = [
                'scheduleId' => $slot['id'],
                'productId' => $slot['product_id'],
                'productName' => $productName,
                'currentChannel' => $slot['channel'],
                'currentLabel' => channel_label((string)$slot['channel']),
                'suggestedChannel' => $preferred['channel'],
                'suggestedLabel' => $preferred['channelLabel'],
                'status' => $slot['status'],
                'reason' => channel_label((string)$slot['channel']) . ' อ่อน/ข้อมูลน้อยกว่า · ' . $preferred['channelLabel'] . ' ดูดีกว่าในหน้าต่างนี้ (ทดลอง)',
                'tip' => 'ไม่เปลี่ยนอัตโนมัติ — ถ้าย้ายช่อง ให้สร้างแคปชันใหม่ + Approve ใหม่ก่อนโพสต์มือ',
            ];
        } elseif ($unbalanced && $sameAsPreferred && $weak && count($suggestions) < 2) {
            $alt = null;
            foreach ($channelsOut as $c) {
                if ($c['channel'] !== $slot['channel'] && in_array($c['band'], ['ok', 'no_data'], true)) {
                    $alt = $c;
                    break;
                }
            }
            if (!$alt) {
                $alt = $weak[0];
            }
            $suggestions[] = [
                'scheduleId' => $slot['id'],
                'productId' => $slot['product_id'],
                'productName' => $productName,
                'currentChannel' => $slot['channel'],
                'currentLabel' => channel_label((string)$slot['channel']),
                'suggestedChannel' => $alt['channel'],
                'suggestedLabel' => $alt['channelLabel'],
                'status' => $slot['status'],
                'reason' => 'วันนี้ซ้อนช่อง ' . channel_label((string)$slot['channel']) . ' — ลองกระจายไป ' . $alt['channelLabel'] . ' เพื่อลดความซ้ำ (ทดลอง)',
                'tip' => 'ระบบไม่ย้ายช่องเอง — แก้ที่ตารางโพสต์แล้ว Approve ใหม่',
            ];
        }
    }
    $suggestions = array_slice($suggestions, 0, 5);

    $actions = [];
    if (!$posted) {
        $actions[] = [
            'id' => 'need-metrics',
            'title' => 'เริ่มเก็บผลรายช่องทาง',
            'detail' => 'Approve → โพสต์มือ → กรอก views/clicks/orders ที่ Results อย่างน้อย 1 ชิ้นต่อช่อง',
        ];
    }
    if ($best && $best['band'] === 'strong') {
        $actions[] = [
            'id' => 'lean-best',
            'title' => 'เอียงทดลองไป ' . $best['channelLabel'],
            'detail' => 'n=' . $best['samples'] . ' · คะแนนฟิต ~' . $best['score'] . ' — ใช้ 1–2 สล็อต ไม่ถล่มทุกช่อง',
        ];
    }
    if ($unbalanced) {
        $actions[] = [
            'id' => 'diversify',
            'title' => 'กระจายมิกซ์ช่องทาง',
            'detail' => 'ช่องเด่นกินสัดส่วนสูง — เพิ่ม draft คนละช่อง 1 ชิ้นในรอบถัดไป (กันสแปมฟีล)',
        ];
    }
    if ($weak) {
        $actions[] = [
            'id' => 'review-weak',
            'title' => 'ทบทวนช่องอ่อน: ' . implode(', ', array_column($weak, 'channelLabel')),
            'detail' => 'เปลี่ยน hook/มุมขาย หรือพักช่องนั้นชั่วคราว — อย่าโพสต์ซ้ำข้อความเดิม',
        ];
    }
    $actions[] = [
        'id' => 'compliance',
        'title' => 'คงกฎ Approve + disclosure',
        'detail' => 'ทุกช่องต้องมีข้อความ affiliate และผ่าน Approve ก่อนโพสต์มือ — ระบบไม่โพสต์อัตโนมัติ',
    ];
    $actions = array_slice($actions, 0, 5);

    $summary = !$posted
        ? 'Channel Fit Lab: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลหลังโพสต์มือก่อนจัดอันดับช่องทาง'
        : 'Channel Fit Lab: ' . count($posted) . ' โพสต์มีเมตริก · ช่องที่มีข้อมูล ' . count($withData)
            . ' · แข็งแรง ' . $strong . ($unbalanced ? ' · มิกซ์เอนข้างเดียว' : '');

    $checklist = [
        'อันดับช่องทางมาจากเมตริกที่คุณกรอกเอง — ไม่ดึง API แพลตฟอร์ม',
        'คะแนนฟิตเป็นสมมติฐานทดลอง ไม่การันตียอดขาย/ค่าคอม',
        'คำแนะนำย้ายช่องเป็นคำแนะนำเท่านั้น — ต้องแก้ draft + Approve เอง',
        'อย่าถล่มช่องเดียวซ้ำ ๆ ในวันเดียวกัน (กันสแปม)',
        'ทุกโพสต์ต้องมี disclosure และไม่ใช้คำโฆษณาเกินจริง',
    ];

    $bandLabel = ['strong' => 'แข็งแรง', 'ok' => 'พอใช้', 'weak' => 'อ่อน', 'no_data' => 'ยังไม่มีข้อมูล'];
    $confLabel = ['thin' => 'ข้อมูลบาง', 'ok' => 'พอใช้', 'solid' => 'หนาขึ้น'];

    $lines = ["Channel Fit Lab {$date}: เกรด {$grade} ({$labScore}/100) · {$summary}", $mixTip];
    foreach (array_slice($withData, 0, 3) as $c) {
        $lines[] = ($bandLabel[$c['band']] ?? $c['band']) . ' · ' . $c['channelLabel']
            . ': คะแนน ' . $c['score'] . ' (' . ($confLabel[$c['confidence']] ?? $c['confidence'])
            . ', n=' . $c['samples'] . ', CTR ~' . round($c['avgCtr'] * 100, 1) . '%)';
    }
    foreach (array_slice($suggestions, 0, 2) as $s) {
        $lines[] = 'แนะนำทดลอง · ' . $s['productName'] . ': ' . $s['currentLabel'] . ' → ' . $s['suggestedLabel'];
    }
    $lines[] = INCOME_DISCLAIMER;

    return [
        'date' => $date,
        'fromDate' => $from,
        'windowDays' => $window,
        'grade' => $grade,
        'score' => $labScore,
        'summary' => $summary,
        'counts' => [
            'postsWithMetrics' => count($posted),
            'channelsWithData' => count($withData),
            'unbalanced' => $unbalanced,
            'suggestions' => count($suggestions),
            'strong' => $strong,
        ],
        'channels' => $channelsOut,
        'mixTip' => $mixTip,
        'suggestions' => $suggestions,
        'actions' => $actions,
        'checklist' => $checklist,
        'lines' => $lines,
        'disclaimer' => INCOME_DISCLAIMER,
    ];
}

function channel_fit_lab_to_markdown(array $lab): string
{
    $bandLabel = ['strong' => 'แข็งแรง', 'ok' => 'พอใช้', 'weak' => 'อ่อน', 'no_data' => 'ยังไม่มีข้อมูล'];
    $confLabel = ['thin' => 'ข้อมูลบาง', 'ok' => 'พอใช้', 'solid' => 'หนาขึ้น'];
    $channelRows = [];
    foreach ($lab['channels'] as $i => $c) {
        $n = $i + 1;
        $band = $bandLabel[$c['band']] ?? $c['band'];
        $conf = $confLabel[$c['confidence']] ?? $c['confidence'];
        $channelRows[] = "{$n}. **[{$band}]** {$c['channelLabel']} · คะแนน {$c['score']}/100 · n={$c['samples']} · {$conf}\n"
            . '   CTR ~' . round($c['avgCtr'] * 100, 1) . '% · ออเดอร์/คลิก ~' . $c['avgOrdersPerClick']
            . ' · ค่าคอมเฉลี่ย ฿' . $c['avgCommission'] . "\n"
            . '   สัดส่วนในหน้าต่าง ~' . round($c['shareOfPosts'] * 100) . "%\n"
            . "   {$c['tip']}";
    }
    if (!$channelRows) {
        $channelRows[] = '_(ยังไม่มีข้อมูล)_';
    }
    $suggestionRows = [];
    foreach ($lab['suggestions'] as $i => $s) {
        $n = $i + 1;
        $suggestionRows[] = "{$n}. {$s['productName']} · {$s['status']}\n"
            . "   {$s['currentLabel']} → **{$s['suggestedLabel']}**\n"
            . "   {$s['reason']}\n"
            . "   {$s['tip']}";
    }
    if (!$suggestionRows) {
        $suggestionRows[] = '_(ไม่มีคำแนะนำย้ายช่องวันนี้)_';
    }
    $actionLines = [];
    foreach ($lab['actions'] as $a) {
        $actionLines[] = "- **{$a['title']}**: {$a['detail']}";
    }
    $checkLines = [];
    foreach ($lab['checklist'] as $c) {
        $checkLines[] = "- {$c}";
    }

    return "# Channel Fit Lab · {$lab['date']}\n\n"
        . $lab['summary'] . "\n\n"
        . "- เกรดแล็บ: {$lab['grade']} ({$lab['score']}/100)\n"
        . "- หน้าต่าง: {$lab['fromDate']} → {$lab['date']} ({$lab['windowDays']} วัน)\n"
        . "- โพสต์มีเมตริก: {$lab['counts']['postsWithMetrics']}\n"
        . "- ช่องที่มีข้อมูล: {$lab['counts']['channelsWithData']}\n"
        . "- ช่องแข็งแรง: {$lab['counts']['strong']}\n"
        . '- มิกซ์เอนข้างเดียว: ' . ($lab['counts']['unbalanced'] ? 'ใช่' : 'ไม่') . "\n\n"
        . "## มิกซ์ทิป\n"
        . $lab['mixTip'] . "\n\n"
        . "## อันดับช่องทาง (ทดลอง)\n"
        . implode("\n", $channelRows) . "\n\n"
        . "## คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)\n"
        . implode("\n", $suggestionRows) . "\n\n"
        . "## Actions\n"
        . implode("\n", $actionLines) . "\n\n"
        . "## Checklist\n"
        . implode("\n", $checkLines) . "\n\n"
        . $lab['disclaimer'] . "\n";
}

/**
 * Category Fit Lab — soft ranking of product categories from logged metrics.
 * Never auto-publishes; never claims guaranteed income.
 */
function normalize_category(?string $raw): string
{
    $t = mb_strtolower(trim((string)$raw), 'UTF-8');
    $t = preg_replace('/[\/_\-]+/u', ' ', $t) ?? '';
    // Keep letters, numbers, marks (Thai tone/vowel marks), and spaces.
    $t = preg_replace('/[^\p{L}\p{N}\p{M}\s]/u', ' ', $t) ?? '';
    $t = preg_replace('/\s+/u', ' ', $t) ?? '';
    $t = trim($t);
    return $t !== '' ? $t : 'uncategorized';
}

function category_label_th(string $key): string
{
    if ($key === 'uncategorized') {
        return 'ยังไม่ระบุหมวด';
    }
    // Prefer original form for Thai (avoid noisy case transforms).
    if (preg_match('/[\x{0E00}-\x{0E7F}]/u', $key)) {
        $parts = preg_split('/\s+/u', $key) ?: [];
        return implode(' ', array_values(array_filter($parts, fn($w) => $w !== '')));
    }
    $parts = preg_split('/\s+/u', $key) ?: [];
    $out = [];
    foreach ($parts as $w) {
        if ($w === '') continue;
        $out[] = mb_strtoupper(mb_substr($w, 0, 1, 'UTF-8'), 'UTF-8') . mb_substr($w, 1, null, 'UTF-8');
    }
    return $out ? implode(' ', $out) : $key;
}

function build_category_fit_lab(?string $date = null, int $windowDays = 14): array
{
    $date = $date ?: today_iso();
    $window = max(7, min(30, $windowDays));
    $from = date('Y-m-d', strtotime($date . ' -' . ($window - 1) . ' days'));

    $products = all_products();
    $productById = [];
    $catalogCats = [];
    foreach ($products as $p) {
        $productById[$p['id']] = $p;
        $key = normalize_category($p['category'] ?? '');
        $catalogCats[$key] = true;
    }

    $stmt = db()->prepare(
        "SELECT s.*, p.name AS product_name, p.category AS product_category, p.price AS product_price, p.commission_rate AS product_commission_rate
         FROM schedule s
         LEFT JOIN products p ON p.id = s.product_id
         WHERE s.post_date BETWEEN ? AND ?
           AND s.metrics_at IS NOT NULL"
    );
    $stmt->execute([$from, $date]);
    $posted = $stmt->fetchAll() ?: [];

    foreach ($posted as $s) {
        $key = normalize_category($s['product_category'] ?? '');
        $catalogCats[$key] = true;
    }

    $byCategory = [];
    $productsByCategory = [];
    foreach (array_keys($catalogCats) as $key) {
        $byCategory[$key] = [];
        $productsByCategory[$key] = [];
    }
    foreach ($products as $p) {
        $key = normalize_category($p['category'] ?? '');
        $productsByCategory[$key][$p['id']] = true;
    }

    $totalCommission = 0.0;
    foreach ($posted as $s) {
        $key = normalize_category($s['product_category'] ?? '');
        if (!isset($byCategory[$key])) {
            $byCategory[$key] = [];
            $productsByCategory[$key] = $productsByCategory[$key] ?? [];
        }
        $byCategory[$key][] = $s;
        $pid = (string)$s['product_id'];
        $productsByCategory[$key][$pid] = true;
        $totalCommission += max(0.0, (float)$s['commission_earned']);
    }
    $globalAvgCommission = $posted ? $totalCommission / count($posted) : 0.0;

    $bandLabel = ['hot' => 'ร้อน', 'steady' => 'นิ่ง', 'cold' => 'เย็น', 'no_data' => 'ยังไม่มีข้อมูล'];
    $confLabel = ['thin' => 'ข้อมูลบาง', 'ok' => 'พอใช้', 'solid' => 'หนาขึ้น'];

    $categoriesOut = [];
    foreach (array_keys($catalogCats) as $cat) {
        $list = $byCategory[$cat] ?? [];
        $samples = count($list);
        $productIds = array_keys($productsByCategory[$cat] ?? []);
        $views = [];
        $clicks = [];
        $orders = [];
        $comms = [];
        $sumViews = 0;
        $sumClicks = 0;
        $sumOrders = 0;
        foreach ($list as $s) {
            $v = max(0, (int)$s['views']);
            $c = max(0, (int)$s['clicks']);
            $o = max(0, (int)$s['orders_count']);
            $views[] = $v;
            $clicks[] = $c;
            $orders[] = $o;
            $comms[] = max(0.0, (float)$s['commission_earned']);
            $sumViews += $v;
            $sumClicks += $c;
            $sumOrders += $o;
        }
        $avgViews = $samples ? array_sum($views) / $samples : 0.0;
        $avgClicks = $samples ? array_sum($clicks) / $samples : 0.0;
        $avgOrders = $samples ? array_sum($orders) / $samples : 0.0;
        $avgCommission = $samples ? array_sum($comms) / $samples : 0.0;
        $avgCtr = $sumViews > 0 ? $sumClicks / $sumViews : 0.0;
        $avgOrdersPerClick = $sumClicks > 0 ? $sumOrders / $sumClicks : 0.0;
        $share = count($posted) > 0 ? $samples / count($posted) : 0.0;

        $prices = [];
        $rates = [];
        foreach ($productIds as $pid) {
            if (!isset($productById[$pid])) continue;
            $prices[] = (float)$productById[$pid]['price'];
            $rates[] = (float)$productById[$pid]['commission_rate'];
        }
        $avgPrice = $prices ? array_sum($prices) / count($prices) : 0.0;
        $avgRate = $rates ? array_sum($rates) / count($rates) : 0.0;

        $score = 0.0;
        if ($samples > 0) {
            $commBase = $globalAvgCommission > 0
                ? max(0.0, min(70.0, ($avgCommission / $globalAvgCommission) * 50))
                : max(0.0, min(50.0, $avgCommission * 2));
            $ctrScore = max(0.0, min(20.0, $avgCtr * 200));
            $opcScore = max(0.0, min(15.0, $avgOrdersPerClick * 100));
            $orderScore = max(0.0, min(15.0, $avgOrders * 8));
            $score = $commBase + $ctrScore + $opcScore + $orderScore;
            if ($avgPrice > 0 && $avgPrice <= 499) $score += 4;
            elseif ($avgPrice > 1500) $score -= 3;
            if ($share >= 0.7 && $samples >= 3) $score -= 12;
            elseif ($share >= 0.55 && $samples >= 2) $score -= 6;
            if ($samples === 1) $score *= 0.75;
            $score = max(0.0, min(100.0, $score));
        }

        if ($samples === 0) $band = 'no_data';
        elseif ($score >= 65 && $samples >= 2) $band = 'hot';
        elseif ($score >= 45) $band = 'steady';
        else $band = 'cold';

        if ($samples >= 4) $confidence = 'solid';
        elseif ($samples >= 2) $confidence = 'ok';
        else $confidence = 'thin';

        $label = category_label_th($cat);
        if ($samples === 0) {
            $tip = 'ยังไม่มีผลในหมวดนี้ — ลอง draft 1 ชิ้นแล้วกรอกเมตริก (อย่าโพสต์ซ้ำข้อความเดิม)';
        } elseif ($band === 'hot') {
            $tip = 'หมวดนี้ดูเวิร์กกว่าในหน้าต่างนี้ (ทดลอง) — ใช้ต่อได้ แต่สลับสินค้า/มุมขายเพื่อไม่ให้ซ้ำ';
        } elseif ($band === 'cold') {
            $tip = 'ผลเย็นในหมวดนี้ — ลองเปลี่ยน hook/มุม หรือพักหมวดชั่วคราวในรอบถัดไป';
        } elseif ($share >= 0.55) {
            $tip = 'ใช้หมวดนี้บ่อย (' . round($share * 100) . '%) — กระจายไปหมวดอื่นเพื่อลดความซ้ำ';
        } else {
            $tip = 'เก็บข้อมูลต่ออีก 1–2 โพสต์ในหมวดนี้ก่อนสรุป — ตัวเลขยังเป็นสมมติฐาน';
        }

        $categoriesOut[] = [
            'category' => $cat,
            'categoryLabel' => $label,
            'samples' => $samples,
            'productCount' => count($productIds),
            'avgViews' => round($avgViews, 1),
            'avgClicks' => round($avgClicks, 1),
            'avgOrders' => round($avgOrders, 2),
            'avgCommission' => round($avgCommission, 1),
            'avgCtr' => round($avgCtr, 2),
            'avgOrdersPerClick' => round($avgOrdersPerClick, 2),
            'avgPrice' => round($avgPrice, 1),
            'avgCommissionRate' => round($avgRate, 1),
            'score' => (int)round($score),
            'band' => $band,
            'confidence' => $confidence,
            'shareOfPosts' => round($share, 2),
            'tip' => $tip,
        ];
    }

    usort($categoriesOut, function ($a, $b) {
        if ($a['score'] === $b['score']) return $b['samples'] <=> $a['samples'];
        return $b['score'] <=> $a['score'];
    });

    $withData = array_values(array_filter($categoriesOut, fn($c) => $c['samples'] > 0));
    $hot = count(array_filter($categoriesOut, fn($c) => $c['band'] === 'hot'));
    $topShare = 0.0;
    foreach ($categoriesOut as $c) {
        $topShare = max($topShare, (float)$c['shareOfPosts']);
    }
    $unbalanced = $topShare >= 0.55 && count($posted) >= 3;

    $scoredAvg = $withData ? array_sum(array_column($withData, 'score')) / count($withData) : 0.0;
    $labScore = (int)round($scoredAvg);
    if (count($withData) >= 3) $labScore = min(100, $labScore + 8);
    elseif (count($withData) === 1 && count($posted) >= 3) $labScore = max(0, $labScore - 10);
    if ($unbalanced) $labScore = max(0, $labScore - 8);
    $labScore = max(0, min(100, $labScore));

    if (count($withData) === 0) $grade = 'D';
    elseif ($labScore >= 75) $grade = 'A';
    elseif ($labScore >= 58) $grade = 'B';
    elseif ($labScore >= 40) $grade = 'C';
    else $grade = 'D';

    $best = null;
    foreach ($withData as $c) {
        if ($c['band'] === 'hot') { $best = $c; break; }
    }
    if (!$best && $withData) $best = $withData[0];
    $cold = array_values(array_filter($withData, fn($c) => $c['band'] === 'cold'));

    if (count($posted) === 0) {
        $mixTip = 'ยังไม่มีเมตริกหมวดหมู่ — โพสต์มือแล้วกรอกผลที่ Results ก่อนจัดมิกซ์หมวด';
    } elseif ($unbalanced && $best) {
        $mixTip = 'มิกซ์เอนไปหมวด ' . $best['categoryLabel'] . ' มาก — วันถัดไปลองสลับหมวดอื่น 1 ชิ้น (ทดลอง)';
    } elseif ($best) {
        $mixTip = 'หมวดเด่นช่วงนี้: ' . $best['categoryLabel'] . ' — ใช้เป็นสมมติฐาน ไม่ล็อคทุกโพสต์ไว้หมวดเดียว';
    } else {
        $mixTip = 'เก็บผลต่ออีก 2–3 โพสต์ข้ามหมวดก่อนจัดอันดับมิกซ์';
    }

    $preferred = null;
    foreach ($categoriesOut as $c) {
        if ($c['band'] === 'hot') { $preferred = $c; break; }
    }
    if (!$preferred) {
        foreach ($categoriesOut as $c) {
            if ($c['band'] === 'steady' && $c['samples'] > 0) { $preferred = $c; break; }
        }
    }

    $stmt2 = db()->prepare(
        "SELECT s.*, p.name AS product_name, p.category AS product_category
         FROM schedule s
         LEFT JOIN products p ON p.id = s.product_id
         WHERE s.post_date = ?
           AND s.status IN ('draft','approved')
         ORDER BY s.suggested_time
         LIMIT 6"
    );
    $stmt2->execute([$date]);
    $todaySlots = $stmt2->fetchAll() ?: [];

    $suggestions = [];
    foreach ($todaySlots as $slot) {
        if (!$preferred) break;
        $currentKey = normalize_category($slot['product_category'] ?? '');
        $currentRow = null;
        foreach ($categoriesOut as $c) {
            if ($c['category'] === $currentKey) { $currentRow = $c; break; }
        }
        $same = $currentKey === $preferred['category'];
        $currentCold = $currentRow && (
            $currentRow['band'] === 'cold'
            || ($currentRow['band'] === 'no_data' && $preferred['band'] === 'hot')
        );

        if ($currentCold && !$same) {
            $suggestions[] = [
                'scheduleId' => $slot['id'],
                'productId' => $slot['product_id'],
                'productName' => $slot['product_name'] ?: $slot['product_id'],
                'currentCategory' => category_label_th($currentKey),
                'suggestedCategory' => $preferred['categoryLabel'],
                'status' => $slot['status'],
                'channelLabel' => channel_label($slot['channel']),
                'reason' => category_label_th($currentKey) . ' เย็น/ข้อมูลน้อยกว่า · ' . $preferred['categoryLabel'] . ' ดูดีกว่าในหน้าต่างนี้ (ทดลอง)',
                'tip' => 'ไม่สลับสินค้าอัตโนมัติ — ถ้าจะเปลี่ยนหมวด ให้เลือกสินค้าใหม่ + สร้างแคปชัน + Approve ก่อนโพสต์มือ',
            ];
        } elseif ($unbalanced && $same && $cold && count($suggestions) < 2) {
            $alt = null;
            foreach ($categoriesOut as $c) {
                if ($c['category'] !== $currentKey && in_array($c['band'], ['steady', 'no_data'], true)) {
                    $alt = $c;
                    break;
                }
            }
            if (!$alt) $alt = $cold[0];
            $suggestions[] = [
                'scheduleId' => $slot['id'],
                'productId' => $slot['product_id'],
                'productName' => $slot['product_name'] ?: $slot['product_id'],
                'currentCategory' => category_label_th($currentKey),
                'suggestedCategory' => $alt['categoryLabel'],
                'status' => $slot['status'],
                'channelLabel' => channel_label($slot['channel']),
                'reason' => 'วันนี้ซ้อนหมวด ' . category_label_th($currentKey) . ' — ลองกระจายไป ' . $alt['categoryLabel'] . ' เพื่อลดความซ้ำ (ทดลอง)',
                'tip' => 'ระบบไม่เปลี่ยนสินค้าเอง — แก้ที่คิว/สินค้าแล้ว Approve ใหม่',
            ];
        }
    }
    $suggestions = array_slice($suggestions, 0, 5);

    $actions = [];
    if (count($posted) === 0) {
        $actions[] = [
            'id' => 'need-metrics',
            'title' => 'เริ่มเก็บผลรายหมวด',
            'detail' => 'Approve → โพสต์มือ → กรอก views/clicks/orders ที่ Results อย่างน้อย 1 ชิ้นต่อหมวด',
        ];
    }
    if ($best && $best['band'] === 'hot') {
        $actions[] = [
            'id' => 'lean-best',
            'title' => 'เอียงทดลองไปหมวด ' . $best['categoryLabel'],
            'detail' => 'n=' . $best['samples'] . ' · คะแนนฟิต ~' . $best['score'] . ' — ใช้ 1–2 สล็อต ไม่ถล่มทุกโพสต์',
        ];
    }
    if ($unbalanced) {
        $actions[] = [
            'id' => 'diversify',
            'title' => 'กระจายมิกซ์หมวดหมู่',
            'detail' => 'หมวดเด่นกินสัดส่วนสูง — เพิ่ม draft คนละหมวด 1 ชิ้นในรอบถัดไป (กันสแปมฟีล)',
        ];
    }
    if ($cold) {
        $actions[] = [
            'id' => 'review-cold',
            'title' => 'ทบทวนหมวดเย็น: ' . implode(', ', array_map(fn($c) => $c['categoryLabel'], $cold)),
            'detail' => 'เปลี่ยน hook/มุมขาย หรือพักหมวดนั้นชั่วคราว — อย่าโพสต์ซ้ำข้อความเดิม',
        ];
    }
    $actions[] = [
        'id' => 'compliance',
        'title' => 'คงกฎ Approve + disclosure',
        'detail' => 'ทุกหมวดต้องมีข้อความ affiliate และผ่าน Approve ก่อนโพสต์มือ — ระบบไม่โพสต์อัตโนมัติ',
    ];
    $actions = array_slice($actions, 0, 5);

    if (count($posted) === 0) {
        $summary = 'Category Fit Lab: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลหลังโพสต์มือก่อนจัดอันดับหมวด';
    } else {
        $summary = 'Category Fit Lab: ' . count($posted) . ' โพสต์มีเมตริก · หมวดที่มีข้อมูล ' . count($withData)
            . ' · ร้อน ' . $hot . ($unbalanced ? ' · มิกซ์เอนข้างเดียว' : '');
    }

    $checklist = [
        'อันดับหมวดมาจากเมตริกที่คุณกรอกเอง — ไม่ดึง API แพลตฟอร์ม',
        'คะแนนฟิตเป็นสมมติฐานทดลอง ไม่การันตียอดขาย/ค่าคอม',
        'คำแนะนำสลับหมวดเป็นคำแนะนำเท่านั้น — ต้องเลือกสินค้า + Approve เอง',
        'อย่าถล่มหมวดเดียวซ้ำ ๆ ในวันเดียวกัน (กันสแปม)',
        'ทุกโพสต์ต้องมี disclosure และไม่ใช้คำโฆษณาเกินจริง',
    ];

    $lines = [
        "Category Fit Lab {$date}: เกรด {$grade} ({$labScore}/100) · {$summary}",
        $mixTip,
    ];
    foreach (array_slice($withData, 0, 3) as $c) {
        $lines[] = $bandLabel[$c['band']] . ' · ' . $c['categoryLabel']
            . ': คะแนน ' . $c['score'] . ' (' . $confLabel[$c['confidence']]
            . ', n=' . $c['samples'] . ', CTR ~' . round($c['avgCtr'] * 100, 1) . '%)';
    }
    foreach (array_slice($suggestions, 0, 2) as $s) {
        $lines[] = 'แนะนำทดลอง · ' . $s['productName'] . ': ' . $s['currentCategory'] . ' → ' . $s['suggestedCategory'];
    }
    $lines[] = INCOME_DISCLAIMER;

    return [
        'date' => $date,
        'fromDate' => $from,
        'windowDays' => $window,
        'grade' => $grade,
        'score' => $labScore,
        'summary' => $summary,
        'counts' => [
            'postsWithMetrics' => count($posted),
            'categoriesWithData' => count($withData),
            'unbalanced' => $unbalanced,
            'suggestions' => count($suggestions),
            'hot' => $hot,
        ],
        'categories' => $categoriesOut,
        'mixTip' => $mixTip,
        'suggestions' => $suggestions,
        'actions' => $actions,
        'checklist' => $checklist,
        'lines' => $lines,
        'disclaimer' => INCOME_DISCLAIMER,
    ];
}

function category_fit_lab_to_markdown(array $lab): string
{
    $bandLabel = ['hot' => 'ร้อน', 'steady' => 'นิ่ง', 'cold' => 'เย็น', 'no_data' => 'ยังไม่มีข้อมูล'];
    $confLabel = ['thin' => 'ข้อมูลบาง', 'ok' => 'พอใช้', 'solid' => 'หนาขึ้น'];
    $categoryRows = [];
    $idx = 0;
    foreach ($lab['categories'] as $c) {
        if (($c['samples'] ?? 0) <= 0 && ($c['productCount'] ?? 0) <= 0) continue;
        $idx++;
        $categoryRows[] = "{$idx}. **[{$bandLabel[$c['band']]}]** {$c['categoryLabel']} · คะแนน {$c['score']}/100 · n={$c['samples']} · {$confLabel[$c['confidence']]}\n"
            . "   สินค้าในแคตตาล็อก {$c['productCount']} · ราคาเฉลี่ย ฿{$c['avgPrice']} · คอมฯ ~{$c['avgCommissionRate']}%\n"
            . '   CTR ~' . round($c['avgCtr'] * 100, 1) . '% · ออเดอร์/คลิก ~' . $c['avgOrdersPerClick']
            . ' · ค่าคอมเฉลี่ย ฿' . $c['avgCommission'] . "\n"
            . '   สัดส่วนในหน้าต่าง ~' . round($c['shareOfPosts'] * 100) . "%\n"
            . "   {$c['tip']}";
    }
    if (!$categoryRows) {
        $categoryRows[] = '_(ยังไม่มีข้อมูล)_';
    }
    $suggestionRows = [];
    foreach ($lab['suggestions'] as $i => $s) {
        $n = $i + 1;
        $suggestionRows[] = "{$n}. {$s['productName']} · {$s['status']} · {$s['channelLabel']}\n"
            . "   {$s['currentCategory']} → **{$s['suggestedCategory']}**\n"
            . "   {$s['reason']}\n"
            . "   {$s['tip']}";
    }
    if (!$suggestionRows) {
        $suggestionRows[] = '_(ไม่มีคำแนะนำสลับหมวดวันนี้)_';
    }
    $actionLines = [];
    foreach ($lab['actions'] as $a) {
        $actionLines[] = "- **{$a['title']}**: {$a['detail']}";
    }
    $checkLines = [];
    foreach ($lab['checklist'] as $c) {
        $checkLines[] = "- {$c}";
    }

    return "# Category Fit Lab · {$lab['date']}\n\n"
        . $lab['summary'] . "\n\n"
        . "- เกรดแล็บ: {$lab['grade']} ({$lab['score']}/100)\n"
        . "- หน้าต่าง: {$lab['fromDate']} → {$lab['date']} ({$lab['windowDays']} วัน)\n"
        . "- โพสต์มีเมตริก: {$lab['counts']['postsWithMetrics']}\n"
        . "- หมวดที่มีข้อมูล: {$lab['counts']['categoriesWithData']}\n"
        . "- หมวดร้อน: {$lab['counts']['hot']}\n"
        . '- มิกซ์เอนข้างเดียว: ' . ($lab['counts']['unbalanced'] ? 'ใช่' : 'ไม่') . "\n\n"
        . "## มิกซ์ทิป\n"
        . $lab['mixTip'] . "\n\n"
        . "## อันดับหมวดหมู่ (ทดลอง)\n"
        . implode("\n", $categoryRows) . "\n\n"
        . "## คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)\n"
        . implode("\n", $suggestionRows) . "\n\n"
        . "## Actions\n"
        . implode("\n", $actionLines) . "\n\n"
        . "## Checklist\n"
        . implode("\n", $checkLines) . "\n\n"
        . $lab['disclaimer'] . "\n";
}


/**
 * Price Band Lab — soft ranking of impulse/price bands from logged metrics.
 * Never auto-publishes; never claims guaranteed income.
 */
function price_band_of(float $price): string
{
    if (!is_finite($price) || $price < 99) return 'under99';
    if ($price <= 399) return 'impulse99_399';
    if ($price <= 799) return 'mid400_799';
    if ($price <= 1499) return 'mid800_1499';
    return 'premium1500';
}

function price_band_label_th(string $band): string
{
    $labels = [
        'under99' => 'ต่ำกว่า ฿99',
        'impulse99_399' => 'Impulse ฿99–399',
        'mid400_799' => 'กลาง ฿400–799',
        'mid800_1499' => 'กลางสูง ฿800–1,499',
        'premium1500' => 'พรีเมียม ฿1,500+',
    ];
    return $labels[$band] ?? $band;
}

function price_band_range_label(string $band): string
{
    $labels = [
        'under99' => '<฿99',
        'impulse99_399' => '฿99–399',
        'mid400_799' => '฿400–799',
        'mid800_1499' => '฿800–1,499',
        'premium1500' => '≥฿1,500',
    ];
    return $labels[$band] ?? $band;
}

function build_price_band_fit_lab(?string $date = null, int $windowDays = 14): array
{
    $date = $date ?: today_iso();
    $window = max(7, min(30, $windowDays));
    $from = date('Y-m-d', strtotime($date . ' -' . ($window - 1) . ' days'));
    $order = ['under99', 'impulse99_399', 'mid400_799', 'mid800_1499', 'premium1500'];

    $products = all_products();
    $productById = [];
    $productsByBand = [];
    $byBand = [];
    foreach ($order as $band) {
        $byBand[$band] = [];
        $productsByBand[$band] = [];
    }
    foreach ($products as $p) {
        $productById[$p['id']] = $p;
        $key = price_band_of((float)$p['price']);
        $productsByBand[$key][$p['id']] = true;
    }

    $stmt = db()->prepare(
        "SELECT s.*, p.name AS product_name, p.price AS product_price, p.commission_rate AS product_commission_rate
         FROM schedule s
         LEFT JOIN products p ON p.id = s.product_id
         WHERE s.post_date BETWEEN ? AND ?
           AND s.metrics_at IS NOT NULL"
    );
    $stmt->execute([$from, $date]);
    $posted = $stmt->fetchAll() ?: [];

    $totalCommission = 0.0;
    foreach ($posted as $s) {
        $price = isset($s['product_price']) ? (float)$s['product_price'] : 0.0;
        $key = price_band_of($price);
        $byBand[$key][] = $s;
        $pid = (string)$s['product_id'];
        $productsByBand[$key][$pid] = true;
        $totalCommission += max(0.0, (float)$s['commission_earned']);
    }
    $globalAvgCommission = $posted ? $totalCommission / count($posted) : 0.0;

    $statusLabel = ['hot' => 'ร้อน', 'steady' => 'นิ่ง', 'cold' => 'เย็น', 'no_data' => 'ยังไม่มีข้อมูล'];
    $confLabel = ['thin' => 'ข้อมูลบาง', 'ok' => 'พอใช้', 'solid' => 'หนาขึ้น'];

    $bands = [];
    foreach ($order as $band) {
        $list = $byBand[$band] ?? [];
        $samples = count($list);
        $productIds = array_keys($productsByBand[$band] ?? []);
        $productsInBand = [];
        foreach ($productIds as $pid) {
            if (isset($productById[$pid])) $productsInBand[] = $productById[$pid];
        }
        $views = array_map(fn($s) => (float)$s['views'], $list);
        $clicks = array_map(fn($s) => (float)$s['clicks'], $list);
        $orders = array_map(fn($s) => (float)$s['orders_count'], $list);
        $commissions = array_map(fn($s) => (float)$s['commission_earned'], $list);
        $avgViews = $samples ? array_sum($views) / $samples : 0.0;
        $avgClicks = $samples ? array_sum($clicks) / $samples : 0.0;
        $avgOrders = $samples ? array_sum($orders) / $samples : 0.0;
        $avgCommission = $samples ? array_sum($commissions) / $samples : 0.0;
        $totalViews = array_sum($views);
        $totalClicks = array_sum($clicks);
        $totalOrders = array_sum($orders);
        $avgCtr = $totalViews > 0 ? $totalClicks / $totalViews : 0.0;
        $avgOrdersPerClick = $totalClicks > 0 ? $totalOrders / $totalClicks : 0.0;
        $shareOfPosts = $posted ? $samples / count($posted) : 0.0;
        $avgPrice = $productsInBand ? array_sum(array_map(fn($p) => (float)$p['price'], $productsInBand)) / count($productsInBand) : 0.0;
        $avgCommissionRate = $productsInBand ? array_sum(array_map(fn($p) => (float)$p['commissionRate'], $productsInBand)) / count($productsInBand) : 0.0;

        $score = 0.0;
        if ($samples > 0) {
            $commBase = $globalAvgCommission > 0
                ? max(0.0, min(70.0, ($avgCommission / $globalAvgCommission) * 50))
                : max(0.0, min(50.0, $avgCommission * 2));
            $ctrScore = max(0.0, min(20.0, $avgCtr * 200));
            $opcScore = max(0.0, min(15.0, $avgOrdersPerClick * 100));
            $orderScore = max(0.0, min(15.0, $avgOrders * 8));
            $score = $commBase + $ctrScore + $opcScore + $orderScore;
            if ($band === 'impulse99_399') $score += 5;
            elseif ($band === 'mid400_799') $score += 3;
            elseif ($band === 'premium1500') $score -= 2;
            if ($shareOfPosts >= 0.7 && $samples >= 3) $score -= 12;
            elseif ($shareOfPosts >= 0.55 && $samples >= 2) $score -= 6;
            if ($samples === 1) $score *= 0.75;
            $score = max(0.0, min(100.0, $score));
        }
        $score = (int)round($score);
        $confidence = $samples >= 4 ? 'solid' : ($samples >= 2 ? 'ok' : 'thin');
        if ($samples === 0) $status = 'no_data';
        elseif ($score >= 65 && $samples >= 2) $status = 'hot';
        elseif ($score >= 45) $status = 'steady';
        else $status = 'cold';

        if ($samples === 0) {
            $tip = 'ยังไม่มีผลในช่วงราคานี้ — ลอง draft 1 ชิ้นแล้วกรอกเมตริก (อย่าโพสต์ซ้ำข้อความเดิม)';
        } elseif ($status === 'hot') {
            $tip = 'ช่วงราคานี้ดูเวิร์กกว่าในหน้าต่างนี้ (ทดลอง) — ใช้ต่อได้ แต่สลับสินค้า/มุมขายเพื่อไม่ให้ซ้ำ';
        } elseif ($status === 'cold') {
            $tip = 'ผลเย็นในช่วงราคานี้ — ลองเปลี่ยน hook/มุม หรือเลี่ยงช่วงนี้ชั่วคราวในรอบถัดไป';
        } elseif ($shareOfPosts >= 0.55) {
            $tip = 'ใช้ช่วงราคานี้บ่อย (' . round($shareOfPosts * 100) . '%) — กระจายไปช่วงอื่นเพื่อลดความซ้ำ';
        } else {
            $tip = 'เก็บข้อมูลต่ออีก 1–2 โพสต์ในช่วงราคานี้ก่อนสรุป — ตัวเลขยังเป็นสมมติฐาน';
        }

        $bands[] = [
            'band' => $band,
            'bandLabel' => price_band_label_th($band),
            'rangeLabel' => price_band_range_label($band),
            'samples' => $samples,
            'productCount' => count($productIds),
            'avgViews' => round($avgViews, 1),
            'avgClicks' => round($avgClicks, 1),
            'avgOrders' => round($avgOrders, 2),
            'avgCommission' => round($avgCommission, 1),
            'avgCtr' => round($avgCtr, 2),
            'avgOrdersPerClick' => round($avgOrdersPerClick, 2),
            'avgPrice' => round($avgPrice, 1),
            'avgCommissionRate' => round($avgCommissionRate, 1),
            'score' => $score,
            'status' => $status,
            'confidence' => $confidence,
            'shareOfPosts' => round($shareOfPosts, 2),
            'tip' => $tip,
        ];
    }

    usort($bands, function ($a, $b) {
        if ($a['score'] === $b['score']) return $b['samples'] <=> $a['samples'];
        return $b['score'] <=> $a['score'];
    });

    $withData = array_values(array_filter($bands, fn($b) => $b['samples'] > 0));
    $hot = count(array_filter($bands, fn($b) => $b['status'] === 'hot'));
    $topShare = 0.0;
    foreach ($bands as $b) $topShare = max($topShare, (float)$b['shareOfPosts']);
    $unbalanced = $topShare >= 0.55 && count($posted) >= 3;

    $scoredAvg = $withData ? array_sum(array_map(fn($b) => $b['score'], $withData)) / count($withData) : 0.0;
    $labScore = (int)round($scoredAvg);
    if (count($withData) >= 3) $labScore = min(100, $labScore + 8);
    elseif (count($withData) === 1 && count($posted) >= 3) $labScore = max(0, $labScore - 10);
    if ($unbalanced) $labScore = max(0, $labScore - 8);
    $labScore = max(0, min(100, $labScore));
    if (count($withData) === 0) $grade = 'D';
    elseif ($labScore >= 75) $grade = 'A';
    elseif ($labScore >= 58) $grade = 'B';
    elseif ($labScore >= 40) $grade = 'C';
    else $grade = 'D';

    $best = null;
    foreach ($withData as $b) {
        if ($b['status'] === 'hot') { $best = $b; break; }
    }
    if (!$best && $withData) $best = $withData[0];
    $cold = array_values(array_filter($withData, fn($b) => $b['status'] === 'cold'));

    if (!$posted) {
        $mixTip = 'ยังไม่มีเมตริกช่วงราคา — โพสต์มือแล้วกรอกผลที่ Results ก่อนจัดมิกซ์ราคา';
    } elseif ($unbalanced && $best) {
        $mixTip = 'มิกซ์เอนไปช่วง ' . $best['bandLabel'] . ' มาก — วันถัดไปลองสลับช่วงราคาอื่น 1 ชิ้น (ทดลอง)';
    } elseif ($best) {
        $mixTip = 'ช่วงราคาเด่น: ' . $best['bandLabel'] . ' — ใช้เป็นสมมติฐาน ไม่ล็อคทุกโพสต์ไว้ช่วงเดียว';
    } else {
        $mixTip = 'เก็บผลต่ออีก 2–3 โพสต์ข้ามช่วงราคาก่อนจัดอันดับมิกซ์';
    }

    $stmt = db()->prepare("SELECT * FROM schedule WHERE post_date=? AND status IN ('draft','approved') ORDER BY suggested_time ASC LIMIT 6");
    $stmt->execute([$date]);
    $todaySlots = $stmt->fetchAll() ?: [];

    $preferred = null;
    foreach ($bands as $b) {
        if ($b['status'] === 'hot') { $preferred = $b; break; }
    }
    if (!$preferred) {
        foreach ($bands as $b) {
            if ($b['status'] === 'steady' && $b['samples'] > 0) { $preferred = $b; break; }
        }
    }

    $suggestions = [];
    foreach ($todaySlots as $slot) {
        $product = $productById[$slot['product_id']] ?? null;
        if (!$product || !$preferred) continue;
        $currentKey = price_band_of((float)$product['price']);
        $currentRow = null;
        foreach ($bands as $b) {
            if ($b['band'] === $currentKey) { $currentRow = $b; break; }
        }
        $sameAsPreferred = $currentKey === $preferred['band'];
        $currentCold = $currentRow && (
            $currentRow['status'] === 'cold' ||
            ($currentRow['status'] === 'no_data' && $preferred['status'] === 'hot')
        );

        if ($currentCold && !$sameAsPreferred) {
            $suggestions[] = [
                'scheduleId' => $slot['id'],
                'productId' => $product['id'],
                'productName' => $product['name'],
                'currentBand' => $currentKey,
                'currentLabel' => price_band_label_th($currentKey),
                'suggestedBand' => $preferred['band'],
                'suggestedLabel' => $preferred['bandLabel'],
                'price' => (float)$product['price'],
                'status' => $slot['status'],
                'channelLabel' => channel_label($slot['channel']),
                'reason' => price_band_label_th($currentKey) . ' เย็น/ข้อมูลน้อยกว่า · ' . $preferred['bandLabel'] . ' ดูดีกว่าในหน้าต่างนี้ (ทดลอง)',
                'tip' => 'ไม่สลับสินค้าอัตโนมัติ — ถ้าจะเปลี่ยนช่วงราคา ให้เลือกสินค้าใหม่ + สร้างแคปชัน + Approve ก่อนโพสต์มือ',
            ];
        } elseif ($unbalanced && $sameAsPreferred && $cold && count($suggestions) < 2) {
            $alt = null;
            foreach ($bands as $b) {
                if ($b['band'] !== $currentKey && in_array($b['status'], ['steady', 'no_data'], true)) {
                    $alt = $b;
                    break;
                }
            }
            if (!$alt) $alt = $cold[0];
            $suggestions[] = [
                'scheduleId' => $slot['id'],
                'productId' => $product['id'],
                'productName' => $product['name'],
                'currentBand' => $currentKey,
                'currentLabel' => price_band_label_th($currentKey),
                'suggestedBand' => $alt['band'],
                'suggestedLabel' => $alt['bandLabel'],
                'price' => (float)$product['price'],
                'status' => $slot['status'],
                'channelLabel' => channel_label($slot['channel']),
                'reason' => 'วันนี้ซ้อนช่วง ' . price_band_label_th($currentKey) . ' — ลองกระจายไป ' . $alt['bandLabel'] . ' เพื่อลดความซ้ำ (ทดลอง)',
                'tip' => 'ระบบไม่เปลี่ยนสินค้าเอง — แก้ที่คิว/สินค้าแล้ว Approve ใหม่',
            ];
        }
        if (count($suggestions) >= 5) break;
    }

    $actions = [];
    if (!$posted) {
        $actions[] = [
            'id' => 'need-metrics',
            'title' => 'เริ่มเก็บผลรายช่วงราคา',
            'detail' => 'Approve → โพสต์มือ → กรอก views/clicks/orders ที่ Results อย่างน้อย 1 ชิ้นต่อช่วงราคา',
        ];
    }
    if ($best && $best['status'] === 'hot') {
        $actions[] = [
            'id' => 'lean-best',
            'title' => 'เอียงทดลองไปช่วง ' . $best['bandLabel'],
            'detail' => 'n=' . $best['samples'] . ' · คะแนนฟิต ~' . $best['score'] . ' — ใช้ 1–2 สล็อต ไม่ถล่มทุกโพสต์',
        ];
    }
    if ($unbalanced) {
        $actions[] = [
            'id' => 'diversify',
            'title' => 'กระจายมิกซ์ช่วงราคา',
            'detail' => 'ช่วงราคาเด่นกินสัดส่วนสูง — เพิ่ม draft คนละช่วง 1 ชิ้นในรอบถัดไป (กันสแปมฟีล)',
        ];
    }
    if ($cold) {
        $coldLabels = implode(', ', array_map(fn($b) => $b['bandLabel'], $cold));
        $actions[] = [
            'id' => 'review-cold',
            'title' => 'ทบทวนช่วงเย็น: ' . $coldLabels,
            'detail' => 'เปลี่ยน hook/มุมขาย หรือพักช่วงราคานั้นชั่วคราว — อย่าโพสต์ซ้ำข้อความเดิม',
        ];
    }
    $actions[] = [
        'id' => 'compliance',
        'title' => 'คงกฎ Approve + disclosure',
        'detail' => 'ทุกช่วงราคาต้องมีข้อความ affiliate และผ่าน Approve ก่อนโพสต์มือ — ระบบไม่โพสต์อัตโนมัติ',
    ];
    $actions = array_slice($actions, 0, 5);

    if (!$posted) {
        $summary = 'Price Band Lab: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลหลังโพสต์มือก่อนจัดอันดับช่วงราคา';
    } else {
        $summary = 'Price Band Lab: ' . count($posted) . ' โพสต์มีเมตริก · ช่วงที่มีข้อมูล ' . count($withData)
            . ' · ร้อน ' . $hot . ($unbalanced ? ' · มิกซ์เอนข้างเดียว' : '');
    }

    $checklist = [
        'อันดับช่วงราคามาจากเมตริกที่คุณกรอกเอง — ไม่ดึง API แพลตฟอร์ม',
        'คะแนนฟิตเป็นสมมติฐานทดลอง ไม่การันตียอดขาย/ค่าคอม',
        'คำแนะนำสลับช่วงราคาเป็นคำแนะนำเท่านั้น — ต้องเลือกสินค้า + Approve เอง',
        'อย่าถล่มช่วงราคาเดียวซ้ำ ๆ ในวันเดียวกัน (กันสแปม)',
        'ทุกโพสต์ต้องมี disclosure และไม่ใช้คำโฆษณาเกินจริง',
    ];

    $lines = [
        "Price Band Lab {$date}: เกรด {$grade} ({$labScore}/100) · {$summary}",
        $mixTip,
    ];
    foreach (array_slice($withData, 0, 3) as $b) {
        $lines[] = $statusLabel[$b['status']] . ' · ' . $b['bandLabel'] . ': คะแนน ' . $b['score']
            . ' (' . $confLabel[$b['confidence']] . ', n=' . $b['samples']
            . ', CTR ~' . round($b['avgCtr'] * 100, 1) . '%)';
    }
    foreach (array_slice($suggestions, 0, 2) as $s) {
        $lines[] = 'แนะนำทดลอง · ' . $s['productName'] . ': ' . $s['currentLabel'] . ' → ' . $s['suggestedLabel'];
    }
    $lines[] = INCOME_DISCLAIMER;

    return [
        'date' => $date,
        'fromDate' => $from,
        'windowDays' => $window,
        'grade' => $grade,
        'score' => $labScore,
        'summary' => $summary,
        'counts' => [
            'postsWithMetrics' => count($posted),
            'bandsWithData' => count($withData),
            'unbalanced' => $unbalanced,
            'suggestions' => count($suggestions),
            'hot' => $hot,
        ],
        'bands' => $bands,
        'mixTip' => $mixTip,
        'suggestions' => array_slice($suggestions, 0, 5),
        'actions' => $actions,
        'checklist' => $checklist,
        'lines' => $lines,
        'disclaimer' => INCOME_DISCLAIMER,
    ];
}

function price_band_fit_lab_to_markdown(array $lab): string
{
    $statusLabel = ['hot' => 'ร้อน', 'steady' => 'นิ่ง', 'cold' => 'เย็น', 'no_data' => 'ยังไม่มีข้อมูล'];
    $confLabel = ['thin' => 'ข้อมูลบาง', 'ok' => 'พอใช้', 'solid' => 'หนาขึ้น'];
    $bandRows = [];
    $idx = 0;
    foreach ($lab['bands'] as $b) {
        if (($b['samples'] ?? 0) <= 0 && ($b['productCount'] ?? 0) <= 0) continue;
        $idx++;
        $bandRows[] = "{$idx}. **[{$statusLabel[$b['status']]}]** {$b['bandLabel']} ({$b['rangeLabel']}) · คะแนน {$b['score']}/100 · n={$b['samples']} · {$confLabel[$b['confidence']]}\n"
            . "   สินค้าในแคตตาล็อก {$b['productCount']} · ราคาเฉลี่ย ฿{$b['avgPrice']} · คอมฯ ~{$b['avgCommissionRate']}%\n"
            . '   CTR ~' . round($b['avgCtr'] * 100, 1) . '% · ออเดอร์/คลิก ~' . $b['avgOrdersPerClick']
            . ' · ค่าคอมเฉลี่ย ฿' . $b['avgCommission'] . "\n"
            . '   สัดส่วนในหน้าต่าง ~' . round($b['shareOfPosts'] * 100) . "%\n"
            . "   {$b['tip']}";
    }
    if (!$bandRows) {
        $bandRows[] = '_(ยังไม่มีข้อมูล)_';
    }
    $suggestionRows = [];
    foreach ($lab['suggestions'] as $i => $s) {
        $n = $i + 1;
        $suggestionRows[] = "{$n}. {$s['productName']} · {$s['status']} · {$s['channelLabel']} · ฿{$s['price']}\n"
            . "   {$s['currentLabel']} → **{$s['suggestedLabel']}**\n"
            . "   {$s['reason']}\n"
            . "   {$s['tip']}";
    }
    if (!$suggestionRows) {
        $suggestionRows[] = '_(ไม่มีคำแนะนำสลับช่วงราคาวันนี้)_';
    }
    $actionLines = [];
    foreach ($lab['actions'] as $a) {
        $actionLines[] = "- **{$a['title']}**: {$a['detail']}";
    }
    $checkLines = [];
    foreach ($lab['checklist'] as $c) {
        $checkLines[] = "- {$c}";
    }

    return "# Price Band Lab · {$lab['date']}\n\n"
        . $lab['summary'] . "\n\n"
        . "- เกรดแล็บ: {$lab['grade']} ({$lab['score']}/100)\n"
        . "- หน้าต่าง: {$lab['fromDate']} → {$lab['date']} ({$lab['windowDays']} วัน)\n"
        . "- โพสต์มีเมตริก: {$lab['counts']['postsWithMetrics']}\n"
        . "- ช่วงราคาที่มีข้อมูล: {$lab['counts']['bandsWithData']}\n"
        . "- ช่วงร้อน: {$lab['counts']['hot']}\n"
        . '- มิกซ์เอนข้างเดียว: ' . ($lab['counts']['unbalanced'] ? 'ใช่' : 'ไม่') . "\n\n"
        . "## มิกซ์ทิป\n"
        . $lab['mixTip'] . "\n\n"
        . "## อันดับช่วงราคา (ทดลอง)\n"
        . implode("\n", $bandRows) . "\n\n"
        . "## คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)\n"
        . implode("\n", $suggestionRows) . "\n\n"
        . "## Actions\n"
        . implode("\n", $actionLines) . "\n\n"
        . "## Checklist\n"
        . implode("\n", $checkLines) . "\n\n"
        . $lab['disclaimer'] . "\n";
}

/**
 * Commission Band Lab — soft ranking of commission-rate bands from logged metrics.
 * Never auto-publishes; never claims guaranteed income.
 */
function commission_band_of(float $rate): string
{
    if (!is_finite($rate) || $rate < 8) return 'under8';
    if ($rate < 12) return 'mid8_11';
    if ($rate < 20) return 'good12_19';
    if ($rate < 30) return 'strong20_29';
    return 'high30';
}

function commission_band_label_th(string $band): string
{
    $labels = [
        'under8' => 'ต่ำกว่า 8%',
        'mid8_11' => 'กลาง 8–11%',
        'good12_19' => 'ดี 12–19%',
        'strong20_29' => 'แข็ง 20–29%',
        'high30' => 'สูง ≥30%',
    ];
    return $labels[$band] ?? $band;
}

function commission_band_range_label(string $band): string
{
    $labels = [
        'under8' => '<8%',
        'mid8_11' => '8–11%',
        'good12_19' => '12–19%',
        'strong20_29' => '20–29%',
        'high30' => '≥30%',
    ];
    return $labels[$band] ?? $band;
}

function build_commission_band_fit_lab(?string $date = null, int $windowDays = 14): array
{
    $date = $date ?: today_iso();
    $window = max(7, min(30, $windowDays));
    $from = date('Y-m-d', strtotime($date . ' -' . ($window - 1) . ' days'));
    $order = ['under8', 'mid8_11', 'good12_19', 'strong20_29', 'high30'];

    $products = all_products();
    $productById = [];
    $productsByBand = [];
    $byBand = [];
    foreach ($order as $band) {
        $byBand[$band] = [];
        $productsByBand[$band] = [];
    }
    foreach ($products as $p) {
        $productById[$p['id']] = $p;
        $key = commission_band_of((float)$p['commissionRate']);
        $productsByBand[$key][$p['id']] = true;
    }

    $stmt = db()->prepare(
        "SELECT s.*, p.name AS product_name, p.price AS product_price, p.commission_rate AS product_commission_rate
         FROM schedule s
         LEFT JOIN products p ON p.id = s.product_id
         WHERE s.post_date BETWEEN ? AND ?
           AND s.metrics_at IS NOT NULL"
    );
    $stmt->execute([$from, $date]);
    $posted = $stmt->fetchAll() ?: [];

    $totalCommission = 0.0;
    foreach ($posted as $s) {
        $rate = isset($s['product_commission_rate']) ? (float)$s['product_commission_rate'] : 0.0;
        $key = commission_band_of($rate);
        $byBand[$key][] = $s;
        $pid = (string)$s['product_id'];
        $productsByBand[$key][$pid] = true;
        $totalCommission += max(0.0, (float)$s['commission_earned']);
    }
    $globalAvgCommission = $posted ? $totalCommission / count($posted) : 0.0;

    $statusLabel = ['hot' => 'ร้อน', 'steady' => 'นิ่ง', 'cold' => 'เย็น', 'no_data' => 'ยังไม่มีข้อมูล'];
    $confLabel = ['thin' => 'ข้อมูลบาง', 'ok' => 'พอใช้', 'solid' => 'หนาขึ้น'];

    $bands = [];
    foreach ($order as $band) {
        $list = $byBand[$band] ?? [];
        $samples = count($list);
        $productIds = array_keys($productsByBand[$band] ?? []);
        $productsInBand = [];
        foreach ($productIds as $pid) {
            if (isset($productById[$pid])) $productsInBand[] = $productById[$pid];
        }
        $views = array_map(fn($s) => (float)$s['views'], $list);
        $clicks = array_map(fn($s) => (float)$s['clicks'], $list);
        $orders = array_map(fn($s) => (float)$s['orders_count'], $list);
        $commissions = array_map(fn($s) => (float)$s['commission_earned'], $list);
        $avgViews = $samples ? array_sum($views) / $samples : 0.0;
        $avgClicks = $samples ? array_sum($clicks) / $samples : 0.0;
        $avgOrders = $samples ? array_sum($orders) / $samples : 0.0;
        $avgCommission = $samples ? array_sum($commissions) / $samples : 0.0;
        $totalViews = array_sum($views);
        $totalClicks = array_sum($clicks);
        $totalOrders = array_sum($orders);
        $avgCtr = $totalViews > 0 ? $totalClicks / $totalViews : 0.0;
        $avgOrdersPerClick = $totalClicks > 0 ? $totalOrders / $totalClicks : 0.0;
        $shareOfPosts = $posted ? $samples / count($posted) : 0.0;
        $avgPrice = $productsInBand ? array_sum(array_map(fn($p) => (float)$p['price'], $productsInBand)) / count($productsInBand) : 0.0;
        $avgCommissionRate = $productsInBand ? array_sum(array_map(fn($p) => (float)$p['commissionRate'], $productsInBand)) / count($productsInBand) : 0.0;

        $score = 0.0;
        if ($samples > 0) {
            $commBase = $globalAvgCommission > 0
                ? max(0.0, min(70.0, ($avgCommission / $globalAvgCommission) * 50))
                : max(0.0, min(50.0, $avgCommission * 2));
            $ctrScore = max(0.0, min(20.0, $avgCtr * 200));
            $opcScore = max(0.0, min(15.0, $avgOrdersPerClick * 100));
            $orderScore = max(0.0, min(15.0, $avgOrders * 8));
            $score = $commBase + $ctrScore + $opcScore + $orderScore;
            if ($band === 'good12_19') $score += 5;
            elseif ($band === 'strong20_29') $score += 4;
            elseif ($band === 'mid8_11') $score += 2;
            elseif ($band === 'under8') $score -= 3;
            elseif ($band === 'high30') $score += 1;
            if ($shareOfPosts >= 0.7 && $samples >= 3) $score -= 12;
            elseif ($shareOfPosts >= 0.55 && $samples >= 2) $score -= 6;
            if ($samples === 1) $score *= 0.75;
            $score = max(0.0, min(100.0, $score));
        }
        $score = (int)round($score);
        $confidence = $samples >= 4 ? 'solid' : ($samples >= 2 ? 'ok' : 'thin');
        if ($samples === 0) $status = 'no_data';
        elseif ($score >= 65 && $samples >= 2) $status = 'hot';
        elseif ($score >= 45) $status = 'steady';
        else $status = 'cold';

        if ($samples === 0) {
            $tip = 'ยังไม่มีผลในช่วงคอมฯ นี้ — ลอง draft 1 ชิ้นแล้วกรอกเมตริก (อย่าโพสต์ซ้ำข้อความเดิม)';
        } elseif ($status === 'hot') {
            $tip = 'ช่วงคอมฯ นี้ดูเวิร์กกว่าในหน้าต่างนี้ (ทดลอง) — ใช้ต่อได้ แต่สลับสินค้า/มุมขายเพื่อไม่ให้ซ้ำ';
        } elseif ($status === 'cold') {
            $tip = 'ผลเย็นในช่วงคอมฯ นี้ — ลองเปลี่ยน hook/มุม หรือเลี่ยงช่วงนี้ชั่วคราวในรอบถัดไป';
        } elseif ($shareOfPosts >= 0.55) {
            $tip = 'ใช้ช่วงคอมฯ นี้บ่อย (' . round($shareOfPosts * 100) . '%) — กระจายไปช่วงอื่นเพื่อลดความซ้ำ';
        } else {
            $tip = 'เก็บข้อมูลต่ออีก 1–2 โพสต์ในช่วงคอมฯ นี้ก่อนสรุป — ตัวเลขยังเป็นสมมติฐาน';
        }

        $bands[] = [
            'band' => $band,
            'bandLabel' => commission_band_label_th($band),
            'rangeLabel' => commission_band_range_label($band),
            'samples' => $samples,
            'productCount' => count($productIds),
            'avgViews' => round($avgViews, 1),
            'avgClicks' => round($avgClicks, 1),
            'avgOrders' => round($avgOrders, 2),
            'avgCommission' => round($avgCommission, 1),
            'avgCtr' => round($avgCtr, 2),
            'avgOrdersPerClick' => round($avgOrdersPerClick, 2),
            'avgPrice' => round($avgPrice, 1),
            'avgCommissionRate' => round($avgCommissionRate, 1),
            'score' => $score,
            'status' => $status,
            'confidence' => $confidence,
            'shareOfPosts' => round($shareOfPosts, 2),
            'tip' => $tip,
        ];
    }

    usort($bands, function ($a, $b) {
        if ($a['score'] === $b['score']) return $b['samples'] <=> $a['samples'];
        return $b['score'] <=> $a['score'];
    });

    $withData = array_values(array_filter($bands, fn($b) => $b['samples'] > 0));
    $hot = count(array_filter($bands, fn($b) => $b['status'] === 'hot'));
    $topShare = 0.0;
    foreach ($bands as $b) $topShare = max($topShare, (float)$b['shareOfPosts']);
    $unbalanced = $topShare >= 0.55 && count($posted) >= 3;

    $scoredAvg = $withData ? array_sum(array_map(fn($b) => $b['score'], $withData)) / count($withData) : 0.0;
    $labScore = (int)round($scoredAvg);
    if (count($withData) >= 3) $labScore = min(100, $labScore + 8);
    elseif (count($withData) === 1 && count($posted) >= 3) $labScore = max(0, $labScore - 10);
    if ($unbalanced) $labScore = max(0, $labScore - 8);
    $labScore = max(0, min(100, $labScore));
    if (count($withData) === 0) $grade = 'D';
    elseif ($labScore >= 75) $grade = 'A';
    elseif ($labScore >= 58) $grade = 'B';
    elseif ($labScore >= 40) $grade = 'C';
    else $grade = 'D';

    $best = null;
    foreach ($withData as $b) {
        if ($b['status'] === 'hot') { $best = $b; break; }
    }
    if (!$best && $withData) $best = $withData[0];
    $cold = array_values(array_filter($withData, fn($b) => $b['status'] === 'cold'));

    if (!$posted) {
        $mixTip = 'ยังไม่มีเมตริกช่วงคอมฯ — โพสต์มือแล้วกรอกผลที่ Results ก่อนจัดมิกซ์ค่าคอม';
    } elseif ($unbalanced && $best) {
        $mixTip = 'มิกซ์เอนไปช่วง ' . $best['bandLabel'] . ' มาก — วันถัดไปลองสลับช่วงคอมฯ อื่น 1 ชิ้น (ทดลอง)';
    } elseif ($best) {
        $mixTip = 'ช่วงคอมฯ เด่น: ' . $best['bandLabel'] . ' — ใช้เป็นสมมติฐาน ไม่ล็อคทุกโพสต์ไว้ช่วงเดียว';
    } else {
        $mixTip = 'เก็บผลต่ออีก 2–3 โพสต์ข้ามช่วงคอมฯ ก่อนจัดอันดับมิกซ์';
    }

    $stmt = db()->prepare("SELECT * FROM schedule WHERE post_date=? AND status IN ('draft','approved') ORDER BY suggested_time ASC LIMIT 6");
    $stmt->execute([$date]);
    $todaySlots = $stmt->fetchAll() ?: [];

    $preferred = null;
    foreach ($bands as $b) {
        if ($b['status'] === 'hot') { $preferred = $b; break; }
    }
    if (!$preferred) {
        foreach ($bands as $b) {
            if ($b['status'] === 'steady' && $b['samples'] > 0) { $preferred = $b; break; }
        }
    }

    $suggestions = [];
    foreach ($todaySlots as $slot) {
        $product = $productById[$slot['product_id']] ?? null;
        if (!$product || !$preferred) continue;
        $currentKey = commission_band_of((float)$product['commissionRate']);
        $currentRow = null;
        foreach ($bands as $b) {
            if ($b['band'] === $currentKey) { $currentRow = $b; break; }
        }
        $sameAsPreferred = $currentKey === $preferred['band'];
        $currentCold = $currentRow && (
            $currentRow['status'] === 'cold' ||
            ($currentRow['status'] === 'no_data' && $preferred['status'] === 'hot')
        );

        if ($currentCold && !$sameAsPreferred) {
            $suggestions[] = [
                'scheduleId' => $slot['id'],
                'productId' => $product['id'],
                'productName' => $product['name'],
                'currentBand' => $currentKey,
                'currentLabel' => commission_band_label_th($currentKey),
                'suggestedBand' => $preferred['band'],
                'suggestedLabel' => $preferred['bandLabel'],
                'commissionRate' => (float)$product['commissionRate'],
                'status' => $slot['status'],
                'channelLabel' => channel_label($slot['channel']),
                'reason' => commission_band_label_th($currentKey) . ' เย็น/ข้อมูลน้อยกว่า · ' . $preferred['bandLabel'] . ' ดูดีกว่าในหน้าต่างนี้ (ทดลอง)',
                'tip' => 'ไม่สลับสินค้าอัตโนมัติ — ถ้าจะเปลี่ยนช่วงคอมฯ ให้เลือกสินค้าใหม่ + สร้างแคปชัน + Approve ก่อนโพสต์มือ',
            ];
        } elseif ($unbalanced && $sameAsPreferred && $cold && count($suggestions) < 2) {
            $alt = null;
            foreach ($bands as $b) {
                if ($b['band'] !== $currentKey && in_array($b['status'], ['steady', 'no_data'], true)) {
                    $alt = $b;
                    break;
                }
            }
            if (!$alt) $alt = $cold[0];
            $suggestions[] = [
                'scheduleId' => $slot['id'],
                'productId' => $product['id'],
                'productName' => $product['name'],
                'currentBand' => $currentKey,
                'currentLabel' => commission_band_label_th($currentKey),
                'suggestedBand' => $alt['band'],
                'suggestedLabel' => $alt['bandLabel'],
                'commissionRate' => (float)$product['commissionRate'],
                'status' => $slot['status'],
                'channelLabel' => channel_label($slot['channel']),
                'reason' => 'วันนี้ซ้อนช่วง ' . commission_band_label_th($currentKey) . ' — ลองกระจายไป ' . $alt['bandLabel'] . ' เพื่อลดความซ้ำ (ทดลอง)',
                'tip' => 'ระบบไม่เปลี่ยนสินค้าเอง — แก้ที่คิว/สินค้าแล้ว Approve ใหม่',
            ];
        }
        if (count($suggestions) >= 5) break;
    }

    $actions = [];
    if (!$posted) {
        $actions[] = [
            'id' => 'need-metrics',
            'title' => 'เริ่มเก็บผลรายช่วงคอมฯ',
            'detail' => 'Approve → โพสต์มือ → กรอก views/clicks/orders ที่ Results อย่างน้อย 1 ชิ้นต่อช่วงคอมฯ',
        ];
    }
    if ($best && $best['status'] === 'hot') {
        $actions[] = [
            'id' => 'lean-best',
            'title' => 'เอียงทดลองไปช่วง ' . $best['bandLabel'],
            'detail' => 'n=' . $best['samples'] . ' · คะแนนฟิต ~' . $best['score'] . ' — ใช้ 1–2 สล็อต ไม่ถล่มทุกโพสต์',
        ];
    }
    if ($unbalanced) {
        $actions[] = [
            'id' => 'diversify',
            'title' => 'กระจายมิกซ์ช่วงคอมฯ',
            'detail' => 'ช่วงคอมฯ เด่นกินสัดส่วนสูง — เพิ่ม draft คนละช่วง 1 ชิ้นในรอบถัดไป (กันสแปมฟีล)',
        ];
    }
    if ($cold) {
        $coldLabels = implode(', ', array_map(fn($b) => $b['bandLabel'], $cold));
        $actions[] = [
            'id' => 'review-cold',
            'title' => 'ทบทวนช่วงเย็น: ' . $coldLabels,
            'detail' => 'เปลี่ยน hook/มุมขาย หรือพักช่วงคอมฯ นั้นชั่วคราว — อย่าโพสต์ซ้ำข้อความเดิม',
        ];
    }
    $actions[] = [
        'id' => 'compliance',
        'title' => 'คงกฎ Approve + disclosure',
        'detail' => 'ทุกช่วงคอมฯ ต้องมีข้อความ affiliate และผ่าน Approve ก่อนโพสต์มือ — ระบบไม่โพสต์อัตโนมัติ',
    ];
    $actions = array_slice($actions, 0, 5);

    if (!$posted) {
        $summary = 'Commission Band Lab: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลหลังโพสต์มือก่อนจัดอันดับช่วงคอมฯ';
    } else {
        $summary = 'Commission Band Lab: ' . count($posted) . ' โพสต์มีเมตริก · ช่วงที่มีข้อมูล ' . count($withData)
            . ' · ร้อน ' . $hot . ($unbalanced ? ' · มิกซ์เอนข้างเดียว' : '');
    }

    $checklist = [
        'อันดับช่วงคอมฯ มาจากเมตริกที่คุณกรอกเอง — ไม่ดึง API แพลตฟอร์ม',
        'คะแนนฟิตเป็นสมมติฐานทดลอง ไม่การันตียอดขาย/ค่าคอม',
        'คำแนะนำสลับช่วงคอมฯ เป็นคำแนะนำเท่านั้น — ต้องเลือกสินค้า + Approve เอง',
        'อย่าถล่มช่วงคอมฯ เดียวซ้ำ ๆ ในวันเดียวกัน (กันสแปม)',
        'ทุกโพสต์ต้องมี disclosure และไม่ใช้คำโฆษณาเกินจริง',
    ];

    $lines = [
        "Commission Band Lab {$date}: เกรด {$grade} ({$labScore}/100) · {$summary}",
        $mixTip,
    ];
    foreach (array_slice($withData, 0, 3) as $b) {
        $lines[] = $statusLabel[$b['status']] . ' · ' . $b['bandLabel'] . ': คะแนน ' . $b['score']
            . ' (' . $confLabel[$b['confidence']] . ', n=' . $b['samples']
            . ', CTR ~' . round($b['avgCtr'] * 100, 1) . '%)';
    }
    foreach (array_slice($suggestions, 0, 2) as $s) {
        $lines[] = 'แนะนำทดลอง · ' . $s['productName'] . ': ' . $s['currentLabel'] . ' → ' . $s['suggestedLabel'];
    }
    $lines[] = INCOME_DISCLAIMER;

    return [
        'date' => $date,
        'fromDate' => $from,
        'windowDays' => $window,
        'grade' => $grade,
        'score' => $labScore,
        'summary' => $summary,
        'counts' => [
            'postsWithMetrics' => count($posted),
            'bandsWithData' => count($withData),
            'unbalanced' => $unbalanced,
            'suggestions' => count($suggestions),
            'hot' => $hot,
        ],
        'bands' => $bands,
        'mixTip' => $mixTip,
        'suggestions' => array_slice($suggestions, 0, 5),
        'actions' => $actions,
        'checklist' => $checklist,
        'lines' => $lines,
        'disclaimer' => INCOME_DISCLAIMER,
    ];
}

function commission_band_fit_lab_to_markdown(array $lab): string
{
    $statusLabel = ['hot' => 'ร้อน', 'steady' => 'นิ่ง', 'cold' => 'เย็น', 'no_data' => 'ยังไม่มีข้อมูล'];
    $confLabel = ['thin' => 'ข้อมูลบาง', 'ok' => 'พอใช้', 'solid' => 'หนาขึ้น'];
    $bandRows = [];
    $idx = 0;
    foreach ($lab['bands'] as $b) {
        if (($b['samples'] ?? 0) <= 0 && ($b['productCount'] ?? 0) <= 0) continue;
        $idx++;
        $bandRows[] = "{$idx}. **[{$statusLabel[$b['status']]}]** {$b['bandLabel']} ({$b['rangeLabel']}) · คะแนน {$b['score']}/100 · n={$b['samples']} · {$confLabel[$b['confidence']]}\n"
            . "   สินค้าในแคตตาล็อก {$b['productCount']} · ราคาเฉลี่ย ฿{$b['avgPrice']} · คอมฯ ~{$b['avgCommissionRate']}%\n"
            . '   CTR ~' . round($b['avgCtr'] * 100, 1) . '% · ออเดอร์/คลิก ~' . $b['avgOrdersPerClick']
            . ' · ค่าคอมเฉลี่ย ฿' . $b['avgCommission'] . "\n"
            . '   สัดส่วนในหน้าต่าง ~' . round($b['shareOfPosts'] * 100) . "%\n"
            . "   {$b['tip']}";
    }
    if (!$bandRows) {
        $bandRows[] = '_(ยังไม่มีข้อมูล)_';
    }
    $suggestionRows = [];
    foreach ($lab['suggestions'] as $i => $s) {
        $n = $i + 1;
        $suggestionRows[] = "{$n}. {$s['productName']} · {$s['status']} · {$s['channelLabel']} · คอมฯ {$s['commissionRate']}%\n"
            . "   {$s['currentLabel']} → **{$s['suggestedLabel']}**\n"
            . "   {$s['reason']}\n"
            . "   {$s['tip']}";
    }
    if (!$suggestionRows) {
        $suggestionRows[] = '_(ไม่มีคำแนะนำสลับช่วงคอมฯ วันนี้)_';
    }
    $actionLines = [];
    foreach ($lab['actions'] as $a) {
        $actionLines[] = "- **{$a['title']}**: {$a['detail']}";
    }
    $checkLines = [];
    foreach ($lab['checklist'] as $c) {
        $checkLines[] = "- {$c}";
    }

    return "# Commission Band Lab · {$lab['date']}\n\n"
        . $lab['summary'] . "\n\n"
        . "- เกรดแล็บ: {$lab['grade']} ({$lab['score']}/100)\n"
        . "- หน้าต่าง: {$lab['fromDate']} → {$lab['date']} ({$lab['windowDays']} วัน)\n"
        . "- โพสต์มีเมตริก: {$lab['counts']['postsWithMetrics']}\n"
        . "- ช่วงคอมฯ ที่มีข้อมูล: {$lab['counts']['bandsWithData']}\n"
        . "- ช่วงร้อน: {$lab['counts']['hot']}\n"
        . '- มิกซ์เอนข้างเดียว: ' . ($lab['counts']['unbalanced'] ? 'ใช่' : 'ไม่') . "\n\n"
        . "## มิกซ์ทิป\n"
        . $lab['mixTip'] . "\n\n"
        . "## อันดับช่วงคอมฯ (ทดลอง)\n"
        . implode("\n", $bandRows) . "\n\n"
        . "## คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)\n"
        . implode("\n", $suggestionRows) . "\n\n"
        . "## Actions\n"
        . implode("\n", $actionLines) . "\n\n"
        . "## Checklist\n"
        . implode("\n", $checkLines) . "\n\n"
        . $lab['disclaimer'] . "\n";
}

/**
 * Pain Clarity Lab — soft ranking of pain-point clarity bands from logged metrics.
 * Aligns with pain_clarity_score() thresholds (22 per pain; clear/sharp = rich briefs).
 */
function pain_clarity_band_of(float $score): string
{
    if ($score < 22) return 'empty';
    if ($score < 44) return 'thin';
    if ($score < 66) return 'solid';
    if ($score < 85) return 'clear';
    return 'sharp';
}

function pain_clarity_band_label_th(string $band): string
{
    return match ($band) {
        'empty' => 'ว่าง/ไม่ชัด',
        'thin' => 'บาง (≈1 pain)',
        'solid' => 'พอใช้ (≈2 pain)',
        'clear' => 'ชัด',
        'sharp' => 'คมมาก',
        default => $band,
    };
}

function pain_clarity_band_range_label(string $band): string
{
    return match ($band) {
        'empty' => 'คะแนน <22',
        'thin' => '22–43',
        'solid' => '44–65',
        'clear' => '66–84',
        'sharp' => '≥85',
        default => '',
    };
}

function build_pain_clarity_fit_lab(?string $date = null, int $windowDays = 14): array
{
    $date = $date ?: today_iso();
    $window = max(7, min(30, $windowDays));
    $from = date('Y-m-d', strtotime($date . ' -' . ($window - 1) . ' days'));
    $order = ['empty', 'thin', 'solid', 'clear', 'sharp'];
    $statusLabel = ['hot' => 'ร้อน', 'steady' => 'นิ่ง', 'cold' => 'เย็น', 'no_data' => 'ยังไม่มีข้อมูล'];
    $confLabel = ['thin' => 'ข้อมูลบาง', 'ok' => 'พอใช้', 'solid' => 'หนาขึ้น'];

    $products = all_products();
    $byId = [];
    $productsByBand = [];
    foreach ($order as $b) $productsByBand[$b] = [];
    foreach ($products as $p) {
        $byId[$p['id']] = $p;
        $key = pain_clarity_band_of(pain_clarity_score($p));
        $productsByBand[$key][$p['id']] = true;
    }

    $stmt = db()->prepare("SELECT * FROM schedule WHERE status='posted' AND metrics_at IS NOT NULL AND post_date BETWEEN ? AND ?");
    $stmt->execute([$from, $date]);
    $posted = $stmt->fetchAll() ?: [];

    $byBand = [];
    foreach ($order as $b) $byBand[$b] = [];
    $allComm = [];
    foreach ($posted as $row) {
        $product = $byId[$row['product_id']] ?? null;
        $score = $product ? pain_clarity_score($product) : 0.0;
        $key = pain_clarity_band_of($score);
        $byBand[$key][] = $row;
        $productsByBand[$key][$row['product_id']] = true;
        $allComm[] = (float)$row['commission_earned'];
    }
    $globalAvg = $allComm ? array_sum($allComm) / count($allComm) : 0.0;
    $postedN = count($posted);

    $bands = [];
    foreach ($order as $band) {
        $list = $byBand[$band];
        $samples = count($list);
        $productIds = array_keys($productsByBand[$band]);
        $productsInBand = [];
        foreach ($productIds as $pid) {
            if (isset($byId[$pid])) $productsInBand[] = $byId[$pid];
        }
        $views = array_map(fn($r) => (int)$r['views'], $list);
        $clicks = array_map(fn($r) => (int)$r['clicks'], $list);
        $orders = array_map(fn($r) => (int)$r['orders_count'], $list);
        $comms = array_map(fn($r) => (float)$r['commission_earned'], $list);
        $avgViews = $samples ? array_sum($views) / $samples : 0;
        $avgClicks = $samples ? array_sum($clicks) / $samples : 0;
        $avgOrders = $samples ? array_sum($orders) / $samples : 0;
        $avgCommission = $samples ? array_sum($comms) / $samples : 0;
        $totalViews = array_sum($views);
        $totalClicks = array_sum($clicks);
        $totalOrders = array_sum($orders);
        $avgCtr = $totalViews > 0 ? $totalClicks / $totalViews : 0;
        $avgOpc = $totalClicks > 0 ? $totalOrders / $totalClicks : 0;
        $share = $postedN > 0 ? $samples / $postedN : 0;
        $avgPrice = $productsInBand ? array_sum(array_map(fn($p) => (float)$p['price'], $productsInBand)) / count($productsInBand) : 0;
        $avgPainScore = $productsInBand ? array_sum(array_map(fn($p) => pain_clarity_score($p), $productsInBand)) / count($productsInBand) : 0;
        $avgPainCount = $productsInBand ? array_sum(array_map(fn($p) => count(array_filter($p['painPoints'], fn($x) => trim((string)$x) !== '')), $productsInBand)) / count($productsInBand) : 0;

        $score = 0;
        if ($samples > 0) {
            $commBase = $globalAvg > 0
                ? max(0, min(70, ($avgCommission / $globalAvg) * 50))
                : max(0, min(50, $avgCommission * 2));
            $score = $commBase
                + max(0, min(20, $avgCtr * 200))
                + max(0, min(15, $avgOpc * 100))
                + max(0, min(15, $avgOrders * 8));
            if ($band === 'clear') $score += 5;
            elseif ($band === 'sharp') $score += 6;
            elseif ($band === 'solid') $score += 2;
            elseif ($band === 'thin') $score -= 1;
            elseif ($band === 'empty') $score -= 4;
            if ($share >= 0.7 && $samples >= 3) $score -= 12;
            elseif ($share >= 0.55 && $samples >= 2) $score -= 6;
            if ($samples === 1) $score *= 0.75;
            $score = (int)round(max(0, min(100, $score)));
        }
        $confidence = $samples >= 4 ? 'solid' : ($samples >= 2 ? 'ok' : 'thin');
        if ($samples === 0) $status = 'no_data';
        elseif ($score >= 65 && $samples >= 2) $status = 'hot';
        elseif ($score >= 45) $status = 'steady';
        else $status = 'cold';

        $tip = 'เก็บข้อมูลต่ออีก 1–2 โพสต์ในช่วง pain นี้ก่อนสรุป — ตัวเลขยังเป็นสมมติฐาน';
        if ($samples === 0) {
            $tip = 'ยังไม่มีผลในช่วงความชัดของ pain นี้ — ลอง draft 1 ชิ้นแล้วกรอกเมตริก (อย่าโพสต์ซ้ำข้อความเดิม)';
        } elseif ($status === 'hot') {
            $tip = 'ช่วง pain นี้ดูเวิร์กกว่าในหน้าต่างนี้ (ทดลอง) — ใช้ต่อได้ แต่สลับมุม/สินค้าเพื่อไม่ให้ซ้ำ';
        } elseif ($status === 'cold') {
            $tip = 'ผลเย็นในช่วง pain นี้ — เติมจุดเจ็บ/จุดขายให้ชัดขึ้น หรือเลี่ยงช่วงนี้ชั่วคราว';
        } elseif ($share >= 0.55) {
            $tip = 'ใช้ช่วง pain นี้บ่อย (' . round($share * 100) . '%) — กระจายระดับความชัดเพื่อลดความซ้ำ';
        }

        $bands[] = [
            'band' => $band,
            'bandLabel' => pain_clarity_band_label_th($band),
            'rangeLabel' => pain_clarity_band_range_label($band),
            'samples' => $samples,
            'productCount' => count($productIds),
            'avgViews' => round($avgViews, 1),
            'avgClicks' => round($avgClicks, 1),
            'avgOrders' => round($avgOrders, 2),
            'avgCommission' => round($avgCommission, 1),
            'avgCtr' => round($avgCtr, 2),
            'avgOrdersPerClick' => round($avgOpc, 2),
            'avgPrice' => round($avgPrice, 1),
            'avgPainScore' => round($avgPainScore, 1),
            'avgPainCount' => round($avgPainCount, 1),
            'score' => $score,
            'status' => $status,
            'confidence' => $confidence,
            'shareOfPosts' => round($share, 2),
            'tip' => $tip,
        ];
    }
    usort($bands, fn($a, $b) => ($b['score'] <=> $a['score']) ?: ($b['samples'] <=> $a['samples']));

    $withData = array_values(array_filter($bands, fn($b) => $b['samples'] > 0));
    $hot = count(array_filter($bands, fn($b) => $b['status'] === 'hot'));
    $topShare = 0.0;
    foreach ($bands as $b) $topShare = max($topShare, (float)$b['shareOfPosts']);
    $unbalanced = $topShare >= 0.55 && $postedN >= 3;

    $scoredAvg = $withData ? array_sum(array_map(fn($b) => $b['score'], $withData)) / count($withData) : 0;
    $labScore = (int)round($scoredAvg);
    if (count($withData) >= 3) $labScore = min(100, $labScore + 8);
    elseif (count($withData) === 1 && $postedN >= 3) $labScore = max(0, $labScore - 10);
    if ($unbalanced) $labScore = max(0, $labScore - 8);
    $labScore = max(0, min(100, $labScore));
    if (count($withData) === 0) $grade = 'D';
    elseif ($labScore >= 75) $grade = 'A';
    elseif ($labScore >= 58) $grade = 'B';
    elseif ($labScore >= 40) $grade = 'C';
    else $grade = 'D';

    $best = null;
    foreach ($withData as $b) {
        if ($b['status'] === 'hot') { $best = $b; break; }
    }
    if (!$best && $withData) $best = $withData[0];
    $cold = array_values(array_filter($withData, fn($b) => $b['status'] === 'cold'));

    if ($postedN === 0) {
        $mixTip = 'ยังไม่มีเมตริกช่วง pain — โพสต์มือแล้วกรอกผลที่ Results ก่อนจัดมิกซ์ความชัดของปัญหา';
    } elseif ($unbalanced && $best) {
        $mixTip = 'มิกซ์เอนไปช่วง ' . $best['bandLabel'] . ' มาก — วันถัดไปลองสลับระดับความชัดของ pain อื่น 1 ชิ้น (ทดลอง)';
    } elseif ($best) {
        $mixTip = 'ช่วง pain เด่น: ' . $best['bandLabel'] . ' — ใช้เป็นสมมติฐาน ไม่ล็อคทุกโพสต์ไว้ระดับเดียว';
    } else {
        $mixTip = 'เก็บผลต่ออีก 2–3 โพสต์ข้ามระดับ pain ก่อนจัดอันดับมิกซ์';
    }

    $stmt = db()->prepare("SELECT * FROM schedule WHERE post_date=? AND status IN ('draft','approved') ORDER BY suggested_time");
    $stmt->execute([$date]);
    $todaySlots = $stmt->fetchAll() ?: [];

    $preferred = null;
    foreach ($bands as $b) {
        if ($b['status'] === 'hot') { $preferred = $b; break; }
    }
    if (!$preferred) {
        foreach ($bands as $b) {
            if ($b['status'] === 'steady' && $b['samples'] > 0) { $preferred = $b; break; }
        }
    }

    $suggestions = [];
    foreach (array_slice($todaySlots, 0, 6) as $slot) {
        $product = $byId[$slot['product_id']] ?? null;
        if (!$product || !$preferred) continue;
        $painScore = pain_clarity_score($product);
        $currentKey = pain_clarity_band_of($painScore);
        $currentRow = null;
        foreach ($bands as $b) {
            if ($b['band'] === $currentKey) { $currentRow = $b; break; }
        }
        $same = $currentKey === $preferred['band'];
        $currentCold = $currentRow && (
            $currentRow['status'] === 'cold'
            || ($currentRow['status'] === 'no_data' && $preferred['status'] === 'hot')
            || $currentKey === 'empty'
            || $currentKey === 'thin'
        );
        if ($currentCold && !$same) {
            $suggestions[] = [
                'scheduleId' => $slot['id'],
                'productId' => $product['id'],
                'productName' => $product['name'],
                'currentBand' => $currentKey,
                'currentLabel' => pain_clarity_band_label_th($currentKey),
                'suggestedBand' => $preferred['band'],
                'suggestedLabel' => $preferred['bandLabel'],
                'painScore' => $painScore,
                'status' => $slot['status'],
                'channelLabel' => channel_label($slot['channel']),
                'reason' => pain_clarity_band_label_th($currentKey) . ' เย็น/บางกว่า · ' . $preferred['bandLabel'] . ' ดูดีกว่าในหน้าต่างนี้ (ทดลอง)',
                'tip' => 'ไม่สลับสินค้าอัตโนมัติ — เติม pain/จุดขายที่หน้าสินค้า หรือเลือกสินค้าที่ brief ชัดกว่า แล้ว Approve ก่อนโพสต์มือ',
            ];
        } elseif ($unbalanced && $same && $cold && count($suggestions) < 2) {
            $alt = null;
            foreach ($bands as $b) {
                if ($b['band'] !== $currentKey && in_array($b['status'], ['steady', 'no_data'], true) && $b['band'] !== 'empty') {
                    $alt = $b;
                    break;
                }
            }
            if (!$alt) $alt = $cold[0];
            $suggestions[] = [
                'scheduleId' => $slot['id'],
                'productId' => $product['id'],
                'productName' => $product['name'],
                'currentBand' => $currentKey,
                'currentLabel' => pain_clarity_band_label_th($currentKey),
                'suggestedBand' => $alt['band'],
                'suggestedLabel' => $alt['bandLabel'],
                'painScore' => $painScore,
                'status' => $slot['status'],
                'channelLabel' => channel_label($slot['channel']),
                'reason' => 'วันนี้ซ้อนช่วง ' . pain_clarity_band_label_th($currentKey) . ' — ลองกระจายไป ' . $alt['bandLabel'] . ' เพื่อลดความซ้ำ (ทดลอง)',
                'tip' => 'ระบบไม่เปลี่ยนสินค้าเอง — แก้ brief ที่สินค้า/คิวแล้ว Approve ใหม่',
            ];
        }
    }
    $suggestions = array_slice($suggestions, 0, 5);

    $actions = [];
    if ($postedN === 0) {
        $actions[] = [
            'id' => 'need-metrics',
            'title' => 'เริ่มเก็บผลรายระดับ pain',
            'detail' => 'Approve → โพสต์มือ → กรอก views/clicks/orders ที่ Results อย่างน้อย 1 ชิ้นต่อระดับความชัด',
        ];
    }
    if ($best && $best['status'] === 'hot') {
        $actions[] = [
            'id' => 'lean-best',
            'title' => 'เอียงทดลองไปช่วง ' . $best['bandLabel'],
            'detail' => 'n=' . $best['samples'] . ' · คะแนนฟิต ~' . $best['score'] . ' — ใช้ 1–2 สล็อต ไม่ถล่มทุกโพสต์',
        ];
    }
    if ($unbalanced) {
        $actions[] = [
            'id' => 'diversify',
            'title' => 'กระจายมิกซ์ระดับ pain',
            'detail' => 'ระดับ pain เด่นกินสัดส่วนสูง — เพิ่ม draft คนละระดับ 1 ชิ้นในรอบถัดไป (กันสแปมฟีล)',
        ];
    }
    if ($cold) {
        $actions[] = [
            'id' => 'review-cold',
            'title' => 'ทบทวนช่วงเย็น: ' . implode(', ', array_map(fn($b) => $b['bandLabel'], $cold)),
            'detail' => 'เติม pain point / จุดขาย / กลุ่มเป้าหมาย หรือพักมุมนั้นชั่วคราว — อย่าโพสต์ซ้ำข้อความเดิม',
        ];
    }
    $emptyCatalog = 0;
    foreach ($products as $p) {
        if (pain_clarity_band_of(pain_clarity_score($p)) === 'empty') $emptyCatalog++;
    }
    if ($emptyCatalog > 0) {
        $actions[] = [
            'id' => 'fill-briefs',
            'title' => "เติม brief สินค้าว่าง {$emptyCatalog} ชิ้น",
            'detail' => 'สินค้าที่ยังไม่มี pain point จะสร้าง hook อ่อน — ใส่ปัญหาจริง 1–3 ข้อก่อนสร้างแคปชัน',
        ];
    }
    $actions[] = [
        'id' => 'compliance',
        'title' => 'คงกฎ Approve + disclosure',
        'detail' => 'ทุกระดับ pain ต้องมีข้อความ affiliate และผ่าน Approve ก่อนโพสต์มือ — ระบบไม่โพสต์อัตโนมัติ',
    ];
    $actions = array_slice($actions, 0, 5);

    if ($postedN === 0) {
        $summary = 'Pain Clarity Lab: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลหลังโพสต์มือก่อนจัดอันดับความชัดของ pain';
    } else {
        $summary = 'Pain Clarity Lab: ' . $postedN . ' โพสต์มีเมตริก · ช่วงที่มีข้อมูล ' . count($withData)
            . ' · ร้อน ' . $hot . ($unbalanced ? ' · มิกซ์เอนข้างเดียว' : '');
    }

    $checklist = [
        'อันดับระดับ pain มาจากเมตริกที่คุณกรอกเอง — ไม่ดึง API แพลตฟอร์ม',
        'คะแนนฟิตเป็นสมมติฐานทดลอง ไม่การันตียอดขาย/ค่าคอม',
        'คำแนะนำเติม brief/สลับระดับเป็นคำแนะนำเท่านั้น — ต้องแก้เอง + Approve',
        'อย่าถล่มมุม pain เดียวซ้ำ ๆ ในวันเดียวกัน (กันสแปม)',
        'ทุกโพสต์ต้องมี disclosure และไม่ใช้คำโฆษณาเกินจริง',
    ];

    $lines = [
        "Pain Clarity Lab {$date}: เกรด {$grade} ({$labScore}/100) · {$summary}",
        $mixTip,
    ];
    foreach (array_slice($withData, 0, 3) as $b) {
        $lines[] = $statusLabel[$b['status']] . ' · ' . $b['bandLabel'] . ': คะแนน ' . $b['score']
            . ' (' . $confLabel[$b['confidence']] . ', n=' . $b['samples']
            . ', CTR ~' . round($b['avgCtr'] * 100, 1) . '%)';
    }
    foreach (array_slice($suggestions, 0, 2) as $s) {
        $lines[] = 'แนะนำทดลอง · ' . $s['productName'] . ': ' . $s['currentLabel'] . ' → ' . $s['suggestedLabel'];
    }
    $lines[] = INCOME_DISCLAIMER;

    return [
        'date' => $date,
        'fromDate' => $from,
        'windowDays' => $window,
        'grade' => $grade,
        'score' => $labScore,
        'summary' => $summary,
        'counts' => [
            'postsWithMetrics' => $postedN,
            'bandsWithData' => count($withData),
            'unbalanced' => $unbalanced,
            'suggestions' => count($suggestions),
            'hot' => $hot,
        ],
        'bands' => $bands,
        'mixTip' => $mixTip,
        'suggestions' => $suggestions,
        'actions' => $actions,
        'checklist' => $checklist,
        'lines' => $lines,
        'disclaimer' => INCOME_DISCLAIMER,
    ];
}

function pain_clarity_fit_lab_to_markdown(array $lab): string
{
    $statusLabel = ['hot' => 'ร้อน', 'steady' => 'นิ่ง', 'cold' => 'เย็น', 'no_data' => 'ยังไม่มีข้อมูล'];
    $confLabel = ['thin' => 'ข้อมูลบาง', 'ok' => 'พอใช้', 'solid' => 'หนาขึ้น'];
    $bandRows = [];
    $idx = 0;
    foreach ($lab['bands'] as $b) {
        if (($b['samples'] ?? 0) <= 0 && ($b['productCount'] ?? 0) <= 0) continue;
        $idx++;
        $bandRows[] = "{$idx}. **[{$statusLabel[$b['status']]}]** {$b['bandLabel']} ({$b['rangeLabel']}) · คะแนน {$b['score']}/100 · n={$b['samples']} · {$confLabel[$b['confidence']]}\n"
            . "   สินค้าในแคตตาล็อก {$b['productCount']} · pain avg ~{$b['avgPainScore']} · จำนวน pain ~{$b['avgPainCount']}\n"
            . '   CTR ~' . round($b['avgCtr'] * 100, 1) . '% · ออเดอร์/คลิก ~' . $b['avgOrdersPerClick']
            . ' · ค่าคอมเฉลี่ย ฿' . $b['avgCommission'] . "\n"
            . '   สัดส่วนในหน้าต่าง ~' . round($b['shareOfPosts'] * 100) . "%\n"
            . "   {$b['tip']}";
    }
    if (!$bandRows) {
        $bandRows[] = '_(ยังไม่มีข้อมูล)_';
    }
    $suggestionRows = [];
    foreach ($lab['suggestions'] as $i => $s) {
        $n = $i + 1;
        $suggestionRows[] = "{$n}. {$s['productName']} · {$s['status']} · {$s['channelLabel']} · pain score {$s['painScore']}\n"
            . "   {$s['currentLabel']} → **{$s['suggestedLabel']}**\n"
            . "   {$s['reason']}\n"
            . "   {$s['tip']}";
    }
    if (!$suggestionRows) {
        $suggestionRows[] = '_(ไม่มีคำแนะนำสลับระดับ pain วันนี้)_';
    }
    $actionLines = [];
    foreach ($lab['actions'] as $a) {
        $actionLines[] = "- **{$a['title']}**: {$a['detail']}";
    }
    $checkLines = [];
    foreach ($lab['checklist'] as $c) {
        $checkLines[] = "- {$c}";
    }

    return "# Pain Clarity Lab · {$lab['date']}\n\n"
        . $lab['summary'] . "\n\n"
        . "- เกรดแล็บ: {$lab['grade']} ({$lab['score']}/100)\n"
        . "- หน้าต่าง: {$lab['fromDate']} → {$lab['date']} ({$lab['windowDays']} วัน)\n"
        . "- โพสต์มีเมตริก: {$lab['counts']['postsWithMetrics']}\n"
        . "- ระดับ pain ที่มีข้อมูล: {$lab['counts']['bandsWithData']}\n"
        . "- ช่วงร้อน: {$lab['counts']['hot']}\n"
        . '- มิกซ์เอนข้างเดียว: ' . ($lab['counts']['unbalanced'] ? 'ใช่' : 'ไม่') . "\n\n"
        . "## มิกซ์ทิป\n"
        . $lab['mixTip'] . "\n\n"
        . "## อันดับระดับความชัดของ pain (ทดลอง)\n"
        . implode("\n", $bandRows) . "\n\n"
        . "## คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)\n"
        . implode("\n", $suggestionRows) . "\n\n"
        . "## Actions\n"
        . implode("\n", $actionLines) . "\n\n"
        . "## Checklist\n"
        . implode("\n", $checkLines) . "\n\n"
        . $lab['disclaimer'] . "\n";
}


/**
 * Video Ease Lab — soft ranking of short-video filming ease bands from logged metrics.
 * Aligns with product videoEase 1–5 (scoring.scale1to5).
 */
function video_ease_of(array $p): int
{
    if (!isset($p['videoEase']) || !is_numeric($p['videoEase'])) {
        return 3;
    }
    $raw = (float)$p['videoEase'];
    return (int)max(1, min(5, round($raw)));
}

function video_ease_band_of(int $ease): string
{
    $e = max(1, min(5, $ease));
    return match ($e) {
        1 => 'hard1',
        2 => 'tough2',
        3 => 'ok3',
        4 => 'easy4',
        default => 'snap5',
    };
}

function video_ease_band_label_th(string $band): string
{
    return match ($band) {
        'hard1' => 'ยากมาก (1)',
        'tough2' => 'ยาก (2)',
        'ok3' => 'ปานกลาง (3)',
        'easy4' => 'ง่าย (4)',
        'snap5' => 'ถ่ายเร็วมาก (5)',
        default => $band,
    };
}

function video_ease_band_range_label(string $band): string
{
    return match ($band) {
        'hard1' => 'videoEase = 1',
        'tough2' => 'videoEase = 2',
        'ok3' => 'videoEase = 3',
        'easy4' => 'videoEase = 4',
        'snap5' => 'videoEase = 5',
        default => '',
    };
}

function build_video_ease_fit_lab(?string $date = null, int $windowDays = 14): array
{
    $date = $date ?: today_iso();
    $window = max(7, min(30, $windowDays));
    $from = date('Y-m-d', strtotime($date . ' -' . ($window - 1) . ' days'));
    $order = ['hard1', 'tough2', 'ok3', 'easy4', 'snap5'];
    $statusLabel = ['hot' => 'ร้อน', 'steady' => 'นิ่ง', 'cold' => 'เย็น', 'no_data' => 'ยังไม่มีข้อมูล'];
    $confLabel = ['thin' => 'ข้อมูลบาง', 'ok' => 'พอใช้', 'solid' => 'หนาขึ้น'];

    $products = all_products();
    $byId = [];
    $productsByBand = [];
    foreach ($order as $b) $productsByBand[$b] = [];
    foreach ($products as $p) {
        $byId[$p['id']] = $p;
        $key = video_ease_band_of(video_ease_of($p));
        $productsByBand[$key][$p['id']] = true;
    }

    $stmt = db()->prepare("SELECT * FROM schedule WHERE status='posted' AND metrics_at IS NOT NULL AND post_date BETWEEN ? AND ?");
    $stmt->execute([$from, $date]);
    $posted = $stmt->fetchAll() ?: [];

    $byBand = [];
    foreach ($order as $b) $byBand[$b] = [];
    $allComm = [];
    foreach ($posted as $row) {
        $product = $byId[$row['product_id']] ?? null;
        $ease = $product ? video_ease_of($product) : 3;
        $key = video_ease_band_of($ease);
        $byBand[$key][] = $row;
        $productsByBand[$key][$row['product_id']] = true;
        $allComm[] = (float)$row['commission_earned'];
    }
    $globalAvg = $allComm ? array_sum($allComm) / count($allComm) : 0.0;
    $postedN = count($posted);

    $bands = [];
    foreach ($order as $band) {
        $list = $byBand[$band];
        $samples = count($list);
        $productIds = array_keys($productsByBand[$band]);
        $productsInBand = [];
        foreach ($productIds as $pid) {
            if (isset($byId[$pid])) $productsInBand[] = $byId[$pid];
        }
        $views = array_map(fn($r) => (int)$r['views'], $list);
        $clicks = array_map(fn($r) => (int)$r['clicks'], $list);
        $orders = array_map(fn($r) => (int)$r['orders_count'], $list);
        $comms = array_map(fn($r) => (float)$r['commission_earned'], $list);
        $avgViews = $samples ? array_sum($views) / $samples : 0;
        $avgClicks = $samples ? array_sum($clicks) / $samples : 0;
        $avgOrders = $samples ? array_sum($orders) / $samples : 0;
        $avgCommission = $samples ? array_sum($comms) / $samples : 0;
        $totalViews = array_sum($views);
        $totalClicks = array_sum($clicks);
        $totalOrders = array_sum($orders);
        $avgCtr = $totalViews > 0 ? $totalClicks / $totalViews : 0;
        $avgOpc = $totalClicks > 0 ? $totalOrders / $totalClicks : 0;
        $share = $postedN > 0 ? $samples / $postedN : 0;
        $avgPrice = $productsInBand ? array_sum(array_map(fn($p) => (float)$p['price'], $productsInBand)) / count($productsInBand) : 0;
        $avgVideoEase = $productsInBand ? array_sum(array_map(fn($p) => video_ease_of($p), $productsInBand)) / count($productsInBand) : 0;

        $score = 0;
        if ($samples > 0) {
            $commBase = $globalAvg > 0
                ? max(0, min(70, ($avgCommission / $globalAvg) * 50))
                : max(0, min(50, $avgCommission * 2));
            $score = $commBase
                + max(0, min(20, $avgCtr * 200))
                + max(0, min(15, $avgOpc * 100))
                + max(0, min(15, $avgOrders * 8));
            if ($band === 'snap5') $score += 6;
            elseif ($band === 'easy4') $score += 5;
            elseif ($band === 'ok3') $score += 2;
            elseif ($band === 'tough2') $score -= 1;
            elseif ($band === 'hard1') $score -= 4;
            if ($share >= 0.7 && $samples >= 3) $score -= 12;
            elseif ($share >= 0.55 && $samples >= 2) $score -= 6;
            if ($samples === 1) $score *= 0.75;
            $score = (int)round(max(0, min(100, $score)));
        }
        $confidence = $samples >= 4 ? 'solid' : ($samples >= 2 ? 'ok' : 'thin');
        if ($samples === 0) $status = 'no_data';
        elseif ($score >= 65 && $samples >= 2) $status = 'hot';
        elseif ($score >= 45) $status = 'steady';
        else $status = 'cold';

        $tip = 'เก็บข้อมูลต่ออีก 1–2 โพสต์ในช่วงความง่ายนี้ก่อนสรุป — ตัวเลขยังเป็นสมมติฐาน';
        if ($samples === 0) {
            $tip = 'ยังไม่มีผลในช่วงความง่ายนี้ — ลอง draft 1 ชิ้นแล้วกรอกเมตริก (อย่าโพสต์ซ้ำข้อความเดิม)';
        } elseif ($status === 'hot') {
            $tip = 'ช่วงถ่ายง่ายนี้ดูเวิร์กกว่าในหน้าต่างนี้ (ทดลอง) — ใช้ต่อได้ แต่สลับสินค้า/มุมเพื่อไม่ให้ซ้ำ';
        } elseif ($status === 'cold') {
            $tip = 'ผลเย็นในช่วงความง่ายนี้ — เลือกสินค้าถ่ายง่ายกว่า หรือลดเซ็ตอัพวิดีโอ';
        } elseif ($share >= 0.55) {
            $tip = 'ใช้ช่วงความง่ายนี้บ่อย (' . round($share * 100) . '%) — กระจายระดับความง่ายเพื่อลดความซ้ำ';
        }

        $bands[] = [
            'band' => $band,
            'bandLabel' => video_ease_band_label_th($band),
            'rangeLabel' => video_ease_band_range_label($band),
            'samples' => $samples,
            'productCount' => count($productIds),
            'avgViews' => round($avgViews, 1),
            'avgClicks' => round($avgClicks, 1),
            'avgOrders' => round($avgOrders, 2),
            'avgCommission' => round($avgCommission, 1),
            'avgCtr' => round($avgCtr, 2),
            'avgOrdersPerClick' => round($avgOpc, 2),
            'avgPrice' => round($avgPrice, 1),
            'avgVideoEase' => round($avgVideoEase, 1),
            'score' => $score,
            'status' => $status,
            'confidence' => $confidence,
            'shareOfPosts' => round($share, 2),
            'tip' => $tip,
        ];
    }
    usort($bands, fn($a, $b) => ($b['score'] <=> $a['score']) ?: ($b['samples'] <=> $a['samples']));

    $withData = array_values(array_filter($bands, fn($b) => $b['samples'] > 0));
    $hot = count(array_filter($bands, fn($b) => $b['status'] === 'hot'));
    $topShare = 0.0;
    foreach ($bands as $b) $topShare = max($topShare, (float)$b['shareOfPosts']);
    $unbalanced = $topShare >= 0.55 && $postedN >= 3;

    $scoredAvg = $withData ? array_sum(array_map(fn($b) => $b['score'], $withData)) / count($withData) : 0;
    $labScore = (int)round($scoredAvg);
    if (count($withData) >= 3) $labScore = min(100, $labScore + 8);
    elseif (count($withData) === 1 && $postedN >= 3) $labScore = max(0, $labScore - 10);
    if ($unbalanced) $labScore = max(0, $labScore - 8);
    $labScore = max(0, min(100, $labScore));
    if (count($withData) === 0) $grade = 'D';
    elseif ($labScore >= 75) $grade = 'A';
    elseif ($labScore >= 58) $grade = 'B';
    elseif ($labScore >= 40) $grade = 'C';
    else $grade = 'D';

    $best = null;
    foreach ($withData as $b) {
        if ($b['status'] === 'hot') { $best = $b; break; }
    }
    if (!$best && $withData) $best = $withData[0];
    $cold = array_values(array_filter($withData, fn($b) => $b['status'] === 'cold'));

    if ($postedN === 0) {
        $mixTip = 'ยังไม่มีเมตริกช่วงความง่ายของวิดีโอ — โพสต์มือแล้วกรอกผลที่ Results ก่อนจัดมิกซ์';
    } elseif ($unbalanced && $best) {
        $mixTip = 'มิกซ์เอนไปช่วง ' . $best['bandLabel'] . ' มาก — วันถัดไปลองสลับระดับความง่ายอื่น 1 ชิ้น (ทดลอง)';
    } elseif ($best) {
        $mixTip = 'ช่วงถ่ายวิดีโอเด่น: ' . $best['bandLabel'] . ' — ใช้เป็นสมมติฐาน ไม่ล็อคทุกโพสต์ไว้ระดับเดียว';
    } else {
        $mixTip = 'เก็บผลต่ออีก 2–3 โพสต์ข้ามระดับความง่ายก่อนจัดอันดับมิกซ์';
    }

    $stmt = db()->prepare("SELECT * FROM schedule WHERE post_date=? AND status IN ('draft','approved') ORDER BY suggested_time");
    $stmt->execute([$date]);
    $todaySlots = $stmt->fetchAll() ?: [];

    $preferred = null;
    foreach ($bands as $b) {
        if ($b['status'] === 'hot') { $preferred = $b; break; }
    }
    if (!$preferred) {
        foreach ($bands as $b) {
            if ($b['status'] === 'steady' && $b['samples'] > 0) { $preferred = $b; break; }
        }
    }

    $suggestions = [];
    foreach (array_slice($todaySlots, 0, 6) as $slot) {
        $product = $byId[$slot['product_id']] ?? null;
        if (!$product || !$preferred) continue;
        $ease = video_ease_of($product);
        $currentKey = video_ease_band_of($ease);
        $currentRow = null;
        foreach ($bands as $b) {
            if ($b['band'] === $currentKey) { $currentRow = $b; break; }
        }
        $same = $currentKey === $preferred['band'];
        $currentCold = $currentRow && (
            $currentRow['status'] === 'cold'
            || ($currentRow['status'] === 'no_data' && $preferred['status'] === 'hot')
            || $currentKey === 'hard1'
            || $currentKey === 'tough2'
        );
        if ($currentCold && !$same) {
            $suggestions[] = [
                'scheduleId' => $slot['id'],
                'productId' => $product['id'],
                'productName' => $product['name'],
                'currentBand' => $currentKey,
                'currentLabel' => video_ease_band_label_th($currentKey),
                'suggestedBand' => $preferred['band'],
                'suggestedLabel' => $preferred['bandLabel'],
                'videoEase' => $ease,
                'status' => $slot['status'],
                'channelLabel' => channel_label($slot['channel']),
                'reason' => video_ease_band_label_th($currentKey) . ' เย็น/ยากกว่า · ' . $preferred['bandLabel'] . ' ดูดีกว่าในหน้าต่างนี้ (ทดลอง)',
                'tip' => 'ไม่สลับสินค้าอัตโนมัติ — ปรับ videoEase ที่หน้าสินค้า หรือเลือกสินค้าถ่ายง่ายกว่า แล้ว Approve ก่อนโพสต์มือ',
            ];
        } elseif ($unbalanced && $same && $cold && count($suggestions) < 2) {
            $alt = null;
            foreach ($bands as $b) {
                if ($b['band'] !== $currentKey && in_array($b['status'], ['steady', 'no_data'], true) && $b['band'] !== 'hard1') {
                    $alt = $b;
                    break;
                }
            }
            if (!$alt) $alt = $cold[0];
            $suggestions[] = [
                'scheduleId' => $slot['id'],
                'productId' => $product['id'],
                'productName' => $product['name'],
                'currentBand' => $currentKey,
                'currentLabel' => video_ease_band_label_th($currentKey),
                'suggestedBand' => $alt['band'],
                'suggestedLabel' => $alt['bandLabel'],
                'videoEase' => $ease,
                'status' => $slot['status'],
                'channelLabel' => channel_label($slot['channel']),
                'reason' => 'วันนี้ซ้อนช่วง ' . video_ease_band_label_th($currentKey) . ' — ลองกระจายไป ' . $alt['bandLabel'] . ' เพื่อลดความซ้ำ (ทดลอง)',
                'tip' => 'ระบบไม่เปลี่ยนสินค้าเอง — แก้ videoEase/คิวแล้ว Approve ใหม่',
            ];
        }
    }
    $suggestions = array_slice($suggestions, 0, 5);

    $actions = [];
    if ($postedN === 0) {
        $actions[] = [
            'id' => 'need-metrics',
            'title' => 'เริ่มเก็บผลรายระดับความง่ายวิดีโอ',
            'detail' => 'Approve → โพสต์มือ → กรอก views/clicks/orders ที่ Results อย่างน้อย 1 ชิ้นต่อระดับ videoEase',
        ];
    }
    if ($best && $best['status'] === 'hot') {
        $actions[] = [
            'id' => 'lean-best',
            'title' => 'เอียงทดลองไปช่วง ' . $best['bandLabel'],
            'detail' => 'n=' . $best['samples'] . ' · คะแนนฟิต ~' . $best['score'] . ' — ใช้ 1–2 สล็อต ไม่ถล่มทุกโพสต์',
        ];
    }
    if ($unbalanced) {
        $actions[] = [
            'id' => 'diversify',
            'title' => 'กระจายมิกซ์ระดับความง่าย',
            'detail' => 'ระดับความง่ายเด่นกินสัดส่วนสูง — เพิ่ม draft คนละระดับ 1 ชิ้นในรอบถัดไป (กันสแปมฟีล)',
        ];
    }
    if ($cold) {
        $actions[] = [
            'id' => 'review-cold',
            'title' => 'ทบทวนช่วงเย็น: ' . implode(', ', array_map(fn($b) => $b['bandLabel'], $cold)),
            'detail' => 'ลดเซ็ตอัพวิดีโอ / เลือกสินค้าถ่ายง่ายกว่า หรือพักมุมนั้นชั่วคราว — อย่าโพสต์ซ้ำข้อความเดิม',
        ];
    }
    $hardCatalog = 0;
    foreach ($products as $p) {
        if (video_ease_band_of(video_ease_of($p)) === 'hard1') $hardCatalog++;
    }
    if ($hardCatalog > 0) {
        $actions[] = [
            'id' => 'ease-hard',
            'title' => "ทบทวนสินค้าถ่ายยาก {$hardCatalog} ชิ้น",
            'detail' => 'สินค้า videoEase=1 กินเวลาถ่าย — ลดเซ็ตอัพหรือเลื่อนไปวันที่มีเวลา แล้วอัปเดตคะแนนความง่าย',
        ];
    }
    $actions[] = [
        'id' => 'compliance',
        'title' => 'คงกฎ Approve + disclosure',
        'detail' => 'ทุกระดับความง่ายต้องมีข้อความ affiliate และผ่าน Approve ก่อนโพสต์มือ — ระบบไม่โพสต์อัตโนมัติ',
    ];
    $actions = array_slice($actions, 0, 5);

    if ($postedN === 0) {
        $summary = 'Video Ease Lab: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลหลังโพสต์มือก่อนจัดอันดับความง่ายของวิดีโอ';
    } else {
        $summary = 'Video Ease Lab: ' . $postedN . ' โพสต์มีเมตริก · ช่วงที่มีข้อมูล ' . count($withData)
            . ' · ร้อน ' . $hot . ($unbalanced ? ' · มิกซ์เอนข้างเดียว' : '');
    }

    $checklist = [
        'อันดับระดับความง่ายมาจากเมตริกที่คุณกรอกเอง — ไม่ดึง API แพลตฟอร์ม',
        'คะแนนฟิตเป็นสมมติฐานทดลอง ไม่การันตียอดขาย/ค่าคอม',
        'คำแนะนำสลับระดับเป็นคำแนะนำเท่านั้น — ต้องแก้เอง + Approve',
        'อย่าถล่มมุมถ่ายแบบเดียวซ้ำ ๆ ในวันเดียวกัน (กันสแปม)',
        'ทุกโพสต์ต้องมี disclosure และไม่ใช้คำโฆษณาเกินจริง',
    ];

    $lines = [
        "Video Ease Lab {$date}: เกรด {$grade} ({$labScore}/100) · {$summary}",
        $mixTip,
    ];
    foreach (array_slice($withData, 0, 3) as $b) {
        $lines[] = $statusLabel[$b['status']] . ' · ' . $b['bandLabel'] . ': คะแนน ' . $b['score']
            . ' (' . $confLabel[$b['confidence']] . ', n=' . $b['samples']
            . ', CTR ~' . round($b['avgCtr'] * 100, 1) . '%)';
    }
    foreach (array_slice($suggestions, 0, 2) as $s) {
        $lines[] = 'แนะนำทดลอง · ' . $s['productName'] . ': ' . $s['currentLabel'] . ' → ' . $s['suggestedLabel'];
    }
    $lines[] = INCOME_DISCLAIMER;

    return [
        'date' => $date,
        'fromDate' => $from,
        'windowDays' => $window,
        'grade' => $grade,
        'score' => $labScore,
        'summary' => $summary,
        'counts' => [
            'postsWithMetrics' => $postedN,
            'bandsWithData' => count($withData),
            'unbalanced' => $unbalanced,
            'suggestions' => count($suggestions),
            'hot' => $hot,
        ],
        'bands' => $bands,
        'mixTip' => $mixTip,
        'suggestions' => $suggestions,
        'actions' => $actions,
        'checklist' => $checklist,
        'lines' => $lines,
        'disclaimer' => INCOME_DISCLAIMER,
    ];
}

function video_ease_fit_lab_to_markdown(array $lab): string
{
    $statusLabel = ['hot' => 'ร้อน', 'steady' => 'นิ่ง', 'cold' => 'เย็น', 'no_data' => 'ยังไม่มีข้อมูล'];
    $confLabel = ['thin' => 'ข้อมูลบาง', 'ok' => 'พอใช้', 'solid' => 'หนาขึ้น'];
    $bandRows = [];
    $idx = 0;
    foreach ($lab['bands'] as $b) {
        if (($b['samples'] ?? 0) <= 0 && ($b['productCount'] ?? 0) <= 0) continue;
        $idx++;
        $bandRows[] = "{$idx}. **[{$statusLabel[$b['status']]}]** {$b['bandLabel']} ({$b['rangeLabel']}) · คะแนน {$b['score']}/100 · n={$b['samples']} · {$confLabel[$b['confidence']]}\n"
            . "   สินค้าในแคตตาล็อก {$b['productCount']} · videoEase avg ~{$b['avgVideoEase']}\n"
            . '   CTR ~' . round($b['avgCtr'] * 100, 1) . '% · ออเดอร์/คลิก ~' . $b['avgOrdersPerClick']
            . ' · ค่าคอมเฉลี่ย ฿' . $b['avgCommission'] . "\n"
            . '   สัดส่วนในหน้าต่าง ~' . round($b['shareOfPosts'] * 100) . "%\n"
            . "   {$b['tip']}";
    }
    if (!$bandRows) {
        $bandRows[] = '_(ยังไม่มีข้อมูล)_';
    }
    $suggestionRows = [];
    foreach ($lab['suggestions'] as $i => $s) {
        $n = $i + 1;
        $suggestionRows[] = "{$n}. {$s['productName']} · {$s['status']} · {$s['channelLabel']} · videoEase {$s['videoEase']}\n"
            . "   {$s['currentLabel']} → **{$s['suggestedLabel']}**\n"
            . "   {$s['reason']}\n"
            . "   {$s['tip']}";
    }
    if (!$suggestionRows) {
        $suggestionRows[] = '_(ไม่มีคำแนะนำสลับระดับความง่ายวันนี้)_';
    }
    $actionLines = [];
    foreach ($lab['actions'] as $a) {
        $actionLines[] = "- **{$a['title']}**: {$a['detail']}";
    }
    $checkLines = [];
    foreach ($lab['checklist'] as $c) {
        $checkLines[] = "- {$c}";
    }

    return "# Video Ease Lab · {$lab['date']}\n\n"
        . $lab['summary'] . "\n\n"
        . "- เกรดแล็บ: {$lab['grade']} ({$lab['score']}/100)\n"
        . "- หน้าต่าง: {$lab['fromDate']} → {$lab['date']} ({$lab['windowDays']} วัน)\n"
        . "- โพสต์มีเมตริก: {$lab['counts']['postsWithMetrics']}\n"
        . "- ระดับความง่ายที่มีข้อมูล: {$lab['counts']['bandsWithData']}\n"
        . "- ช่วงร้อน: {$lab['counts']['hot']}\n"
        . '- มิกซ์เอนข้างเดียว: ' . ($lab['counts']['unbalanced'] ? 'ใช่' : 'ไม่') . "\n\n"
        . "## มิกซ์ทิป\n"
        . $lab['mixTip'] . "\n\n"
        . "## อันดับระดับความง่ายของวิดีโอ (ทดลอง)\n"
        . implode("\n", $bandRows) . "\n\n"
        . "## คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)\n"
        . implode("\n", $suggestionRows) . "\n\n"
        . "## Actions\n"
        . implode("\n", $actionLines) . "\n\n"
        . "## Checklist\n"
        . implode("\n", $checkLines) . "\n\n"
        . $lab['disclaimer'] . "\n";
}


/**
 * Seasonal Fit Lab — soft ranking of short-video filming ease bands from logged metrics.
 * Aligns with product seasonalScore 1–5 + Thai calendar season hints.
 */
function seasonal_score_of(array $p): int
{
    if (!isset($p['seasonalScore']) || !is_numeric($p['seasonalScore'])) {
        return 3;
    }
    $raw = (float)$p['seasonalScore'];
    return (int)max(1, min(5, round($raw)));
}

function seasonal_band_of(int $ease): string
{
    $e = max(1, min(5, $ease));
    return match ($e) {
        1 => 'cold1',
        2 => 'soft2',
        3 => 'mid3',
        4 => 'trend4',
        default => 'peak5',
    };
}

function seasonal_band_label_th(string $band): string
{
    return match ($band) {
        'cold1' => 'ไม่ตามซีซัน (1)',
        'soft2' => 'ซีซันอ่อน (2)',
        'mid3' => 'ปานกลาง (3)',
        'trend4' => 'ตามเทรนด์ (4)',
        'peak5' => 'ซีซันแรง (5)',
        default => $band,
    };
}

function seasonal_band_range_label(string $band): string
{
    return match ($band) {
        'cold1' => 'seasonalScore = 1',
        'soft2' => 'seasonalScore = 2',
        'mid3' => 'seasonalScore = 3',
        'trend4' => 'seasonalScore = 4',
        'peak5' => 'seasonalScore = 5',
        default => '',
    };
}

/** Soft Thai calendar label for Seasonal Fit Lab (parity with Next.js seasonality). */
function current_season_hint(?string $ymd = null): array
{
    $ymd = $ymd ?: today_iso();
    $month = (int) date('n', strtotime($ymd));
    $labels = [
        1 => 'ปีใหม่ / หน้าหนาวปลาย',
        2 => 'วาเลนไทน์ / ฤดูร้อนเริ่ม',
        3 => 'ร้อนจัด / เตรียมสงกรานต์',
        4 => 'สงกรานต์',
        5 => 'เข้าพรรษา / ฝนต้นฤดู',
        6 => 'เปิดเทอม',
        7 => 'กลางปี / ฝน',
        8 => 'วันแม่ → เปิดเทอมปลายเดือน',
        9 => 'ปลายฝน / เรียนต่อ',
        10 => 'ก่อนหน้าหนาว / ออกกำลัง',
        11 => '11.11 / ปีใหม่ใกล้',
        12 => 'ปีใหม่ / ของขวัญ',
    ];
    return [
        'month' => $month,
        'label' => $labels[$month] ?? 'ปฏิทินไทย',
    ];
}

function build_seasonal_fit_lab(?string $date = null, int $windowDays = 14): array
{
    $date = $date ?: today_iso();
    $window = max(7, min(30, $windowDays));
    $from = date('Y-m-d', strtotime($date . ' -' . ($window - 1) . ' days'));
    $seasonLabel = current_season_hint($date)['label'];
    $order = ['cold1', 'soft2', 'mid3', 'trend4', 'peak5'];
    $statusLabel = ['hot' => 'ร้อน', 'steady' => 'นิ่ง', 'cold' => 'เย็น', 'no_data' => 'ยังไม่มีข้อมูล'];
    $confLabel = ['thin' => 'ข้อมูลบาง', 'ok' => 'พอใช้', 'solid' => 'หนาขึ้น'];

    $products = all_products();
    $byId = [];
    $productsByBand = [];
    foreach ($order as $b) $productsByBand[$b] = [];
    foreach ($products as $p) {
        $byId[$p['id']] = $p;
        $key = seasonal_band_of(seasonal_score_of($p));
        $productsByBand[$key][$p['id']] = true;
    }

    $stmt = db()->prepare("SELECT * FROM schedule WHERE status='posted' AND metrics_at IS NOT NULL AND post_date BETWEEN ? AND ?");
    $stmt->execute([$from, $date]);
    $posted = $stmt->fetchAll() ?: [];

    $byBand = [];
    foreach ($order as $b) $byBand[$b] = [];
    $allComm = [];
    foreach ($posted as $row) {
        $product = $byId[$row['product_id']] ?? null;
        $ease = $product ? seasonal_score_of($product) : 3;
        $key = seasonal_band_of($ease);
        $byBand[$key][] = $row;
        $productsByBand[$key][$row['product_id']] = true;
        $allComm[] = (float)$row['commission_earned'];
    }
    $globalAvg = $allComm ? array_sum($allComm) / count($allComm) : 0.0;
    $postedN = count($posted);

    $bands = [];
    foreach ($order as $band) {
        $list = $byBand[$band];
        $samples = count($list);
        $productIds = array_keys($productsByBand[$band]);
        $productsInBand = [];
        foreach ($productIds as $pid) {
            if (isset($byId[$pid])) $productsInBand[] = $byId[$pid];
        }
        $views = array_map(fn($r) => (int)$r['views'], $list);
        $clicks = array_map(fn($r) => (int)$r['clicks'], $list);
        $orders = array_map(fn($r) => (int)$r['orders_count'], $list);
        $comms = array_map(fn($r) => (float)$r['commission_earned'], $list);
        $avgViews = $samples ? array_sum($views) / $samples : 0;
        $avgClicks = $samples ? array_sum($clicks) / $samples : 0;
        $avgOrders = $samples ? array_sum($orders) / $samples : 0;
        $avgCommission = $samples ? array_sum($comms) / $samples : 0;
        $totalViews = array_sum($views);
        $totalClicks = array_sum($clicks);
        $totalOrders = array_sum($orders);
        $avgCtr = $totalViews > 0 ? $totalClicks / $totalViews : 0;
        $avgOpc = $totalClicks > 0 ? $totalOrders / $totalClicks : 0;
        $share = $postedN > 0 ? $samples / $postedN : 0;
        $avgPrice = $productsInBand ? array_sum(array_map(fn($p) => (float)$p['price'], $productsInBand)) / count($productsInBand) : 0;
        $avgSeasonalScore = $productsInBand ? array_sum(array_map(fn($p) => seasonal_score_of($p), $productsInBand)) / count($productsInBand) : 0;

        $score = 0;
        if ($samples > 0) {
            $commBase = $globalAvg > 0
                ? max(0, min(70, ($avgCommission / $globalAvg) * 50))
                : max(0, min(50, $avgCommission * 2));
            $score = $commBase
                + max(0, min(20, $avgCtr * 200))
                + max(0, min(15, $avgOpc * 100))
                + max(0, min(15, $avgOrders * 8));
            if ($band === 'peak5') $score += 6;
            elseif ($band === 'trend4') $score += 5;
            elseif ($band === 'mid3') $score += 2;
            elseif ($band === 'soft2') $score -= 1;
            elseif ($band === 'cold1') $score -= 4;
            if ($share >= 0.7 && $samples >= 3) $score -= 12;
            elseif ($share >= 0.55 && $samples >= 2) $score -= 6;
            if ($samples === 1) $score *= 0.75;
            $score = (int)round(max(0, min(100, $score)));
        }
        $confidence = $samples >= 4 ? 'solid' : ($samples >= 2 ? 'ok' : 'thin');
        if ($samples === 0) $status = 'no_data';
        elseif ($score >= 65 && $samples >= 2) $status = 'hot';
        elseif ($score >= 45) $status = 'steady';
        else $status = 'cold';

        $tip = 'เก็บข้อมูลต่ออีก 1–2 โพสต์ในช่วงซีซันนี้ก่อนสรุป — ตัวเลขยังเป็นสมมติฐาน';
        if ($samples === 0) {
            $tip = 'ยังไม่มีผลในช่วงซีซันนี้ — ลอง draft 1 ชิ้นแล้วกรอกเมตริก (อย่าโพสต์ซ้ำข้อความเดิม)';
        } elseif ($status === 'hot') {
            $tip = 'ช่วงตามซีซันนี้ดูเวิร์กกว่าในหน้าต่างนี้ (ทดลอง) — ใช้ต่อได้ แต่สลับสินค้า/มุมเพื่อไม่ให้ซ้ำ';
        } elseif ($status === 'cold') {
            $tip = 'ผลเย็นในช่วงซีซันนี้ — เลือกสินค้าตามซีซันกว่า หรืออัปเดต seasonalScore';
        } elseif ($share >= 0.55) {
            $tip = 'ใช้ช่วงซีซันนี้บ่อย (' . round($share * 100) . '%) — กระจายระดับซีซันเพื่อลดความซ้ำ';
        }

        $bands[] = [
            'band' => $band,
            'bandLabel' => seasonal_band_label_th($band),
            'rangeLabel' => seasonal_band_range_label($band),
            'samples' => $samples,
            'productCount' => count($productIds),
            'avgViews' => round($avgViews, 1),
            'avgClicks' => round($avgClicks, 1),
            'avgOrders' => round($avgOrders, 2),
            'avgCommission' => round($avgCommission, 1),
            'avgCtr' => round($avgCtr, 2),
            'avgOrdersPerClick' => round($avgOpc, 2),
            'avgPrice' => round($avgPrice, 1),
            'avgSeasonalScore' => round($avgSeasonalScore, 1),
            'score' => $score,
            'status' => $status,
            'confidence' => $confidence,
            'shareOfPosts' => round($share, 2),
            'tip' => $tip,
        ];
    }
    usort($bands, fn($a, $b) => ($b['score'] <=> $a['score']) ?: ($b['samples'] <=> $a['samples']));

    $withData = array_values(array_filter($bands, fn($b) => $b['samples'] > 0));
    $hot = count(array_filter($bands, fn($b) => $b['status'] === 'hot'));
    $topShare = 0.0;
    foreach ($bands as $b) $topShare = max($topShare, (float)$b['shareOfPosts']);
    $unbalanced = $topShare >= 0.55 && $postedN >= 3;

    $scoredAvg = $withData ? array_sum(array_map(fn($b) => $b['score'], $withData)) / count($withData) : 0;
    $labScore = (int)round($scoredAvg);
    if (count($withData) >= 3) $labScore = min(100, $labScore + 8);
    elseif (count($withData) === 1 && $postedN >= 3) $labScore = max(0, $labScore - 10);
    if ($unbalanced) $labScore = max(0, $labScore - 8);
    $labScore = max(0, min(100, $labScore));
    if (count($withData) === 0) $grade = 'D';
    elseif ($labScore >= 75) $grade = 'A';
    elseif ($labScore >= 58) $grade = 'B';
    elseif ($labScore >= 40) $grade = 'C';
    else $grade = 'D';

    $best = null;
    foreach ($withData as $b) {
        if ($b['status'] === 'hot') { $best = $b; break; }
    }
    if (!$best && $withData) $best = $withData[0];
    $cold = array_values(array_filter($withData, fn($b) => $b['status'] === 'cold'));

    if ($postedN === 0) {
        $mixTip = 'ยังไม่มีเมตริกช่วงศักยภาพซีซัน/เทรนด์ — โพสต์มือแล้วกรอกผลที่ Results ก่อนจัดมิกซ์';
    } elseif ($unbalanced && $best) {
        $mixTip = 'มิกซ์เอนไปช่วง ' . $best['bandLabel'] . ' มาก — วันถัดไปลองสลับระดับซีซันอื่น 1 ชิ้น (ทดลอง)';
    } elseif ($best) {
        $mixTip = 'ช่วงถ่ายวิดีโอเด่น: ' . $best['bandLabel'] . ' — ใช้เป็นสมมติฐาน ไม่ล็อคทุกโพสต์ไว้ระดับเดียว';
    } else {
        $mixTip = 'เก็บผลต่ออีก 2–3 โพสต์ข้ามระดับซีซันก่อนจัดอันดับมิกซ์';
    }

    $stmt = db()->prepare("SELECT * FROM schedule WHERE post_date=? AND status IN ('draft','approved') ORDER BY suggested_time");
    $stmt->execute([$date]);
    $todaySlots = $stmt->fetchAll() ?: [];

    $preferred = null;
    foreach ($bands as $b) {
        if ($b['status'] === 'hot') { $preferred = $b; break; }
    }
    if (!$preferred) {
        foreach ($bands as $b) {
            if ($b['status'] === 'steady' && $b['samples'] > 0) { $preferred = $b; break; }
        }
    }

    $suggestions = [];
    foreach (array_slice($todaySlots, 0, 6) as $slot) {
        $product = $byId[$slot['product_id']] ?? null;
        if (!$product || !$preferred) continue;
        $ease = seasonal_score_of($product);
        $currentKey = seasonal_band_of($ease);
        $currentRow = null;
        foreach ($bands as $b) {
            if ($b['band'] === $currentKey) { $currentRow = $b; break; }
        }
        $same = $currentKey === $preferred['band'];
        $currentCold = $currentRow && (
            $currentRow['status'] === 'cold'
            || ($currentRow['status'] === 'no_data' && $preferred['status'] === 'hot')
            || $currentKey === 'cold1'
            || $currentKey === 'soft2'
        );
        if ($currentCold && !$same) {
            $suggestions[] = [
                'scheduleId' => $slot['id'],
                'productId' => $product['id'],
                'productName' => $product['name'],
                'currentBand' => $currentKey,
                'currentLabel' => seasonal_band_label_th($currentKey),
                'suggestedBand' => $preferred['band'],
                'suggestedLabel' => $preferred['bandLabel'],
                'seasonalScore' => $ease,
                'status' => $slot['status'],
                'channelLabel' => channel_label($slot['channel']),
                'reason' => seasonal_band_label_th($currentKey) . ' เย็น/ไม่ตรงซีซันกว่า · ' . $preferred['bandLabel'] . ' ดูดีกว่าในหน้าต่างนี้ (ทดลอง)',
                'tip' => 'ไม่สลับสินค้าอัตโนมัติ — ปรับ seasonalScore ที่หน้าสินค้า หรือเลือกหมวดตรงปฏิทินไทยกว่า แล้ว Approve ก่อนโพสต์มือ',
            ];
        } elseif ($unbalanced && $same && $cold && count($suggestions) < 2) {
            $alt = null;
            foreach ($bands as $b) {
                if ($b['band'] !== $currentKey && in_array($b['status'], ['steady', 'no_data'], true) && $b['band'] !== 'cold1') {
                    $alt = $b;
                    break;
                }
            }
            if (!$alt) $alt = $cold[0];
            $suggestions[] = [
                'scheduleId' => $slot['id'],
                'productId' => $product['id'],
                'productName' => $product['name'],
                'currentBand' => $currentKey,
                'currentLabel' => seasonal_band_label_th($currentKey),
                'suggestedBand' => $alt['band'],
                'suggestedLabel' => $alt['bandLabel'],
                'seasonalScore' => $ease,
                'status' => $slot['status'],
                'channelLabel' => channel_label($slot['channel']),
                'reason' => 'วันนี้ซ้อนช่วง ' . seasonal_band_label_th($currentKey) . ' — ลองกระจายไป ' . $alt['bandLabel'] . ' เพื่อลดความซ้ำ (ทดลอง)',
                'tip' => 'ระบบไม่เปลี่ยนสินค้าเอง — แก้ seasonalScore/คิวแล้ว Approve ใหม่',
            ];
        }
    }
    $suggestions = array_slice($suggestions, 0, 5);

    $actions = [];
    if ($postedN === 0) {
        $actions[] = [
            'id' => 'need-metrics',
            'title' => 'เริ่มเก็บผลรายระดับซีซัน',
            'detail' => 'Approve → โพสต์มือ → กรอก views/clicks/orders ที่ Results อย่างน้อย 1 ชิ้นต่อระดับ seasonalScore',
        ];
    }
    if ($best && $best['status'] === 'hot') {
        $actions[] = [
            'id' => 'lean-best',
            'title' => 'เอียงทดลองไปช่วง ' . $best['bandLabel'],
            'detail' => 'n=' . $best['samples'] . ' · คะแนนฟิต ~' . $best['score'] . ' — ใช้ 1–2 สล็อต ไม่ถล่มทุกโพสต์',
        ];
    }
    if ($unbalanced) {
        $actions[] = [
            'id' => 'diversify',
            'title' => 'กระจายมิกซ์ระดับซีซัน',
            'detail' => 'ระดับซีซันเด่นกินสัดส่วนสูง — เพิ่ม draft คนละระดับ 1 ชิ้นในรอบถัดไป (กันสแปมฟีล)',
        ];
    }
    if ($cold) {
        $actions[] = [
            'id' => 'review-cold',
            'title' => 'ทบทวนช่วงเย็น: ' . implode(', ', array_map(fn($b) => $b['bandLabel'], $cold)),
            'detail' => 'อัปเดต seasonalScore / เลือกสินค้าตามซีซันกว่า หรือพักมุมนั้นชั่วคราว — อย่าโพสต์ซ้ำข้อความเดิม',
        ];
    }
    $hardCatalog = 0;
    foreach ($products as $p) {
        if (seasonal_band_of(seasonal_score_of($p)) === 'cold1') $hardCatalog++;
    }
    if ($hardCatalog > 0) {
        $actions[] = [
            'id' => 'ease-hard',
            'title' => "ทบทวนสินค้าไม่ตามซีซัน {$hardCatalog} ชิ้น",
            'detail' => 'สินค้า seasonalScore=1 ไม่ตรงซีซัน — อัปเดตคะแนนหรือเลือกหมวดที่ตรงปฏิทินไทยกว่า',
        ];
    }
    $actions[] = [
        'id' => 'compliance',
        'title' => 'คงกฎ Approve + disclosure',
        'detail' => 'ทุกระดับซีซันต้องมีข้อความ affiliate และผ่าน Approve ก่อนโพสต์มือ — ระบบไม่โพสต์อัตโนมัติ',
    ];
    $actions = array_slice($actions, 0, 5);

    if ($postedN === 0) {
        $summary = 'Seasonal Fit Lab: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลหลังโพสต์มือก่อนจัดอันดับศักยภาพซีซัน/เทรนด์';
    } else {
        $summary = 'Seasonal Fit Lab: ' . $postedN . ' โพสต์มีเมตริก · ช่วงที่มีข้อมูล ' . count($withData)
            . ' · ร้อน ' . $hot . ($unbalanced ? ' · มิกซ์เอนข้างเดียว' : '');
    }

    $checklist = [
        'อันดับระดับซีซันมาจากเมตริกที่คุณกรอกเอง — ไม่ดึง API แพลตฟอร์ม',
        'คะแนนฟิตเป็นสมมติฐานทดลอง ไม่การันตียอดขาย/ค่าคอม',
        'คำแนะนำสลับระดับเป็นคำแนะนำเท่านั้น — ต้องแก้เอง + Approve',
        'อย่าถล่มมุมถ่ายแบบเดียวซ้ำ ๆ ในวันเดียวกัน (กันสแปม)',
        'ทุกโพสต์ต้องมี disclosure และไม่ใช้คำโฆษณาเกินจริง',
    ];

    $lines = [
        "Seasonal Fit Lab {$date}: เกรด {$grade} ({$labScore}/100) · {$summary}",
        $mixTip,
    ];
    foreach (array_slice($withData, 0, 3) as $b) {
        $lines[] = $statusLabel[$b['status']] . ' · ' . $b['bandLabel'] . ': คะแนน ' . $b['score']
            . ' (' . $confLabel[$b['confidence']] . ', n=' . $b['samples']
            . ', CTR ~' . round($b['avgCtr'] * 100, 1) . '%)';
    }
    foreach (array_slice($suggestions, 0, 2) as $s) {
        $lines[] = 'แนะนำทดลอง · ' . $s['productName'] . ': ' . $s['currentLabel'] . ' → ' . $s['suggestedLabel'];
    }
    $lines[] = INCOME_DISCLAIMER;

    return [
        'date' => $date,
        'fromDate' => $from,
        'windowDays' => $window,
        'seasonLabel' => $seasonLabel,
        'grade' => $grade,
        'score' => $labScore,
        'summary' => $summary,
        'counts' => [
            'postsWithMetrics' => $postedN,
            'bandsWithData' => count($withData),
            'unbalanced' => $unbalanced,
            'suggestions' => count($suggestions),
            'hot' => $hot,
        ],
        'bands' => $bands,
        'mixTip' => $mixTip,
        'suggestions' => $suggestions,
        'actions' => $actions,
        'checklist' => $checklist,
        'lines' => $lines,
        'disclaimer' => INCOME_DISCLAIMER,
    ];
}

function seasonal_fit_lab_to_markdown(array $lab): string
{
    $statusLabel = ['hot' => 'ร้อน', 'steady' => 'นิ่ง', 'cold' => 'เย็น', 'no_data' => 'ยังไม่มีข้อมูล'];
    $confLabel = ['thin' => 'ข้อมูลบาง', 'ok' => 'พอใช้', 'solid' => 'หนาขึ้น'];
    $bandRows = [];
    $idx = 0;
    foreach ($lab['bands'] as $b) {
        if (($b['samples'] ?? 0) <= 0 && ($b['productCount'] ?? 0) <= 0) continue;
        $idx++;
        $bandRows[] = "{$idx}. **[{$statusLabel[$b['status']]}]** {$b['bandLabel']} ({$b['rangeLabel']}) · คะแนน {$b['score']}/100 · n={$b['samples']} · {$confLabel[$b['confidence']]}\n"
            . "   สินค้าในแคตตาล็อก {$b['productCount']} · seasonalScore avg ~{$b['avgSeasonalScore']}\n"
            . '   CTR ~' . round($b['avgCtr'] * 100, 1) . '% · ออเดอร์/คลิก ~' . $b['avgOrdersPerClick']
            . ' · ค่าคอมเฉลี่ย ฿' . $b['avgCommission'] . "\n"
            . '   สัดส่วนในหน้าต่าง ~' . round($b['shareOfPosts'] * 100) . "%\n"
            . "   {$b['tip']}";
    }
    if (!$bandRows) {
        $bandRows[] = '_(ยังไม่มีข้อมูล)_';
    }
    $suggestionRows = [];
    foreach ($lab['suggestions'] as $i => $s) {
        $n = $i + 1;
        $suggestionRows[] = "{$n}. {$s['productName']} · {$s['status']} · {$s['channelLabel']} · seasonalScore {$s['seasonalScore']}\n"
            . "   {$s['currentLabel']} → **{$s['suggestedLabel']}**\n"
            . "   {$s['reason']}\n"
            . "   {$s['tip']}";
    }
    if (!$suggestionRows) {
        $suggestionRows[] = '_(ไม่มีคำแนะนำสลับระดับซีซันวันนี้)_';
    }
    $actionLines = [];
    foreach ($lab['actions'] as $a) {
        $actionLines[] = "- **{$a['title']}**: {$a['detail']}";
    }
    $checkLines = [];
    foreach ($lab['checklist'] as $c) {
        $checkLines[] = "- {$c}";
    }

    return "# Seasonal Fit Lab · {$lab['date']}\n\n"
        . $lab['summary'] . "\n\n"
        . "- เกรดแล็บ: {$lab['grade']} ({$lab['score']}/100)\n"
        . "- ปฏิทินไทย: {$lab['seasonLabel']}\n"
        . "- หน้าต่าง: {$lab['fromDate']} → {$lab['date']} ({$lab['windowDays']} วัน)\n"
        . "- โพสต์มีเมตริก: {$lab['counts']['postsWithMetrics']}\n"
        . "- ระดับซีซันที่มีข้อมูล: {$lab['counts']['bandsWithData']}\n"
        . "- ช่วงร้อน: {$lab['counts']['hot']}\n"
        . '- มิกซ์เอนข้างเดียว: ' . ($lab['counts']['unbalanced'] ? 'ใช่' : 'ไม่') . "\n\n"
        . "## มิกซ์ทิป\n"
        . $lab['mixTip'] . "\n\n"
        . "## อันดับระดับซีซัน/เทรนด์ (ทดลอง)\n"
        . implode("\n", $bandRows) . "\n\n"
        . "## คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)\n"
        . implode("\n", $suggestionRows) . "\n\n"
        . "## Actions\n"
        . implode("\n", $actionLines) . "\n\n"
        . "## Checklist\n"
        . implode("\n", $checkLines) . "\n\n"
        . $lab['disclaimer'] . "\n";
}


/**
 * Audience Fit Lab — soft ranking of target-audience clarity bands from logged metrics.
 * Aligns with scoring audience bonus (targetAudience length > 8 → +14).
 */
function audience_normalize(string $raw): string
{
    $t = trim(preg_replace('/\s+/u', ' ', $raw) ?? '');
    return $t;
}

function audience_is_generic(string $text): bool
{
    $t = trim($text);
    if ($t === '') return true;
    if (preg_match('/^(ทุกคน|คนทั่วไป|ทั่วไป|ใครก็ได้|ทุกวัย|everyone|anyone|all|general|คนดู|follower|followers)$/iu', $t)) {
        return true;
    }
    if (mb_strlen($t) <= 8 && preg_match('/ทั่วไป|ทุกคน|ใครก็ได้/u', $t)) {
        return true;
    }
    return false;
}

function audience_specificity_signals(string $text): int
{
    $n = 0;
    if (preg_match('/แม่|พ่อ|คุณแม่|คุณพ่อ|นักเรียน|นักศึกษา|มนุษย์เงินเดือน|ออฟฟิศ|ฟรีแลนซ์|แม่บ้าน|วัยรุ่น|สาว|หนุ่ม|ผู้หญิง|ผู้ชาย|คู่รัก|คนทำงาน|เจ้าของร้าน|พ่อค้า|แม่ค้า|ครีเอเตอร์|ครู|พยาบาล|โปรแกรมเมอร์|คนรักแมว|คนรักหมา|คนออกกำลัง|คนชอบท่องเที่ยว|มือใหม่|มือโปร|มือใหม่หัด|แม่ลูกอ่อน|คนงบน้อย|คนงบจำกัด|office|student|freelancer|mom|dad|creator/iu', $text)) {
        $n++;
    }
    if (preg_match('/อยาก|ต้องการ|กำลังหา|เบื่อ|ปัญหา|ช่วย|ประหยัด|เร็ว|ง่าย|ไม่ทัน|แก้|เลือก|เปรียบเทียบ|รีวิว|แนะนำ|looking|need|want|busy|tired/iu', $text)) {
        $n++;
    }
    if (preg_match('/วัย|ปี|เด็ก|ผู้ใหญ่|สูงวัย|คนท้อง|คนแก่|gen\s*[zy]|genz|millennial/iu', $text)) {
        $n++;
    }
    if (preg_match('/ที่บ้าน|ตอนเช้า|ก่อนนอน|ออฟฟิศ|ทริป|หน้าร้อน|หน้าฝน|ปีใหม่|สงกรานต์/u', $text)) {
        $n++;
    }
    $parts = preg_split('/\s+/u', $text) ?: [];
    if (preg_match('/[,\/|·•]/u', $text) || count($parts) >= 6) {
        $n++;
    }
    return $n;
}

function audience_clarity_score(array $p): float
{
    $text = audience_normalize((string)($p['targetAudience'] ?? ''));
    if ($text === '') return 0.0;
    $len = mb_strlen($text);
    if ($len <= 4) $score = 8;
    elseif ($len <= 8) $score = 22;
    elseif ($len <= 16) $score = 42;
    elseif ($len <= 28) $score = 58;
    elseif ($len <= 45) $score = 72;
    else $score = 82;

    if (audience_is_generic($text)) {
        $score = min($score, 28);
    }
    $score += min(audience_specificity_signals($text) * 8, 24);
    if ($len > 8 && !audience_is_generic($text)) {
        $score += 4;
    }
    return min(100.0, (float)round($score));
}

function audience_band_of(float $score): string
{
    if (!is_finite($score) || $score < 15) return 'empty';
    if ($score < 35) return 'vague';
    if ($score < 55) return 'named';
    if ($score < 75) return 'specific';
    return 'sharp';
}

function audience_band_label_th(string $band): string
{
    return match ($band) {
        'empty' => 'ว่าง/ไม่ระบุ',
        'vague' => 'กว้าง/ทั่วไป',
        'named' => 'ระบุกลุ่ม',
        'specific' => 'เฉพาะเจาะจง',
        'sharp' => 'คมมาก',
        default => $band,
    };
}

function audience_band_range_label(string $band): string
{
    return match ($band) {
        'empty' => 'คะแนน <15',
        'vague' => '15–34',
        'named' => '35–54',
        'specific' => '55–74',
        'sharp' => '≥75',
        default => '',
    };
}

function build_audience_fit_lab(?string $date = null, int $windowDays = 14): array
{
    $date = $date ?: today_iso();
    $window = max(7, min(30, $windowDays));
    $from = date('Y-m-d', strtotime($date . ' -' . ($window - 1) . ' days'));
    $order = ['empty', 'vague', 'named', 'specific', 'sharp'];
    $statusLabel = ['hot' => 'ร้อน', 'steady' => 'นิ่ง', 'cold' => 'เย็น', 'no_data' => 'ยังไม่มีข้อมูล'];
    $confLabel = ['thin' => 'ข้อมูลบาง', 'ok' => 'พอใช้', 'solid' => 'หนาขึ้น'];

    $products = all_products();
    $byId = [];
    $productsByBand = [];
    foreach ($order as $b) $productsByBand[$b] = [];
    foreach ($products as $p) {
        $byId[$p['id']] = $p;
        $key = audience_band_of(audience_clarity_score($p));
        $productsByBand[$key][$p['id']] = true;
    }

    $stmt = db()->prepare("SELECT * FROM schedule WHERE status='posted' AND metrics_at IS NOT NULL AND post_date BETWEEN ? AND ?");
    $stmt->execute([$from, $date]);
    $posted = $stmt->fetchAll() ?: [];

    $byBand = [];
    foreach ($order as $b) $byBand[$b] = [];
    $allComm = [];
    foreach ($posted as $row) {
        $product = $byId[$row['product_id']] ?? null;
        $score = $product ? audience_clarity_score($product) : 0.0;
        $key = audience_band_of($score);
        $byBand[$key][] = $row;
        $productsByBand[$key][$row['product_id']] = true;
        $allComm[] = (float)$row['commission_earned'];
    }
    $globalAvg = $allComm ? array_sum($allComm) / count($allComm) : 0.0;
    $postedN = count($posted);

    $bands = [];
    foreach ($order as $band) {
        $list = $byBand[$band];
        $samples = count($list);
        $productIds = array_keys($productsByBand[$band]);
        $productsInBand = [];
        foreach ($productIds as $pid) {
            if (isset($byId[$pid])) $productsInBand[] = $byId[$pid];
        }
        $views = array_map(fn($r) => (int)$r['views'], $list);
        $clicks = array_map(fn($r) => (int)$r['clicks'], $list);
        $orders = array_map(fn($r) => (int)$r['orders_count'], $list);
        $comms = array_map(fn($r) => (float)$r['commission_earned'], $list);
        $avgViews = $samples ? array_sum($views) / $samples : 0;
        $avgClicks = $samples ? array_sum($clicks) / $samples : 0;
        $avgOrders = $samples ? array_sum($orders) / $samples : 0;
        $avgCommission = $samples ? array_sum($comms) / $samples : 0;
        $totalViews = array_sum($views);
        $totalClicks = array_sum($clicks);
        $totalOrders = array_sum($orders);
        $avgCtr = $totalViews > 0 ? $totalClicks / $totalViews : 0;
        $avgOpc = $totalClicks > 0 ? $totalOrders / $totalClicks : 0;
        $share = $postedN > 0 ? $samples / $postedN : 0;
        $avgPrice = $productsInBand ? array_sum(array_map(fn($p) => (float)$p['price'], $productsInBand)) / count($productsInBand) : 0;
        $avgAudienceScore = $productsInBand ? array_sum(array_map(fn($p) => audience_clarity_score($p), $productsInBand)) / count($productsInBand) : 0;
        $avgAudienceLen = $productsInBand ? array_sum(array_map(fn($p) => mb_strlen(audience_normalize((string)($p['targetAudience'] ?? ''))), $productsInBand)) / count($productsInBand) : 0;

        $score = 0;
        if ($samples > 0) {
            $commBase = $globalAvg > 0
                ? max(0, min(70, ($avgCommission / $globalAvg) * 50))
                : max(0, min(50, $avgCommission * 2));
            $score = $commBase
                + max(0, min(20, $avgCtr * 200))
                + max(0, min(15, $avgOpc * 100))
                + max(0, min(15, $avgOrders * 8));
            if ($band === 'sharp') $score += 6;
            elseif ($band === 'specific') $score += 5;
            elseif ($band === 'named') $score += 3;
            elseif ($band === 'vague') $score -= 2;
            elseif ($band === 'empty') $score -= 5;
            if ($share >= 0.7 && $samples >= 3) $score -= 12;
            elseif ($share >= 0.55 && $samples >= 2) $score -= 6;
            if ($samples === 1) $score *= 0.75;
            $score = (int)round(max(0, min(100, $score)));
        }
        $confidence = $samples >= 4 ? 'solid' : ($samples >= 2 ? 'ok' : 'thin');
        if ($samples === 0) $status = 'no_data';
        elseif ($score >= 65 && $samples >= 2) $status = 'hot';
        elseif ($score >= 45) $status = 'steady';
        else $status = 'cold';

        $tip = 'เก็บข้อมูลต่ออีก 1–2 โพสต์ในระดับนี้ก่อนสรุป — ตัวเลขยังเป็นสมมติฐาน';
        if ($samples === 0) {
            $tip = 'ยังไม่มีผลในระดับกลุ่มนี้ — ลอง draft 1 ชิ้นแล้วกรอกเมตริก (อย่าโพสต์ซ้ำข้อความเดิม)';
        } elseif ($status === 'hot') {
            $tip = 'กลุ่มเป้าหมายระดับนี้ดูเวิร์กกว่าในหน้าต่างนี้ (ทดลอง) — ใช้ต่อได้ แต่สลับสินค้า/มุมเพื่อไม่ให้ซ้ำ';
        } elseif ($status === 'cold') {
            $tip = 'ผลเย็นในระดับนี้ — เขียน targetAudience ให้ชัดขึ้น (ใคร + สถานการณ์) หรือเปลี่ยนมุมขาย';
        } elseif ($share >= 0.55) {
            $tip = 'ใช้ระดับกลุ่มนี้บ่อย (' . round($share * 100) . '%) — กระจายระดับความชัดของกลุ่มเพื่อลดความซ้ำ';
        }

        $bands[] = [
            'band' => $band,
            'bandLabel' => audience_band_label_th($band),
            'rangeLabel' => audience_band_range_label($band),
            'samples' => $samples,
            'productCount' => count($productIds),
            'avgViews' => round($avgViews, 1),
            'avgClicks' => round($avgClicks, 1),
            'avgOrders' => round($avgOrders, 2),
            'avgCommission' => round($avgCommission, 1),
            'avgCtr' => round($avgCtr, 2),
            'avgOrdersPerClick' => round($avgOpc, 2),
            'avgPrice' => round($avgPrice, 1),
            'avgAudienceScore' => round($avgAudienceScore, 1),
            'avgAudienceLen' => round($avgAudienceLen, 1),
            'score' => $score,
            'status' => $status,
            'confidence' => $confidence,
            'shareOfPosts' => round($share, 2),
            'tip' => $tip,
        ];
    }
    usort($bands, fn($a, $b) => ($b['score'] <=> $a['score']) ?: ($b['samples'] <=> $a['samples']));

    $withData = array_values(array_filter($bands, fn($b) => $b['samples'] > 0));
    $hot = count(array_filter($bands, fn($b) => $b['status'] === 'hot'));
    $topShare = 0.0;
    foreach ($bands as $b) $topShare = max($topShare, (float)$b['shareOfPosts']);
    $unbalanced = $topShare >= 0.55 && $postedN >= 3;

    $scoredAvg = $withData ? array_sum(array_map(fn($b) => $b['score'], $withData)) / count($withData) : 0;
    $labScore = (int)round($scoredAvg);
    if (count($withData) >= 3) $labScore = min(100, $labScore + 8);
    elseif (count($withData) === 1 && $postedN >= 3) $labScore = max(0, $labScore - 10);
    if ($unbalanced) $labScore = max(0, $labScore - 8);
    $labScore = max(0, min(100, $labScore));
    if (count($withData) === 0) $grade = 'D';
    elseif ($labScore >= 75) $grade = 'A';
    elseif ($labScore >= 58) $grade = 'B';
    elseif ($labScore >= 40) $grade = 'C';
    else $grade = 'D';

    $best = null;
    foreach ($withData as $b) {
        if ($b['status'] === 'hot') { $best = $b; break; }
    }
    if (!$best && $withData) $best = $withData[0];
    $cold = array_values(array_filter($withData, fn($b) => $b['status'] === 'cold'));

    if ($postedN === 0) {
        $mixTip = 'ยังไม่มีเมตริกรายระดับกลุ่มเป้าหมาย — โพสต์มือแล้วกรอกผลที่ Results ก่อนจัดมิกซ์';
    } elseif ($unbalanced && $best) {
        $mixTip = 'มิกซ์เอนไประดับ ' . $best['bandLabel'] . ' มาก — วันถัดไปลองสลับระดับความชัดของกลุ่ม 1 ชิ้น (ทดลอง)';
    } elseif ($best) {
        $mixTip = 'ระดับกลุ่มเป้าหมายเด่น: ' . $best['bandLabel'] . ' — ใช้เป็นสมมติฐาน ไม่ล็อคทุกโพสต์';
    } else {
        $mixTip = 'เก็บผลต่ออีก 2–3 โพสต์ข้ามระดับกลุ่มเป้าหมายก่อนจัดอันดับมิกซ์';
    }

    $stmt = db()->prepare("SELECT * FROM schedule WHERE post_date=? AND status IN ('draft','approved') ORDER BY suggested_time");
    $stmt->execute([$date]);
    $todaySlots = $stmt->fetchAll() ?: [];

    $preferred = null;
    foreach ($bands as $b) {
        if ($b['status'] === 'hot') { $preferred = $b; break; }
    }
    if (!$preferred) {
        foreach ($bands as $b) {
            if ($b['status'] === 'steady' && $b['samples'] > 0) { $preferred = $b; break; }
        }
    }

    $suggestions = [];
    foreach (array_slice($todaySlots, 0, 6) as $slot) {
        $product = $byId[$slot['product_id']] ?? null;
        if (!$product || !$preferred) continue;
        $audScore = audience_clarity_score($product);
        $currentKey = audience_band_of($audScore);
        $currentRow = null;
        foreach ($bands as $b) {
            if ($b['band'] === $currentKey) { $currentRow = $b; break; }
        }
        $same = $currentKey === $preferred['band'];
        $preview = audience_normalize((string)($product['targetAudience'] ?? ''));
        $preview = $preview === '' ? '(ว่าง)' : mb_substr($preview, 0, 48);
        $currentCold = $currentRow && (
            $currentRow['status'] === 'cold'
            || ($currentRow['status'] === 'no_data' && $preferred['status'] === 'hot')
            || $currentKey === 'empty'
            || $currentKey === 'vague'
        );
        if ($currentCold && !$same) {
            $suggestions[] = [
                'scheduleId' => $slot['id'],
                'productId' => $product['id'],
                'productName' => $product['name'],
                'currentBand' => $currentKey,
                'currentLabel' => audience_band_label_th($currentKey),
                'suggestedBand' => $preferred['band'],
                'suggestedLabel' => $preferred['bandLabel'],
                'audienceScore' => $audScore,
                'audiencePreview' => $preview,
                'status' => $slot['status'],
                'channelLabel' => channel_label($slot['channel']),
                'reason' => audience_band_label_th($currentKey) . ' เย็น/กว้างเกิน · ' . $preferred['bandLabel'] . ' ดูดีกว่าในหน้าต่างนี้ (ทดลอง)',
                'tip' => 'ไม่สลับสินค้าอัตโนมัติ — แก้ targetAudience ที่หน้าสินค้าให้ชัด (ใคร + สถานการณ์) แล้ว Approve ก่อนโพสต์มือ',
            ];
        } elseif ($unbalanced && $same && $cold && count($suggestions) < 2) {
            $alt = null;
            foreach ($bands as $b) {
                if ($b['band'] !== $currentKey && in_array($b['status'], ['steady', 'no_data'], true) && $b['band'] !== 'empty') {
                    $alt = $b;
                    break;
                }
            }
            if (!$alt) $alt = $cold[0];
            $suggestions[] = [
                'scheduleId' => $slot['id'],
                'productId' => $product['id'],
                'productName' => $product['name'],
                'currentBand' => $currentKey,
                'currentLabel' => audience_band_label_th($currentKey),
                'suggestedBand' => $alt['band'],
                'suggestedLabel' => $alt['bandLabel'],
                'audienceScore' => $audScore,
                'audiencePreview' => $preview,
                'status' => $slot['status'],
                'channelLabel' => channel_label($slot['channel']),
                'reason' => 'วันนี้ซ้อนระดับ ' . audience_band_label_th($currentKey) . ' — ลองกระจายไป ' . $alt['bandLabel'] . ' เพื่อลดความซ้ำ (ทดลอง)',
                'tip' => 'ระบบไม่เปลี่ยนกลุ่มเอง — แก้ targetAudience/คิวแล้ว Approve ใหม่',
            ];
        }
    }
    $suggestions = array_slice($suggestions, 0, 5);

    $actions = [];
    if ($postedN === 0) {
        $actions[] = [
            'id' => 'need-metrics',
            'title' => 'เริ่มเก็บผลรายระดับกลุ่มเป้าหมาย',
            'detail' => 'Approve → โพสต์มือ → กรอก views/clicks/orders ที่ Results อย่างน้อย 1 ชิ้นต่อระดับความชัดของกลุ่ม',
        ];
    }
    if ($best && $best['status'] === 'hot') {
        $actions[] = [
            'id' => 'lean-audience',
            'title' => 'เอียงทดลองไประดับ ' . $best['bandLabel'],
            'detail' => 'n=' . $best['samples'] . ' · คะแนนฟิต ~' . $best['score'] . ' — ใช้ 1–2 สล็อต ไม่ถล่มทุกโพสต์',
        ];
    }
    if ($unbalanced) {
        $actions[] = [
            'id' => 'diversify',
            'title' => 'กระจายมิกซ์ระดับกลุ่มเป้าหมาย',
            'detail' => 'ระดับกลุ่มเด่นกินสัดส่วนสูง — เพิ่ม draft คนละระดับ 1 ชิ้นในรอบถัดไป (กันสแปมฟีล)',
        ];
    }
    if ($cold) {
        $actions[] = [
            'id' => 'review-cold',
            'title' => 'ทบทวนระดับเย็น: ' . implode(', ', array_map(fn($b) => $b['bandLabel'], $cold)),
            'detail' => 'เขียนกลุ่มให้ชัดขึ้น หรือพักมุมนั้นชั่วคราว — อย่าโพสต์ซ้ำข้อความเดิม',
        ];
    }
    $emptyCatalog = 0;
    $vagueCatalog = 0;
    foreach ($products as $p) {
        $b = audience_band_of(audience_clarity_score($p));
        if ($b === 'empty') $emptyCatalog++;
        if ($b === 'vague') $vagueCatalog++;
    }
    if ($emptyCatalog > 0) {
        $actions[] = [
            'id' => 'fill-empty',
            'title' => 'เติมกลุ่มเป้าหมายว่าง ' . $emptyCatalog . ' ชิ้น',
            'detail' => 'สินค้าไม่มี targetAudience — กรอกใคร + สถานการณ์ (>8 ตัวอักษร) เพื่อเปิด scoring +14 และช่วยเขียนแคปชัน',
        ];
    }
    if ($vagueCatalog > 0) {
        $actions[] = [
            'id' => 'sharpen-vague',
            'title' => 'ทำให้กลุ่มกว้างชัดขึ้น ' . $vagueCatalog . ' ชิ้น',
            'detail' => 'หลีกเลี่ยงคำว่า "ทุกคน/ทั่วไป" — ระบุบทบาทหรือสถานการณ์ เช่น "สาวออฟฟิศที่มือแห้งตอนเช้า"',
        ];
    }
    $actions[] = [
        'id' => 'compliance',
        'title' => 'คงกฎ Approve + disclosure',
        'detail' => 'ทุกระดับกลุ่มต้องมีข้อความ affiliate และผ่าน Approve ก่อนโพสต์มือ — ระบบไม่โพสต์อัตโนมัติ',
    ];
    $actions = array_slice($actions, 0, 5);

    if ($postedN === 0) {
        $summary = 'Audience Fit Lab: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลหลังโพสต์มือก่อนจัดอันดับความชัดของกลุ่มเป้าหมาย';
    } else {
        $summary = 'Audience Fit Lab: ' . $postedN . ' โพสต์มีเมตริก · ระดับที่มีข้อมูล ' . count($withData)
            . ' · ร้อน ' . $hot . ($unbalanced ? ' · มิกซ์เอนข้างเดียว' : '');
    }

    $checklist = [
        'อันดับระดับกลุ่มมาจากเมตริกที่คุณกรอกเอง — ไม่ดึง API แพลตฟอร์ม',
        'คะแนนฟิตเป็นสมมติฐานทดลอง ไม่การันตียอดขาย/ค่าคอม',
        'คำแนะนำสลับระดับเป็นคำแนะนำเท่านั้น — ต้องแก้เอง + Approve',
        'อย่าถล่มกลุ่มเป้าหมายแบบเดียวซ้ำ ๆ ในวันเดียวกัน (กันสแปม)',
        'ทุกโพสต์ต้องมี disclosure และไม่ใช้คำโฆษณาเกินจริง',
    ];

    $lines = [
        "Audience Fit Lab {$date}: เกรด {$grade} ({$labScore}/100) · {$summary}",
        $mixTip,
    ];
    foreach (array_slice($withData, 0, 3) as $b) {
        $lines[] = $statusLabel[$b['status']] . ' · ' . $b['bandLabel'] . ': คะแนน ' . $b['score']
            . ' (' . $confLabel[$b['confidence']] . ', n=' . $b['samples'] . ', CTR ~' . round($b['avgCtr'] * 100, 1) . '%)';
    }
    foreach (array_slice($suggestions, 0, 2) as $s) {
        $lines[] = 'แนะนำทดลอง · ' . $s['productName'] . ': ' . $s['currentLabel'] . ' → ' . $s['suggestedLabel'];
    }
    $lines[] = INCOME_DISCLAIMER;

    return [
        'date' => $date,
        'fromDate' => $from,
        'windowDays' => $window,
        'grade' => $grade,
        'score' => $labScore,
        'summary' => $summary,
        'counts' => [
            'postsWithMetrics' => $postedN,
            'bandsWithData' => count($withData),
            'unbalanced' => $unbalanced,
            'suggestions' => count($suggestions),
            'hot' => $hot,
        ],
        'bands' => $bands,
        'mixTip' => $mixTip,
        'suggestions' => $suggestions,
        'actions' => $actions,
        'checklist' => $checklist,
        'lines' => $lines,
        'disclaimer' => INCOME_DISCLAIMER,
    ];
}

function audience_fit_lab_to_markdown(array $lab): string
{
    $bandRows = [];
    foreach ($lab['bands'] as $i => $b) {
        if (($b['samples'] ?? 0) <= 0 && ($b['productCount'] ?? 0) <= 0) continue;
        $statusLabel = ['hot' => 'ร้อน', 'steady' => 'นิ่ง', 'cold' => 'เย็น', 'no_data' => 'ยังไม่มีข้อมูล'][$b['status']] ?? $b['status'];
        $confLabel = ['thin' => 'ข้อมูลบาง', 'ok' => 'พอใช้', 'solid' => 'หนาขึ้น'][$b['confidence']] ?? $b['confidence'];
        $n = $i + 1;
        $bandRows[] = "{$n}. **[{$statusLabel}]** {$b['bandLabel']} ({$b['rangeLabel']}) · คะแนน {$b['score']}/100 · n={$b['samples']} · {$confLabel}\n"
            . "   สินค้าในแคตตาล็อก {$b['productCount']} · audienceScore avg ~{$b['avgAudienceScore']} · ความยาว avg ~{$b['avgAudienceLen']}\n"
            . '   CTR ~' . round($b['avgCtr'] * 100, 1) . "% · ออเดอร์/คลิก ~{$b['avgOrdersPerClick']} · ค่าคอมเฉลี่ย ฿{$b['avgCommission']}\n"
            . '   สัดส่วนในหน้าต่าง ~' . round($b['shareOfPosts'] * 100) . "%\n"
            . "   {$b['tip']}";
    }
    if (!$bandRows) $bandRows[] = '_(ยังไม่มีข้อมูล)_';

    $suggestionRows = [];
    foreach ($lab['suggestions'] as $i => $s) {
        $n = $i + 1;
        $suggestionRows[] = "{$n}. {$s['productName']} · {$s['status']} · {$s['channelLabel']} · audienceScore {$s['audienceScore']}\n"
            . "   กลุ่ม: {$s['audiencePreview']}\n"
            . "   {$s['currentLabel']} → **{$s['suggestedLabel']}**\n"
            . "   {$s['reason']}\n"
            . "   {$s['tip']}";
    }
    if (!$suggestionRows) {
        $suggestionRows[] = '_(ไม่มีคำแนะนำสลับระดับกลุ่มวันนี้)_';
    }
    $actionLines = [];
    foreach ($lab['actions'] as $a) {
        $actionLines[] = "- **{$a['title']}**: {$a['detail']}";
    }
    $checkLines = [];
    foreach ($lab['checklist'] as $c) {
        $checkLines[] = "- {$c}";
    }

    return "# Audience Fit Lab · {$lab['date']}\n\n"
        . $lab['summary'] . "\n\n"
        . "- เกรดแล็บ: {$lab['grade']} ({$lab['score']}/100)\n"
        . "- หน้าต่าง: {$lab['fromDate']} → {$lab['date']} ({$lab['windowDays']} วัน)\n"
        . "- โพสต์มีเมตริก: {$lab['counts']['postsWithMetrics']}\n"
        . "- ระดับกลุ่มที่มีข้อมูล: {$lab['counts']['bandsWithData']}\n"
        . "- ช่วงร้อน: {$lab['counts']['hot']}\n"
        . '- มิกซ์เอนข้างเดียว: ' . ($lab['counts']['unbalanced'] ? 'ใช่' : 'ไม่') . "\n\n"
        . "## มิกซ์ทิป\n"
        . $lab['mixTip'] . "\n\n"
        . "## อันดับระดับกลุ่มเป้าหมาย (ทดลอง)\n"
        . implode("\n", $bandRows) . "\n\n"
        . "## คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)\n"
        . implode("\n", $suggestionRows) . "\n\n"
        . "## Actions\n"
        . implode("\n", $actionLines) . "\n\n"
        . "## Checklist\n"
        . implode("\n", $checkLines) . "\n\n"
        . $lab['disclaimer'] . "\n";
}


function hook_style_order(): array
{
    return ['pain', 'browse', 'value', 'social', 'soft'];
}

function hook_style_label_th(string $band): string
{
    return match ($band) {
        'pain' => 'เปิดด้วยปัญหา/เคยเจอไหม',
        'browse' => 'เปิดดูสเปก/แพลตฟอร์ม',
        'value' => 'จุดขาย+ราคา',
        'social' => 'กลุ่มเป้าหมายพูดถึง',
        'soft' => 'ลองก่อน/สั้นตรง ๆ',
        default => $band,
    };
}

function hook_style_range_label(string $band): string
{
    return match ($band) {
        'pain' => 'เคยเจอ / ปัญหา / อยากลดเรื่อง',
        'browse' => 'Shopee · TikTok Shop · กำลังหาของ',
        'value' => 'จุดที่ชอบ · ราคาประมาณ',
        'social' => 'คน…พูดถึง · กลุ่มเป้าหมาย',
        'soft' => 'ไม่ต้องซื้อแพง · สั้น ๆ ตรง ๆ',
        default => '',
    };
}

function hook_style_hint(string $band): string
{
    return match ($band) {
        'pain' => 'เปิดด้วย pain สั้น ๆ ภายใน 3 วิ แล้วค่อยโชว์ของ',
        'browse' => 'ชวนเปิดดูสเปก/รีวิวบนแพลตฟอร์มก่อนตัดสินใจ',
        'value' => 'บอกจุดขาย 1 ข้อ + ราคาประมาณ แบบไม่เร่งซื้อ',
        'social' => 'พูดถึงกลุ่มเป้าหมายชัด ๆ โดยไม่เคลมยอดขาย',
        'soft' => 'น้ำเสียงเพื่อนแนะนำ — ลองดูตัวเลือก ไม่ขายแข็ง',
        default => '',
    };
}

function classify_hook_style(string $raw): string
{
    $text = trim(preg_replace('/\s+/u', ' ', $raw) ?? '');
    if ($text === '') return 'soft';
    if (preg_match('/เคยเจอ|ปัญหาคือ|ปัญหา[จจ]|อยากลดเรื่อง|เล่าจากมุมคนใช้จริง|เจอไหม/u', $text)) return 'pain';
    if (preg_match('/shopee|tiktok\s*shop|เปิดดูสเปก|กำลังหาของช่วย|โชว์ของจริงในคลิป|ดูรายละเอียดใน/iu', $text)) return 'browse';
    if (preg_match('/ราคาประมาณ|จุดที่ชอบคือ|จุดขาย/u', $text)) return 'value';
    if (preg_match('/พูดถึงบ่อย|คนที่กำลัง|สำหรับคน|กลุ่มเป้าหมาย|เหมาะกับ/u', $text)) return 'social';
    if (preg_match('/ไม่ต้องซื้อแพง|ลองดูตัวเลือก|สั้น\s*ๆ\s*ตรง\s*ๆ|ไม่เร่งซื้อ|แชร์ตัวเลือก/u', $text)) return 'soft';
    return 'soft';
}

function hook_style_from_index(int $index): string
{
    $map = ['pain', 'browse', 'browse', 'value', 'social', 'soft', 'pain', 'value'];
    if ($index < 0) return 'soft';
    return $map[$index % count($map)] ?? 'soft';
}

function resolve_hook_text(?array $pack, int $hookIndex, string $captionPreview = ''): string
{
    $fromPack = trim((string)($pack['hooks'][$hookIndex] ?? ''));
    if ($fromPack !== '') return $fromPack;
    $preview = trim($captionPreview);
    if ($preview !== '') {
        foreach (preg_split('/\n/', $preview) as $line) {
            $line = trim($line);
            if ($line !== '') return mb_substr($line, 0, 160);
        }
    }
    return '';
}

function hook_style_of(array $post, ?array $pack = null): string
{
    $text = resolve_hook_text($pack, (int)($post['hook_index'] ?? 0), (string)($post['caption_preview'] ?? ''));
    if ($text !== '') return classify_hook_style($text);
    return hook_style_from_index((int)($post['hook_index'] ?? 0));
}

function build_hook_fit_lab(?string $date = null, int $windowDays = 14): array
{
    $date = $date ?: today_iso();
    $window = max(7, min(30, $windowDays));
    $from = date('Y-m-d', strtotime($date . ' -' . ($window - 1) . ' days'));
    $order = hook_style_order();
    $statusLabel = ['hot' => 'ร้อน', 'steady' => 'นิ่ง', 'cold' => 'เย็น', 'no_data' => 'ยังไม่มีข้อมูล'];
    $confLabel = ['thin' => 'ข้อมูลบาง', 'ok' => 'พอใช้', 'solid' => 'หนาขึ้น'];

    $products = all_products();
    $byId = [];
    foreach ($products as $p) $byId[$p['id']] = $p;

    $stmt = db()->prepare("SELECT * FROM schedule WHERE status='posted' AND metrics_at IS NOT NULL AND post_date BETWEEN ? AND ?");
    $stmt->execute([$from, $date]);
    $posted = $stmt->fetchAll() ?: [];

    $byBand = [];
    foreach ($order as $b) $byBand[$b] = [];
    $allComm = [];
    $packCache = [];
    foreach ($posted as $row) {
        $packId = (string)($row['content_pack_id'] ?? '');
        if ($packId !== '' && !isset($packCache[$packId])) {
            $pstmt = db()->prepare('SELECT * FROM content_packs WHERE id=?');
            $pstmt->execute([$packId]);
            $prow = $pstmt->fetch();
            $packCache[$packId] = $prow ? [
                'hooks' => decode_list($prow['hooks']),
                'ctas' => decode_list($prow['ctas'] ?? '[]'),
            ] : null;
        }
        $pack = $packCache[$packId] ?? null;
        if (!$pack) {
            $pack = latest_pack((string)$row['product_id']) ?: ['hooks' => [], 'ctas' => []];
        }
        $key = hook_style_of([
            'hook_index' => (int)($row['hook_index'] ?? 0),
            'caption_preview' => (string)($row['caption_preview'] ?? ''),
            'content_pack_id' => $packId,
        ], $pack);
        $byBand[$key][] = $row;
        $allComm[] = (float)$row['commission_earned'];
    }
    $globalAvg = $allComm ? array_sum($allComm) / count($allComm) : 0.0;
    $postedN = count($posted);

    $bands = [];
    foreach ($order as $band) {
        $list = $byBand[$band];
        $samples = count($list);
        $views = array_map(fn($r) => (int)$r['views'], $list);
        $clicks = array_map(fn($r) => (int)$r['clicks'], $list);
        $orders = array_map(fn($r) => (int)$r['orders_count'], $list);
        $comms = array_map(fn($r) => (float)$r['commission_earned'], $list);
        $avgViews = $samples ? array_sum($views) / $samples : 0;
        $avgClicks = $samples ? array_sum($clicks) / $samples : 0;
        $avgOrders = $samples ? array_sum($orders) / $samples : 0;
        $avgCommission = $samples ? array_sum($comms) / $samples : 0;
        $totalViews = array_sum($views);
        $totalClicks = array_sum($clicks);
        $totalOrders = array_sum($orders);
        $avgCtr = $totalViews > 0 ? $totalClicks / $totalViews : 0;
        $avgOpc = $totalClicks > 0 ? $totalOrders / $totalClicks : 0;
        $share = $postedN > 0 ? $samples / $postedN : 0;
        $avgHookIndex = $samples ? array_sum(array_map(fn($r) => (int)($r['hook_index'] ?? 0), $list)) / $samples : 0;

        $score = 0.0;
        if ($samples > 0) {
            $commBase = $globalAvg > 0
                ? max(0, min(70, ($avgCommission / $globalAvg) * 50))
                : max(0, min(50, $avgCommission * 2));
            $score = $commBase
                + max(0, min(22, $avgCtr * 220))
                + max(0, min(15, $avgOpc * 100))
                + max(0, min(15, $avgOrders * 8));
            $score += match ($band) {
                'pain' => 4,
                'soft' => 3,
                'browse' => 2,
                'value' => 1,
                default => 0,
            };
            if ($share >= 0.7 && $samples >= 3) $score -= 12;
            elseif ($share >= 0.55 && $samples >= 2) $score -= 6;
            if ($samples === 1) $score *= 0.75;
            $score = max(0, min(100, round($score)));
        }
        $confidence = $samples >= 4 ? 'solid' : ($samples >= 2 ? 'ok' : 'thin');
        $status = $samples === 0 ? 'no_data' : ($score >= 65 && $samples >= 2 ? 'hot' : ($score >= 45 ? 'steady' : 'cold'));
        $tip = 'เก็บข้อมูลต่ออีก 1–2 โพสต์ในสไตล์นี้ก่อนสรุป — ตัวเลขยังเป็นสมมติฐาน';
        if ($samples === 0) {
            $tip = 'ยังไม่มีผลสไตล์นี้ — ลอง draft 1 ชิ้นแนว “' . hook_style_hint($band) . '” แล้วกรอกเมตริก';
        } elseif ($status === 'hot') {
            $tip = 'สไตล์นี้ดูเวิร์กกว่าในหน้าต่างนี้ (ทดลอง) — ใช้ต่อได้ แต่สลับสินค้า/มุมเพื่อไม่ให้ซ้ำ';
        } elseif ($status === 'cold') {
            $tip = 'ผลเย็นในสไตล์นี้ — ลองสลับ hookIndex หรือสร้างแคปชันใหม่ก่อนโพสต์ซ้ำ';
        } elseif ($share >= 0.55) {
            $tip = 'ใช้สไตล์นี้บ่อย (' . round($share * 100) . '%) — กระจายสไตล์เปิดคลิปเพื่อลดความซ้ำ';
        }
        $bands[] = [
            'band' => $band,
            'bandLabel' => hook_style_label_th($band),
            'rangeLabel' => hook_style_range_label($band),
            'samples' => $samples,
            'avgViews' => round($avgViews, 1),
            'avgClicks' => round($avgClicks, 1),
            'avgOrders' => round($avgOrders, 2),
            'avgCommission' => round($avgCommission, 1),
            'avgCtr' => round($avgCtr, 2),
            'avgOrdersPerClick' => round($avgOpc, 2),
            'avgHookIndex' => round($avgHookIndex, 1),
            'score' => (int)$score,
            'status' => $status,
            'confidence' => $confidence,
            'shareOfPosts' => round($share, 2),
            'tip' => $tip,
        ];
    }
    usort($bands, fn($a, $b) => ($b['score'] <=> $a['score']) ?: ($b['samples'] <=> $a['samples']));

    $withData = array_values(array_filter($bands, fn($b) => $b['samples'] > 0));
    $hot = count(array_filter($bands, fn($b) => $b['status'] === 'hot'));
    $topShare = 0.0;
    foreach ($bands as $b) $topShare = max($topShare, (float)$b['shareOfPosts']);
    $unbalanced = $topShare >= 0.55 && $postedN >= 3;
    $scoredAvg = $withData ? array_sum(array_column($withData, 'score')) / count($withData) : 0;
    $labScore = (int)round($scoredAvg);
    if (count($withData) >= 3) $labScore = min(100, $labScore + 8);
    elseif (count($withData) === 1 && $postedN >= 3) $labScore = max(0, $labScore - 10);
    if ($unbalanced) $labScore = max(0, $labScore - 8);
    $labScore = max(0, min(100, $labScore));
    $grade = count($withData) === 0 ? 'D' : ($labScore >= 75 ? 'A' : ($labScore >= 58 ? 'B' : ($labScore >= 40 ? 'C' : 'D')));

    $best = null;
    foreach ($withData as $b) {
        if ($b['status'] === 'hot') { $best = $b; break; }
    }
    if (!$best && $withData) $best = $withData[0];
    $cold = array_values(array_filter($withData, fn($b) => $b['status'] === 'cold'));

    if ($postedN === 0) {
        $mixTip = 'ยังไม่มีเมตริกรายสไตล์ hook — โพสต์มือแล้วกรอกผลที่ Results ก่อนจัดมิกซ์';
        $summary = 'Hook Fit Lab: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลหลังโพสต์มือก่อนจัดอันดับสไตล์เปิดคลิป';
    } else {
        $summary = "Hook Fit Lab: {$postedN} โพสต์มีเมตริก · สไตล์ที่มีข้อมูล " . count($withData) . " · ร้อน {$hot}" . ($unbalanced ? ' · มิกซ์เอนข้างเดียว' : '');
        if ($unbalanced && $best) {
            $mixTip = 'มิกซ์เอนไปสไตล์ ' . $best['bandLabel'] . ' มาก — วันถัดไปลองสลับสไตล์เปิดคลิป 1 ชิ้น (ทดลอง)';
        } elseif ($best) {
            $mixTip = 'สไตล์ hook เด่น: ' . $best['bandLabel'] . ' — ใช้เป็นสมมติฐาน ไม่ล็อคทุกโพสต์';
        } else {
            $mixTip = 'เก็บผลต่ออีก 2–3 โพสต์ข้ามสไตล์ hook ก่อนจัดอันดับมิกซ์';
        }
    }

    $preferred = null;
    foreach ($bands as $b) {
        if ($b['status'] === 'hot') { $preferred = $b; break; }
    }
    if (!$preferred) {
        foreach ($bands as $b) {
            if ($b['status'] === 'steady' && $b['samples'] > 0) { $preferred = $b; break; }
        }
    }

    $stmt = db()->prepare("SELECT s.*, p.name AS product_name FROM schedule s LEFT JOIN products p ON p.id=s.product_id WHERE s.post_date=? AND s.status IN ('draft','approved') ORDER BY s.suggested_time ASC LIMIT 6");
    $stmt->execute([$date]);
    $todaySlots = $stmt->fetchAll() ?: [];
    $suggestions = [];
    foreach ($todaySlots as $slot) {
        if (!$preferred) break;
        $packId = (string)($slot['content_pack_id'] ?? '');
        if ($packId !== '' && !isset($packCache[$packId])) {
            $pstmt = db()->prepare('SELECT * FROM content_packs WHERE id=?');
            $pstmt->execute([$packId]);
            $prow = $pstmt->fetch();
            $packCache[$packId] = $prow ? [
                'hooks' => decode_list($prow['hooks']),
                'ctas' => decode_list($prow['ctas'] ?? '[]'),
            ] : null;
        }
        $pack = $packCache[$packId] ?? (latest_pack((string)$slot['product_id']) ?: ['hooks' => []]);
        $currentKey = hook_style_of([
            'hook_index' => (int)($slot['hook_index'] ?? 0),
            'caption_preview' => (string)($slot['caption_preview'] ?? ''),
        ], $pack);
        $currentRow = null;
        foreach ($bands as $b) {
            if ($b['band'] === $currentKey) { $currentRow = $b; break; }
        }
        $same = $currentKey === $preferred['band'];
        $preview = resolve_hook_text($pack, (int)($slot['hook_index'] ?? 0), (string)($slot['caption_preview'] ?? ''));
        $preview = $preview !== '' ? mb_substr(trim(preg_replace('/\s+/u', ' ', $preview) ?? ''), 0, 48) : ('(hook #' . ((int)$slot['hook_index'] + 1) . ')');
        $currentCold = $currentRow && (
            $currentRow['status'] === 'cold'
            || ($currentRow['status'] === 'no_data' && $preferred['status'] === 'hot')
        );
        if ($currentCold && !$same) {
            $suggestions[] = [
                'scheduleId' => $slot['id'],
                'productId' => $slot['product_id'],
                'productName' => $slot['product_name'] ?? $slot['product_id'],
                'currentBand' => $currentKey,
                'currentLabel' => hook_style_label_th($currentKey),
                'suggestedBand' => $preferred['band'],
                'suggestedLabel' => $preferred['bandLabel'],
                'hookIndex' => (int)$slot['hook_index'],
                'hookPreview' => $preview,
                'status' => $slot['status'],
                'channelLabel' => channel_label($slot['channel']),
                'reason' => hook_style_label_th($currentKey) . ' เย็น · ' . $preferred['bandLabel'] . ' ดูดีกว่าในหน้าต่างนี้ (ทดลอง)',
                'tip' => 'ไม่สลับ hook อัตโนมัติ — กดสร้างแคปชันใหม่หรือเลือก hookIndex อื่น แล้ว Approve ก่อนโพสต์มือ',
            ];
        } elseif ($unbalanced && $same && $cold && count($suggestions) < 2) {
            $alt = null;
            foreach ($bands as $b) {
                if ($b['band'] !== $currentKey && in_array($b['status'], ['steady', 'no_data'], true)) {
                    $alt = $b;
                    break;
                }
            }
            $alt = $alt ?: $cold[0];
            $suggestions[] = [
                'scheduleId' => $slot['id'],
                'productId' => $slot['product_id'],
                'productName' => $slot['product_name'] ?? $slot['product_id'],
                'currentBand' => $currentKey,
                'currentLabel' => hook_style_label_th($currentKey),
                'suggestedBand' => $alt['band'],
                'suggestedLabel' => $alt['bandLabel'],
                'hookIndex' => (int)$slot['hook_index'],
                'hookPreview' => $preview,
                'status' => $slot['status'],
                'channelLabel' => channel_label($slot['channel']),
                'reason' => 'วันนี้ซ้อนสไตล์ ' . hook_style_label_th($currentKey) . ' — ลองกระจายไป ' . $alt['bandLabel'] . ' เพื่อลดความซ้ำ (ทดลอง)',
                'tip' => 'ระบบไม่เปลี่ยน hook เอง — regenerate draft แล้ว Approve ใหม่',
            ];
        }
    }
    $suggestions = array_slice($suggestions, 0, 5);

    $actions = [];
    if ($postedN === 0) {
        $actions[] = [
            'id' => 'need-metrics',
            'title' => 'เริ่มเก็บผลรายสไตล์ hook',
            'detail' => 'Approve → โพสต์มือ → กรอก views/clicks/orders ที่ Results อย่างน้อย 1 ชิ้นต่อสไตล์เปิดคลิป',
        ];
    }
    if ($best && $best['status'] === 'hot') {
        $actions[] = [
            'id' => 'lean-hook',
            'title' => 'เอียงทดลองไปสไตล์ ' . $best['bandLabel'],
            'detail' => 'n=' . $best['samples'] . ' · คะแนนฟิต ~' . $best['score'] . ' — ใช้ 1–2 สล็อต · ' . hook_style_hint($best['band']),
        ];
    }
    if ($unbalanced) {
        $actions[] = [
            'id' => 'diversify',
            'title' => 'กระจายมิกซ์สไตล์ hook',
            'detail' => 'สไตล์เด่นกินสัดส่วนสูง — เพิ่ม draft คนละสไตล์เปิดคลิป 1 ชิ้นในรอบถัดไป (กันสแปมฟีล)',
        ];
    }
    if ($cold) {
        $actions[] = [
            'id' => 'review-cold',
            'title' => 'ทบทวนสไตล์เย็น: ' . implode(', ', array_map(fn($b) => $b['bandLabel'], $cold)),
            'detail' => 'สลับ hookIndex / regenerate หรือพักมุมนั้นชั่วคราว — อย่าโพสต์ซ้ำข้อความเดิม',
        ];
    }
    $missing = [];
    foreach ($order as $b) {
        if (count($byBand[$b]) === 0) $missing[] = $b;
    }
    if ($missing && $postedN > 0) {
        $actions[] = [
            'id' => 'fill-styles',
            'title' => 'ทดลองสไตล์ที่ยังไม่มีข้อมูล (' . count($missing) . ')',
            'detail' => 'ยังไม่มี: ' . implode(' · ', array_map('hook_style_label_th', $missing)) . ' — draft 1 ชิ้นต่อสไตล์แล้ววัดผล',
        ];
    }
    $actions[] = [
        'id' => 'compliance',
        'title' => 'คงกฎ Approve + disclosure',
        'detail' => 'ทุกสไตล์ hook ต้องมีข้อความ affiliate และผ่าน Approve ก่อนโพสต์มือ — ระบบไม่โพสต์อัตโนมัติ',
    ];
    $actions = array_slice($actions, 0, 5);

    $checklist = [
        'อันดับสไตล์ hook มาจากเมตริกที่คุณกรอกเอง — ไม่ดึง API แพลตฟอร์ม',
        'คะแนนฟิตเป็นสมมติฐานทดลอง ไม่การันตียอดขาย/ค่าคอม',
        'คำแนะนำสลับสไตล์เป็นคำแนะนำเท่านั้น — ต้องแก้เอง + Approve',
        'อย่าถล่ม hook แบบเดียวซ้ำ ๆ ในวันเดียวกัน (กันสแปม)',
        'ทุกโพสต์ต้องมี disclosure และไม่ใช้คำโฆษณาเกินจริง',
    ];

    $lines = [
        "Hook Fit Lab {$date}: เกรด {$grade} ({$labScore}/100) · {$summary}",
        $mixTip,
    ];
    foreach (array_slice($withData, 0, 3) as $b) {
        $lines[] = $statusLabel[$b['status']] . ' · ' . $b['bandLabel'] . ': คะแนน ' . $b['score'] . ' (' . $confLabel[$b['confidence']] . ', n=' . $b['samples'] . ', CTR ~' . round($b['avgCtr'] * 100, 1) . '%)';
    }
    foreach (array_slice($suggestions, 0, 2) as $s) {
        $lines[] = 'แนะนำทดลอง · ' . $s['productName'] . ': ' . $s['currentLabel'] . ' → ' . $s['suggestedLabel'];
    }
    $lines[] = INCOME_DISCLAIMER;

    return [
        'date' => $date,
        'fromDate' => $from,
        'windowDays' => $window,
        'grade' => $grade,
        'score' => $labScore,
        'summary' => $summary,
        'counts' => [
            'postsWithMetrics' => $postedN,
            'bandsWithData' => count($withData),
            'unbalanced' => $unbalanced,
            'suggestions' => count($suggestions),
            'hot' => $hot,
        ],
        'bands' => $bands,
        'mixTip' => $mixTip,
        'suggestions' => $suggestions,
        'actions' => $actions,
        'checklist' => $checklist,
        'lines' => $lines,
        'disclaimer' => INCOME_DISCLAIMER,
    ];
}

function hook_fit_lab_to_markdown(array $lab): string
{
    $bandRows = [];
    foreach ($lab['bands'] as $i => $b) {
        if (($b['samples'] ?? 0) <= 0) continue;
        $statusLabel = ['hot' => 'ร้อน', 'steady' => 'นิ่ง', 'cold' => 'เย็น', 'no_data' => 'ยังไม่มีข้อมูล'][$b['status']] ?? $b['status'];
        $confLabel = ['thin' => 'ข้อมูลบาง', 'ok' => 'พอใช้', 'solid' => 'หนาขึ้น'][$b['confidence']] ?? $b['confidence'];
        $n = $i + 1;
        $bandRows[] = "{$n}. **[{$statusLabel}]** {$b['bandLabel']} ({$b['rangeLabel']}) · คะแนน {$b['score']}/100 · n={$b['samples']} · {$confLabel}\n"
            . "   hookIndex avg ~{$b['avgHookIndex']} · CTR ~" . round($b['avgCtr'] * 100, 1) . "% · ออเดอร์/คลิก ~{$b['avgOrdersPerClick']} · ค่าคอมเฉลี่ย ฿{$b['avgCommission']}\n"
            . '   สัดส่วนในหน้าต่าง ~' . round($b['shareOfPosts'] * 100) . "%\n"
            . "   {$b['tip']}";
    }
    if (!$bandRows) $bandRows[] = '_(ยังไม่มีข้อมูล)_';

    $suggestionRows = [];
    foreach ($lab['suggestions'] as $i => $s) {
        $n = $i + 1;
        $hookNo = ((int)$s['hookIndex']) + 1;
        $suggestionRows[] = "{$n}. {$s['productName']} · {$s['status']} · {$s['channelLabel']} · hook #{$hookNo}\n"
            . "   preview: {$s['hookPreview']}\n"
            . "   {$s['currentLabel']} → **{$s['suggestedLabel']}**\n"
            . "   {$s['reason']}\n"
            . "   {$s['tip']}";
    }
    if (!$suggestionRows) {
        $suggestionRows[] = '_(ไม่มีคำแนะนำสลับสไตล์ hook วันนี้)_';
    }
    $actionLines = [];
    foreach ($lab['actions'] as $a) {
        $actionLines[] = "- **{$a['title']}**: {$a['detail']}";
    }
    $checkLines = [];
    foreach ($lab['checklist'] as $c) {
        $checkLines[] = "- {$c}";
    }

    return "# Hook Fit Lab · {$lab['date']}\n\n"
        . $lab['summary'] . "\n\n"
        . "- เกรดแล็บ: {$lab['grade']} ({$lab['score']}/100)\n"
        . "- หน้าต่าง: {$lab['fromDate']} → {$lab['date']} ({$lab['windowDays']} วัน)\n"
        . "- โพสต์มีเมตริก: {$lab['counts']['postsWithMetrics']}\n"
        . "- สไตล์ที่มีข้อมูล: {$lab['counts']['bandsWithData']}\n"
        . "- ช่วงร้อน: {$lab['counts']['hot']}\n"
        . '- มิกซ์เอนข้างเดียว: ' . ($lab['counts']['unbalanced'] ? 'ใช่' : 'ไม่') . "\n\n"
        . "## มิกซ์ทิป\n"
        . $lab['mixTip'] . "\n\n"
        . "## อันดับสไตล์ hook (ทดลอง)\n"
        . implode("\n", $bandRows) . "\n\n"
        . "## คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)\n"
        . implode("\n", $suggestionRows) . "\n\n"
        . "## Actions\n"
        . implode("\n", $actionLines) . "\n\n"
        . "## Checklist\n"
        . implode("\n", $checkLines) . "\n\n"
        . $lab['disclaimer'] . "\n";
}





function cta_style_order(): array
{
    return ['detail', 'soft_gate', 'compare', 'soft_pass', 'generic'];
}

function cta_style_label(string $band): string
{
    return [
        'detail' => 'ชวนดูรายละเอียด/ลิงก์',
        'soft_gate' => 'ถ้าเข้าเงื่อนไขค่อยดู',
        'compare' => 'ชวนเทียบของเดิม',
        'soft_pass' => 'ไม่เร่งซื้อ · ตัดสินใจเอง',
        'generic' => 'CTA ทั่วไป/ไม่ชัด',
    ][$band] ?? $band;
}

function cta_style_range(string $band): string
{
    return [
        'detail' => 'ดูรายละเอียด · ลิงก์ในไบโอ/คอมเมนต์ · อ่านสเปก',
        'soft_gate' => 'ถ้าเข้าเงื่อนไข · ค่อยกดดู',
        'compare' => 'เทียบกับของเดิม · เปิดดูสเปก/รีวิว',
        'soft_pass' => 'ไม่เร่งซื้อ · ค่อยตัดสินใจเอง',
        'generic' => 'กดลิงก์ / สั่งเลย / ไม่เข้าแพทเทิร์นอ่อน',
    ][$band] ?? '';
}

function cta_style_hint(string $band): string
{
    return [
        'detail' => 'ปิดด้วยชวนเปิดดูสเปก/รีวิวที่ลิงก์ — ไม่เร่งกดซื้อ',
        'soft_gate' => 'ใส่เงื่อนไขสั้น ๆ ก่อนชวนดูลิงก์ (เหมาะของเฉพาะทาง)',
        'compare' => 'ชวนเทียบของเดิม 1 จุด แล้วเปิดดูรายละเอียด',
        'soft_pass' => 'ย้ำว่าไม่เร่งซื้อ — ให้ผู้ชมตัดสินใจเองหลังดูข้อมูล',
        'generic' => 'เขียน CTA อ่อนใหม่ให้ชัดกว่า “กดลิงก์” เปล่า ๆ',
    ][$band] ?? '';
}

function classify_cta_style(string $raw): string
{
    $text = trim(preg_replace('/\s+/u', ' ', $raw) ?? '');
    if ($text === '') return 'generic';
    if (preg_match('/ถ้าเข้าเงื่อนไข|ค่อยกดดู|ค่อยดูรายละเอียด|ถ้าเหมาะกับคุณ|ถ้าเข้าเงื่อนไขใช้งาน/u', $text)) return 'soft_gate';
    if (preg_match('/เทียบกับของเดิม|อยากลองเทียบ|เปิดลิงก์ไปดูสเปก|เทียบสเปก|เทียบก่อน/u', $text)) return 'compare';
    if (preg_match('/ไม่เร่งซื้อ|ค่อยตัดสินใจเอง|ตัดสินใจเองได้|ไม่ต้องรีบ|ไม่เร่งกด/u', $text)) return 'soft_pass';
    if (preg_match('/ดูรายละเอียด|อ่านรีวิว|ลิงก์ในคอมเมนต์|ลิงก์ในไบโอ|ลิงก์ด้านล่าง|เปิดดูรายละเอียด|ดูสเปก/u', $text)) return 'detail';
    if (preg_match('/สั่งเลย|กดซื้อเลย|รีบก่อนหมด|รับประกัน|การันตี|รวยแน่/u', $text)) return 'generic';
    return 'generic';
}

function cta_style_from_index(int $index): string
{
    $map = ['detail', 'soft_gate', 'compare', 'soft_pass', 'detail', 'soft_pass'];
    if ($index < 0) return 'generic';
    return $map[$index % count($map)] ?? 'generic';
}

function resolve_cta_text(?array $pack, int $ctaIndex, string $captionPreview = ''): string
{
    $fromPack = trim((string)($pack['ctas'][$ctaIndex] ?? ''));
    if ($fromPack !== '') return $fromPack;
    $preview = trim($captionPreview);
    if ($preview !== '') {
        $lines = array_values(array_filter(array_map('trim', preg_split('/\n/', $preview) ?: []), fn($l) => $l !== ''));
        if ($lines) return mb_substr($lines[count($lines) - 1], 0, 180);
    }
    return '';
}

function cta_style_of(array $post, ?array $pack = null): string
{
    $text = resolve_cta_text($pack, (int)($post['cta_index'] ?? 0), (string)($post['caption_preview'] ?? ''));
    if ($text !== '') return classify_cta_style($text);
    return cta_style_from_index((int)($post['cta_index'] ?? 0));
}

function build_cta_fit_lab(?string $date = null, int $windowDays = 14): array
{
    $date = $date ?: today_iso();
    $window = max(7, min(30, $windowDays));
    $from = date('Y-m-d', strtotime($date . ' -' . ($window - 1) . ' days'));
    $order = cta_style_order();
    $statusLabel = ['hot' => 'ร้อน', 'steady' => 'นิ่ง', 'cold' => 'เย็น', 'no_data' => 'ยังไม่มีข้อมูล'];
    $confLabel = ['thin' => 'ข้อมูลบาง', 'ok' => 'พอใช้', 'solid' => 'หนาขึ้น'];

    $products = all_products();
    $byId = [];
    foreach ($products as $p) $byId[$p['id']] = $p;

    $stmt = db()->prepare("SELECT * FROM schedule WHERE status='posted' AND metrics_at IS NOT NULL AND post_date BETWEEN ? AND ?");
    $stmt->execute([$from, $date]);
    $posted = $stmt->fetchAll() ?: [];

    $byBand = [];
    foreach ($order as $b) $byBand[$b] = [];
    $allComm = [];
    $packCache = [];
    foreach ($posted as $row) {
        $packId = (string)($row['content_pack_id'] ?? '');
        if ($packId !== '' && !isset($packCache[$packId])) {
            $pstmt = db()->prepare('SELECT * FROM content_packs WHERE id=?');
            $pstmt->execute([$packId]);
            $prow = $pstmt->fetch();
            $packCache[$packId] = $prow ? [
                'hooks' => decode_list($prow['hooks']),
                'ctas' => decode_list($prow['ctas'] ?? '[]'),
            ] : null;
        }
        $pack = $packCache[$packId] ?? null;
        if (!$pack) {
            $pack = latest_pack((string)$row['product_id']) ?: ['hooks' => [], 'ctas' => []];
        }
        $key = cta_style_of([
            'cta_index' => (int)($row['cta_index'] ?? 0),
            'caption_preview' => (string)($row['caption_preview'] ?? ''),
            'content_pack_id' => $packId,
        ], $pack);
        $byBand[$key][] = $row;
        $allComm[] = (float)$row['commission_earned'];
    }
    $globalAvg = $allComm ? array_sum($allComm) / count($allComm) : 0.0;
    $postedN = count($posted);

    $bands = [];
    foreach ($order as $band) {
        $list = $byBand[$band];
        $samples = count($list);
        $views = array_map(fn($r) => (int)$r['views'], $list);
        $clicks = array_map(fn($r) => (int)$r['clicks'], $list);
        $orders = array_map(fn($r) => (int)$r['orders_count'], $list);
        $comms = array_map(fn($r) => (float)$r['commission_earned'], $list);
        $avgViews = $samples ? array_sum($views) / $samples : 0.0;
        $avgClicks = $samples ? array_sum($clicks) / $samples : 0.0;
        $avgOrders = $samples ? array_sum($orders) / $samples : 0.0;
        $avgCommission = $samples ? array_sum($comms) / $samples : 0.0;
        $totalViews = array_sum($views);
        $totalClicks = array_sum($clicks);
        $totalOrders = array_sum($orders);
        $avgCtr = $totalViews > 0 ? $totalClicks / $totalViews : 0.0;
        $avgOpc = $totalClicks > 0 ? $totalOrders / $totalClicks : 0.0;
        $share = $postedN > 0 ? $samples / $postedN : 0.0;
        $avgCtaIndex = $samples ? array_sum(array_map(fn($r) => (int)($r['cta_index'] ?? 0), $list)) / $samples : 0.0;

        $score = 0.0;
        if ($samples > 0) {
            $commBase = $globalAvg > 0
                ? max(0, min(70, ($avgCommission / $globalAvg) * 50))
                : max(0, min(50, $avgCommission * 2));
            $ctrScore = max(0, min(22, $avgCtr * 220));
            $opcScore = max(0, min(15, $avgOpc * 100));
            $orderScore = max(0, min(15, $avgOrders * 8));
            $score = $commBase + $ctrScore + $opcScore + $orderScore;
            if ($band === 'soft_pass') $score += 4;
            elseif ($band === 'detail') $score += 3;
            elseif ($band === 'soft_gate') $score += 2;
            elseif ($band === 'compare') $score += 2;
            elseif ($band === 'generic') $score -= 4;
            if ($share >= 0.7 && $samples >= 3) $score -= 12;
            elseif ($share >= 0.55 && $samples >= 2) $score -= 6;
            if ($samples === 1) $score *= 0.75;
            $score = max(0, min(100, round($score)));
        }

        $confidence = $samples >= 4 ? 'solid' : ($samples >= 2 ? 'ok' : 'thin');
        if ($samples === 0) $status = 'no_data';
        elseif ($score >= 65 && $samples >= 2) $status = 'hot';
        elseif ($score >= 45) $status = 'steady';
        else $status = 'cold';

        if ($samples === 0) {
            $tip = 'ยังไม่มีผลสไตล์นี้ — ลอง draft 1 ชิ้นแนว “' . cta_style_hint($band) . '” แล้วกรอกเมตริก';
        } elseif ($status === 'hot') {
            $tip = 'CTA สไตล์นี้ดูเวิร์กกว่าในหน้าต่างนี้ (ทดลอง) — ใช้ต่อได้ แต่สลับสินค้า/มุมเพื่อไม่ให้ซ้ำ';
        } elseif ($status === 'cold') {
            $tip = 'ผลเย็นในสไตล์นี้ — ลองสลับ ctaIndex หรือสร้างแคปชันใหม่ก่อนโพสต์ซ้ำ';
        } elseif ($share >= 0.55) {
            $tip = 'ใช้สไตล์นี้บ่อย (' . round($share * 100) . '%) — กระจาย CTA เพื่อลดความซ้ำ';
        } else {
            $tip = 'เก็บข้อมูลต่ออีก 1–2 โพสต์ในสไตล์นี้ก่อนสรุป — ตัวเลขยังเป็นสมมติฐาน';
        }

        $bands[] = [
            'band' => $band,
            'bandLabel' => cta_style_label($band),
            'rangeLabel' => cta_style_range($band),
            'samples' => $samples,
            'avgViews' => round($avgViews, 1),
            'avgClicks' => round($avgClicks, 1),
            'avgOrders' => round($avgOrders, 2),
            'avgCommission' => round($avgCommission, 1),
            'avgCtr' => round($avgCtr, 2),
            'avgOrdersPerClick' => round($avgOpc, 2),
            'avgCtaIndex' => round($avgCtaIndex, 1),
            'score' => (int)$score,
            'status' => $status,
            'confidence' => $confidence,
            'shareOfPosts' => round($share, 2),
            'tip' => $tip,
        ];
    }
    usort($bands, fn($a, $b) => ($b['score'] <=> $a['score']) ?: ($b['samples'] <=> $a['samples']));

    $withData = array_values(array_filter($bands, fn($b) => $b['samples'] > 0));
    $hot = count(array_filter($bands, fn($b) => $b['status'] === 'hot'));
    $topShare = 0.0;
    foreach ($bands as $b) $topShare = max($topShare, (float)$b['shareOfPosts']);
    $unbalanced = $topShare >= 0.55 && $postedN >= 3;
    $scoredAvg = $withData ? array_sum(array_map(fn($b) => $b['score'], $withData)) / count($withData) : 0.0;
    $labScore = (int)round($scoredAvg);
    if (count($withData) >= 3) $labScore = min(100, $labScore + 8);
    elseif (count($withData) === 1 && $postedN >= 3) $labScore = max(0, $labScore - 10);
    if ($unbalanced) $labScore = max(0, $labScore - 8);
    $labScore = max(0, min(100, $labScore));
    if (!$withData) $grade = 'D';
    elseif ($labScore >= 75) $grade = 'A';
    elseif ($labScore >= 58) $grade = 'B';
    elseif ($labScore >= 40) $grade = 'C';
    else $grade = 'D';

    $best = null;
    foreach ($withData as $b) {
        if ($b['status'] === 'hot') { $best = $b; break; }
    }
    if (!$best && $withData) $best = $withData[0];
    $cold = array_values(array_filter($withData, fn($b) => $b['status'] === 'cold'));

    if ($postedN === 0) {
        $mixTip = 'ยังไม่มีเมตริกรายสไตล์ CTA — โพสต์มือแล้วกรอกผลที่ Results ก่อนจัดมิกซ์';
        $summary = 'CTA Fit Lab: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลหลังโพสต์มือก่อนจัดอันดับสไตล์ปิดคลิป';
    } else {
        $summary = "CTA Fit Lab: {$postedN} โพสต์มีเมตริก · สไตล์ที่มีข้อมูล " . count($withData) . " · ร้อน {$hot}" . ($unbalanced ? ' · มิกซ์เอนข้างเดียว' : '');
        if ($unbalanced && $best) {
            $mixTip = 'มิกซ์เอนไปสไตล์ ' . $best['bandLabel'] . ' มาก — วันถัดไปลองสลับ CTA 1 ชิ้น (ทดลอง)';
        } elseif ($best) {
            $mixTip = 'สไตล์ CTA เด่น: ' . $best['bandLabel'] . ' — ใช้เป็นสมมติฐาน ไม่ล็อคทุกโพสต์';
        } else {
            $mixTip = 'เก็บผลต่ออีก 2–3 โพสต์ข้ามสไตล์ CTA ก่อนจัดอันดับมิกซ์';
        }
    }

    $stmt = db()->prepare("SELECT s.*, p.name AS product_name FROM schedule s LEFT JOIN products p ON p.id=s.product_id WHERE s.post_date=? AND s.status IN ('draft','approved') ORDER BY s.suggested_time ASC LIMIT 6");
    $stmt->execute([$date]);
    $todaySlots = $stmt->fetchAll() ?: [];

    $preferred = null;
    foreach ($bands as $b) {
        if ($b['status'] === 'hot') { $preferred = $b; break; }
    }
    if (!$preferred) {
        foreach ($bands as $b) {
            if ($b['status'] === 'steady' && $b['samples'] > 0) { $preferred = $b; break; }
        }
    }

    $suggestions = [];
    foreach ($todaySlots as $slot) {
        if (!$preferred) break;
        $packId = (string)($slot['content_pack_id'] ?? '');
        if ($packId !== '' && !isset($packCache[$packId])) {
            $pstmt = db()->prepare('SELECT * FROM content_packs WHERE id=?');
            $pstmt->execute([$packId]);
            $prow = $pstmt->fetch();
            $packCache[$packId] = $prow ? [
                'hooks' => decode_list($prow['hooks']),
                'ctas' => decode_list($prow['ctas'] ?? '[]'),
            ] : null;
        }
        $pack = $packCache[$packId] ?? (latest_pack((string)$slot['product_id']) ?: ['hooks' => [], 'ctas' => []]);
        $currentKey = cta_style_of([
            'cta_index' => (int)($slot['cta_index'] ?? 0),
            'caption_preview' => (string)($slot['caption_preview'] ?? ''),
            'content_pack_id' => $packId,
        ], $pack);
        $currentRow = null;
        foreach ($bands as $b) {
            if ($b['band'] === $currentKey) { $currentRow = $b; break; }
        }
        $same = $currentKey === $preferred['band'];
        $preview = resolve_cta_text($pack, (int)($slot['cta_index'] ?? 0), (string)($slot['caption_preview'] ?? ''));
        $preview = mb_substr(trim(preg_replace('/\s+/u', ' ', $preview) ?? ''), 0, 48);
        $currentCold = $currentRow && (
            $currentRow['status'] === 'cold'
            || ($currentRow['status'] === 'no_data' && $preferred['status'] === 'hot')
            || $currentKey === 'generic'
        );
        if ($currentCold && !$same) {
            $suggestions[] = [
                'scheduleId' => (string)$slot['id'],
                'productId' => (string)$slot['product_id'],
                'productName' => (string)($slot['product_name'] ?? $slot['product_id']),
                'currentBand' => $currentKey,
                'currentLabel' => cta_style_label($currentKey),
                'suggestedBand' => $preferred['band'],
                'suggestedLabel' => $preferred['bandLabel'],
                'ctaIndex' => (int)($slot['cta_index'] ?? 0),
                'ctaPreview' => $preview !== '' ? $preview : ('(cta #' . ((int)($slot['cta_index'] ?? 0) + 1) . ')'),
                'status' => (string)$slot['status'],
                'channelLabel' => channel_label((string)$slot['channel']),
                'reason' => cta_style_label($currentKey) . ' เย็น · ' . $preferred['bandLabel'] . ' ดูดีกว่าในหน้าต่างนี้ (ทดลอง)',
                'tip' => 'ไม่สลับ CTA อัตโนมัติ — กดสร้างแคปชันใหม่หรือเลือก ctaIndex อื่น แล้ว Approve ก่อนโพสต์มือ',
            ];
        } elseif ($unbalanced && $same && $cold && count($suggestions) < 2) {
            $alt = null;
            foreach ($bands as $b) {
                if ($b['band'] !== $currentKey && $b['band'] !== 'generic' && in_array($b['status'], ['steady', 'no_data'], true)) {
                    $alt = $b;
                    break;
                }
            }
            if (!$alt) $alt = $cold[0];
            $suggestions[] = [
                'scheduleId' => (string)$slot['id'],
                'productId' => (string)$slot['product_id'],
                'productName' => (string)($slot['product_name'] ?? $slot['product_id']),
                'currentBand' => $currentKey,
                'currentLabel' => cta_style_label($currentKey),
                'suggestedBand' => $alt['band'],
                'suggestedLabel' => $alt['bandLabel'],
                'ctaIndex' => (int)($slot['cta_index'] ?? 0),
                'ctaPreview' => $preview !== '' ? $preview : ('(cta #' . ((int)($slot['cta_index'] ?? 0) + 1) . ')'),
                'status' => (string)$slot['status'],
                'channelLabel' => channel_label((string)$slot['channel']),
                'reason' => 'วันนี้ซ้อนสไตล์ ' . cta_style_label($currentKey) . ' — ลองกระจายไป ' . $alt['bandLabel'] . ' เพื่อลดความซ้ำ (ทดลอง)',
                'tip' => 'ระบบไม่เปลี่ยน CTA เอง — regenerate draft แล้ว Approve ใหม่',
            ];
        }
        if (count($suggestions) >= 5) break;
    }

    $actions = [];
    if ($postedN === 0) {
        $actions[] = [
            'id' => 'need-metrics',
            'title' => 'เริ่มเก็บผลรายสไตล์ CTA',
            'detail' => 'Approve → โพสต์มือ → กรอก views/clicks/orders ที่ Results อย่างน้อย 1 ชิ้นต่อสไตล์ปิดคลิป',
        ];
    }
    if ($best && $best['status'] === 'hot') {
        $actions[] = [
            'id' => 'lean-cta',
            'title' => 'เอียงทดลองไปสไตล์ ' . $best['bandLabel'],
            'detail' => 'n=' . $best['samples'] . ' · คะแนนฟิต ~' . $best['score'] . ' — ใช้ 1–2 สล็อต · ' . cta_style_hint($best['band']),
        ];
    }
    if ($unbalanced) {
        $actions[] = [
            'id' => 'diversify',
            'title' => 'กระจายมิกซ์สไตล์ CTA',
            'detail' => 'สไตล์เด่นกินสัดส่วนสูง — เพิ่ม draft คนละสไตล์ปิดคลิป 1 ชิ้นในรอบถัดไป (กันสแปมฟีล)',
        ];
    }
    if ($cold) {
        $actions[] = [
            'id' => 'review-cold',
            'title' => 'ทบทวนสไตล์เย็น: ' . implode(', ', array_map(fn($b) => $b['bandLabel'], $cold)),
            'detail' => 'สลับ ctaIndex / regenerate หรือพักมุมนั้นชั่วคราว — อย่าโพสต์ซ้ำข้อความเดิม',
        ];
    }
    $missing = [];
    foreach ($order as $b) {
        if ($b === 'generic') continue;
        if (count($byBand[$b]) === 0) $missing[] = $b;
    }
    if ($missing && $postedN > 0) {
        $actions[] = [
            'id' => 'fill-styles',
            'title' => 'ทดลองสไตล์ที่ยังไม่มีข้อมูล (' . count($missing) . ')',
            'detail' => 'ยังไม่มี: ' . implode(' · ', array_map('cta_style_label', $missing)) . ' — draft 1 ชิ้นต่อสไตล์แล้ววัดผล',
        ];
    }
    $actions[] = [
        'id' => 'compliance',
        'title' => 'คงกฎ Approve + disclosure',
        'detail' => 'ทุกสไตล์ CTA ต้องมีข้อความ affiliate และผ่าน Approve ก่อนโพสต์มือ — ระบบไม่โพสต์อัตโนมัติ',
    ];
    $actions = array_slice($actions, 0, 5);

    $checklist = [
        'อันดับสไตล์ CTA มาจากเมตริกที่คุณกรอกเอง — ไม่ดึง API แพลตฟอร์ม',
        'คะแนนฟิตเป็นสมมติฐานทดลอง ไม่การันตียอดขาย/ค่าคอม',
        'คำแนะนำสลับสไตล์เป็นคำแนะนำเท่านั้น — ต้องแก้เอง + Approve',
        'อย่าถล่ม CTA แบบเดียวซ้ำ ๆ ในวันเดียวกัน (กันสแปม)',
        'ทุกโพสต์ต้องมี disclosure และไม่ใช้คำโฆษณาเกินจริง',
    ];

    $lines = [
        "CTA Fit Lab {$date}: เกรด {$grade} ({$labScore}/100) · {$summary}",
        $mixTip,
    ];
    foreach (array_slice($withData, 0, 3) as $b) {
        $lines[] = $statusLabel[$b['status']] . ' · ' . $b['bandLabel'] . ': คะแนน ' . $b['score'] . ' (' . $confLabel[$b['confidence']] . ', n=' . $b['samples'] . ', CTR ~' . round($b['avgCtr'] * 100, 1) . '%)';
    }
    foreach (array_slice($suggestions, 0, 2) as $s) {
        $lines[] = 'แนะนำทดลอง · ' . $s['productName'] . ': ' . $s['currentLabel'] . ' → ' . $s['suggestedLabel'];
    }
    $lines[] = INCOME_DISCLAIMER;

    return [
        'date' => $date,
        'fromDate' => $from,
        'windowDays' => $window,
        'grade' => $grade,
        'score' => $labScore,
        'summary' => $summary,
        'counts' => [
            'postsWithMetrics' => $postedN,
            'bandsWithData' => count($withData),
            'unbalanced' => $unbalanced,
            'suggestions' => count($suggestions),
            'hot' => $hot,
        ],
        'bands' => $bands,
        'mixTip' => $mixTip,
        'suggestions' => array_slice($suggestions, 0, 5),
        'actions' => $actions,
        'checklist' => $checklist,
        'lines' => $lines,
        'disclaimer' => INCOME_DISCLAIMER,
    ];
}

function cta_fit_lab_to_markdown(array $lab): string
{
    $bandRows = [];
    foreach ($lab['bands'] as $i => $b) {
        if (($b['samples'] ?? 0) <= 0) continue;
        $statusLabel = ['hot' => 'ร้อน', 'steady' => 'นิ่ง', 'cold' => 'เย็น', 'no_data' => 'ยังไม่มีข้อมูล'][$b['status']] ?? $b['status'];
        $confLabel = ['thin' => 'ข้อมูลบาง', 'ok' => 'พอใช้', 'solid' => 'หนาขึ้น'][$b['confidence']] ?? $b['confidence'];
        $n = count($bandRows) + 1;
        $bandRows[] = "{$n}. **[{$statusLabel}]** {$b['bandLabel']} ({$b['rangeLabel']}) · คะแนน {$b['score']}/100 · n={$b['samples']} · {$confLabel}\n"
            . "   ctaIndex avg ~{$b['avgCtaIndex']} · CTR ~" . round($b['avgCtr'] * 100, 1) . "% · ออเดอร์/คลิก ~{$b['avgOrdersPerClick']} · ค่าคอมเฉลี่ย ฿{$b['avgCommission']}\n"
            . '   สัดส่วนในหน้าต่าง ~' . round($b['shareOfPosts'] * 100) . "%\n"
            . "   {$b['tip']}";
    }
    if (!$bandRows) $bandRows[] = '_(ยังไม่มีข้อมูล)_';

    $suggestionRows = [];
    foreach ($lab['suggestions'] as $i => $s) {
        $n = $i + 1;
        $ctaNo = ((int)$s['ctaIndex']) + 1;
        $suggestionRows[] = "{$n}. {$s['productName']} · {$s['status']} · {$s['channelLabel']} · cta #{$ctaNo}\n"
            . "   preview: {$s['ctaPreview']}\n"
            . "   {$s['currentLabel']} → **{$s['suggestedLabel']}**\n"
            . "   {$s['reason']}\n"
            . "   {$s['tip']}";
    }
    if (!$suggestionRows) $suggestionRows[] = '_(ไม่มีคำแนะนำสลับสไตล์ CTA วันนี้)_';

    $actionLines = [];
    foreach ($lab['actions'] as $a) {
        $actionLines[] = "- **{$a['title']}**: {$a['detail']}";
    }
    $checkLines = array_map(fn($c) => "- {$c}", $lab['checklist']);

    return "# CTA Fit Lab · {$lab['date']}\n\n"
        . $lab['summary'] . "\n\n"
        . "- เกรดแล็บ: {$lab['grade']} ({$lab['score']}/100)\n"
        . "- หน้าต่าง: {$lab['fromDate']} → {$lab['date']} ({$lab['windowDays']} วัน)\n"
        . "- โพสต์มีเมตริก: {$lab['counts']['postsWithMetrics']}\n"
        . "- สไตล์ที่มีข้อมูล: {$lab['counts']['bandsWithData']}\n"
        . "- ช่วงร้อน: {$lab['counts']['hot']}\n"
        . '- มิกซ์เอนข้างเดียว: ' . (!empty($lab['counts']['unbalanced']) ? 'ใช่' : 'ไม่') . "\n\n"
        . "## มิกซ์ทิป\n"
        . $lab['mixTip'] . "\n\n"
        . "## อันดับสไตล์ CTA (ทดลอง)\n"
        . implode("\n", $bandRows) . "\n\n"
        . "## คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)\n"
        . implode("\n", $suggestionRows) . "\n\n"
        . "## Actions\n"
        . implode("\n", $actionLines) . "\n\n"
        . "## Checklist\n"
        . implode("\n", $checkLines) . "\n\n"
        . $lab['disclaimer'] . "\n";
}



function hashtag_style_order(): array
{
    return ['bilingual', 'thai_niche', 'en_discovery', 'sparse', 'generic'];
}

function hashtag_band_label(string $band): string
{
    return [
        'bilingual' => 'ไทย+อังกฤษ + disclosure',
        'thai_niche' => 'ไทยเน้นหมวด/แพลตฟอร์ม',
        'en_discovery' => 'อังกฤษเน้นค้นพบ',
        'sparse' => 'แฮชแท็กน้อยเกินไป',
        'generic' => 'ทั่วไป/ไม่ชัด',
    ][$band] ?? $band;
}

function hashtag_band_range(string $band): string
{
    return [
        'bilingual' => 'TH+EN สมดุล · มี #AffiliateDisclosure',
        'thai_niche' => 'แท็กไทย + หมวด/#ShopeeAffiliate/#TikTokShop',
        'en_discovery' => '#ProductPick · #HonestReview · #ShortVideo',
        'sparse' => 'น้อยกว่า 3 แท็ก',
        'generic' => 'แท็กกว้าง ๆ ไม่มี niche / ไม่เข้าแพทเทิร์น',
    ][$band] ?? '';
}

function hashtag_style_hint(string $band): string
{
    return [
        'bilingual' => 'ผสมแท็กไทย 3–4 + อังกฤษ 2–3 และใส่ #AffiliateDisclosure เสมอ',
        'thai_niche' => 'เน้นแท็กไทย + หมวดสินค้า/แพลตฟอร์ม — อย่าถล่มแท็กซ้ำวันเดิม',
        'en_discovery' => 'ใช้แท็กอังกฤษค้นพบเบา ๆ คู่กับ disclosure — ไม่สแปมยาว',
        'sparse' => 'เพิ่มแท็กให้ครบอย่างน้อย 4–6 ตัว รวม disclosure',
        'generic' => 'ใส่หมวด/แพลตฟอร์มให้ชัด แทนแท็กกว้าง ๆ อย่างเดียว',
    ][$band] ?? '';
}

function normalize_hashtag(string $raw): string
{
    $t = trim(preg_replace('/\s+/u', '', $raw) ?? '');
    if ($t === '') return '';
    return str_starts_with($t, '#') ? $t : '#' . $t;
}

function hashtag_key(string $tag): string
{
    return mb_strtolower(normalize_hashtag($tag));
}

function extract_hashtags_from_text(string $raw): array
{
    if (trim($raw) === '') return [];
    if (!preg_match_all('/#[\w\x{0E00}-\x{0E7F}]+/u', $raw, $m)) return [];
    $seen = [];
    $out = [];
    foreach ($m[0] as $tag) {
        $n = normalize_hashtag($tag);
        $key = hashtag_key($n);
        if ($key === '' || isset($seen[$key])) continue;
        $seen[$key] = true;
        $out[] = $n;
    }
    return $out;
}

function is_thai_heavy_tag(string $tag): bool
{
    return (bool)preg_match('/[\x{0E00}-\x{0E7F}]/u', $tag);
}

function hashtag_has_any(array $tags, array $needles): bool
{
    $set = [];
    foreach ($tags as $t) $set[hashtag_key((string)$t)] = true;
    foreach ($needles as $n) {
        if (isset($set[hashtag_key($n)])) return true;
    }
    return false;
}

function resolve_hashtag_lists(?array $pack, string $captionPreview = ''): array
{
    $fromTh = array_values(array_filter(array_map('normalize_hashtag', $pack['hashtagsTh'] ?? [])));
    $fromEn = array_values(array_filter(array_map('normalize_hashtag', $pack['hashtagsEn'] ?? [])));
    $fromCaption = extract_hashtags_from_text($captionPreview);
    $seen = [];
    $all = [];
    foreach (array_merge($fromTh, $fromEn, $fromCaption) as $t) {
        $key = hashtag_key($t);
        if ($key === '' || isset($seen[$key])) continue;
        $seen[$key] = true;
        $all[] = $t;
    }
    $th = array_values(array_filter($all, 'is_thai_heavy_tag'));
    $en = array_values(array_filter($all, fn($t) => !is_thai_heavy_tag($t)));
    return ['th' => $th, 'en' => $en, 'all' => $all];
}

function classify_hashtag_style(array $th, array $en, string $captionPreview = ''): string
{
    $resolved = resolve_hashtag_lists(['hashtagsTh' => $th, 'hashtagsEn' => $en], $captionPreview);
    $tags = $resolved['all'];
    if (count($tags) < 3) return 'sparse';

    $thN = count($resolved['th']);
    $enN = count($resolved['en']);
    $total = count($tags);
    $disclosure = ['#AffiliateDisclosure', '#AffiliateLink', '#ad', '#advertisement', '#สปอนเซอร์', '#โฆษณา'];
    $niche = ['#ShopeeAffiliate', '#TikTokShop', '#Shopee', '#TikTok', '#เลือกดี'];
    $genericTh = ['#รีวิวของใช้', '#แนะนำของดี', '#ช้อปอย่างมีเหตุผล', '#รีวิว', '#ของดีบอกต่อ'];
    $discovery = ['#ProductPick', '#HonestReview', '#ShortVideo', '#Thailand', '#fyp', '#foryou'];

    $hasDisclosure = hashtag_has_any($tags, $disclosure);
    $hasPlatformNiche = hashtag_has_any($tags, $niche);
    $hasDiscovery = hashtag_has_any($tags, $discovery);
    $genericKeys = array_map('hashtag_key', $genericTh);
    $onlyGenericTh = $thN > 0 && $enN === 0 && !$hasPlatformNiche;
    if ($onlyGenericTh) {
        foreach ($resolved['th'] as $t) {
            if (!in_array(hashtag_key($t), $genericKeys, true)) {
                $onlyGenericTh = false;
                break;
            }
        }
    }
    $hasNiche = $hasPlatformNiche || ($thN >= 2 && !$onlyGenericTh);

    if ($thN >= 3 && $enN <= 2 && $hasNiche && !$hasDiscovery) return 'thai_niche';
    if ($thN >= 2 && $enN >= 2 && $hasDisclosure && ($hasDiscovery || $enN >= 3)) return 'bilingual';
    if ($enN >= 3 && $thN <= 1 && ($hasDiscovery || $hasDisclosure)) return 'en_discovery';
    if ($thN >= 2 && $enN >= 2 && $hasDisclosure) return 'bilingual';
    if ($onlyGenericTh || (!$hasNiche && !$hasDisclosure && !$hasDiscovery)) return 'generic';
    if ($total > 0 && ($thN / $total) >= 0.7 && $hasNiche) return 'thai_niche';
    if ($total > 0 && ($enN / $total) >= 0.7) return 'en_discovery';
    return 'generic';
}

function hashtag_style_of(array $post, ?array $pack = null): string
{
    $lists = resolve_hashtag_lists($pack, (string)($post['caption_preview'] ?? $post['captionPreview'] ?? ''));
    return classify_hashtag_style($lists['th'], $lists['en'], (string)($post['caption_preview'] ?? $post['captionPreview'] ?? ''));
}

function build_hashtag_fit_lab(?string $date = null, int $windowDays = 14): array
{
    $date = $date ?: today_iso();
    $window = max(7, min(30, $windowDays));
    $from = date('Y-m-d', strtotime($date . ' -' . ($window - 1) . ' days'));
    $order = hashtag_style_order();
    $statusLabel = ['hot' => 'ร้อน', 'steady' => 'นิ่ง', 'cold' => 'เย็น', 'no_data' => 'ยังไม่มีข้อมูล'];
    $confLabel = ['thin' => 'ข้อมูลบาง', 'ok' => 'พอใช้', 'solid' => 'หนาขึ้น'];

    $products = all_products();
    $byId = [];
    foreach ($products as $p) $byId[$p['id']] = $p;

    $stmt = db()->prepare("SELECT * FROM schedule WHERE status='posted' AND metrics_at IS NOT NULL AND post_date BETWEEN ? AND ?");
    $stmt->execute([$from, $date]);
    $posted = $stmt->fetchAll() ?: [];

    $byBand = [];
    foreach ($order as $b) $byBand[$b] = [];
    $allComm = [];
    $packCache = [];
    foreach ($posted as $row) {
        $packId = (string)($row['content_pack_id'] ?? '');
        if ($packId !== '' && !isset($packCache[$packId])) {
            $pstmt = db()->prepare('SELECT * FROM content_packs WHERE id=?');
            $pstmt->execute([$packId]);
            $prow = $pstmt->fetch();
            $packCache[$packId] = $prow ? [
                'hashtagsTh' => decode_list($prow['hashtags_th'] ?? '[]'),
                'hashtagsEn' => decode_list($prow['hashtags_en'] ?? '[]'),
            ] : null;
        }
        $pack = $packCache[$packId] ?? null;
        if (!$pack) {
            $lp = latest_pack((string)$row['product_id']);
            $pack = $lp ? [
                'hashtagsTh' => $lp['hashtagsTh'] ?? [],
                'hashtagsEn' => $lp['hashtagsEn'] ?? [],
            ] : ['hashtagsTh' => [], 'hashtagsEn' => []];
        }
        $key = hashtag_style_of([
            'caption_preview' => (string)($row['caption_preview'] ?? ''),
            'content_pack_id' => $packId,
        ], $pack);
        $byBand[$key][] = $row;
        $allComm[] = (float)$row['commission_earned'];
    }
    $globalAvg = $allComm ? array_sum($allComm) / count($allComm) : 0.0;
    $postedN = count($posted);

    $bands = [];
    foreach ($order as $band) {
        $list = $byBand[$band];
        $samples = count($list);
        $views = array_map(fn($r) => (int)$r['views'], $list);
        $clicks = array_map(fn($r) => (int)$r['clicks'], $list);
        $orders = array_map(fn($r) => (int)$r['orders_count'], $list);
        $comms = array_map(fn($r) => (float)$r['commission_earned'], $list);
        $avgViews = $samples ? array_sum($views) / $samples : 0.0;
        $avgClicks = $samples ? array_sum($clicks) / $samples : 0.0;
        $avgOrders = $samples ? array_sum($orders) / $samples : 0.0;
        $avgCommission = $samples ? array_sum($comms) / $samples : 0.0;
        $totalViews = array_sum($views);
        $totalClicks = array_sum($clicks);
        $totalOrders = array_sum($orders);
        $avgCtr = $totalViews > 0 ? $totalClicks / $totalViews : 0.0;
        $avgOpc = $totalClicks > 0 ? $totalOrders / $totalClicks : 0.0;
        $share = $postedN > 0 ? $samples / $postedN : 0.0;
        $tagCounts = [];
        foreach ($list as $r) {
            $pid = (string)($r['content_pack_id'] ?? '');
            $pk = $packCache[$pid] ?? ['hashtagsTh' => [], 'hashtagsEn' => []];
            $tagCounts[] = count(resolve_hashtag_lists($pk, (string)($r['caption_preview'] ?? ''))['all']);
        }
        $avgTagCount = $samples ? array_sum($tagCounts) / $samples : 0.0;

        $score = 0.0;
        if ($samples > 0) {
            $commBase = $globalAvg > 0
                ? max(0, min(70, ($avgCommission / $globalAvg) * 50))
                : max(0, min(50, $avgCommission * 2));
            $score = $commBase + max(0, min(22, $avgCtr * 220)) + max(0, min(15, $avgOpc * 100)) + max(0, min(15, $avgOrders * 8));
            if ($band === 'bilingual') $score += 4;
            elseif ($band === 'thai_niche') $score += 3;
            elseif ($band === 'en_discovery') $score += 2;
            elseif ($band === 'sparse') $score -= 6;
            elseif ($band === 'generic') $score -= 4;
            if ($avgTagCount >= 18) $score -= 8;
            elseif ($avgTagCount >= 14) $score -= 4;
            if ($share >= 0.7 && $samples >= 3) $score -= 12;
            elseif ($share >= 0.55 && $samples >= 2) $score -= 6;
            if ($samples === 1) $score *= 0.75;
            $score = (int)round(max(0, min(100, $score)));
        }
        $confidence = $samples >= 4 ? 'solid' : ($samples >= 2 ? 'ok' : 'thin');
        $status = $samples === 0 ? 'no_data' : ($score >= 65 && $samples >= 2 ? 'hot' : ($score >= 45 ? 'steady' : 'cold'));
        $tip = 'เก็บข้อมูลต่ออีก 1–2 โพสต์ในสไตล์นี้ก่อนสรุป — ตัวเลขยังเป็นสมมติฐาน';
        if ($samples === 0) $tip = 'ยังไม่มีผลสไตล์นี้ — ลอง draft 1 ชิ้นแนว “' . hashtag_style_hint($band) . '” แล้วกรอกเมตริก';
        elseif ($status === 'hot') $tip = 'มิกซ์แฮชแท็กนี้ดูเวิร์กกว่าในหน้าต่างนี้ (ทดลอง) — ใช้ต่อได้ แต่สลับสินค้า/มุมเพื่อไม่ให้ซ้ำ';
        elseif ($status === 'cold') $tip = 'ผลเย็นในสไตล์นี้ — ลองปรับชุดแท็กหรือ regenerate แคปชันก่อนโพสต์ซ้ำ';
        elseif ($share >= 0.55) $tip = 'ใช้สไตล์นี้บ่อย (' . round($share * 100) . '%) — กระจายมิกซ์แท็กเพื่อลดความซ้ำ';

        $bands[] = [
            'band' => $band,
            'bandLabel' => hashtag_band_label($band),
            'rangeLabel' => hashtag_band_range($band),
            'samples' => $samples,
            'avgViews' => round($avgViews, 1),
            'avgClicks' => round($avgClicks, 1),
            'avgOrders' => round($avgOrders, 2),
            'avgCommission' => round($avgCommission, 1),
            'avgCtr' => round($avgCtr, 2),
            'avgOrdersPerClick' => round($avgOpc, 2),
            'avgTagCount' => round($avgTagCount, 1),
            'score' => $score,
            'status' => $status,
            'confidence' => $confidence,
            'shareOfPosts' => round($share, 2),
            'tip' => $tip,
        ];
    }
    usort($bands, fn($a, $b) => ($b['score'] <=> $a['score']) ?: ($b['samples'] <=> $a['samples']));

    $withData = array_values(array_filter($bands, fn($b) => $b['samples'] > 0));
    $hot = count(array_filter($bands, fn($b) => $b['status'] === 'hot'));
    $topShare = 0.0;
    foreach ($bands as $b) $topShare = max($topShare, (float)$b['shareOfPosts']);
    $unbalanced = $topShare >= 0.55 && $postedN >= 3;
    $scoredAvg = $withData ? array_sum(array_column($withData, 'score')) / count($withData) : 0.0;
    $labScore = (int)round($scoredAvg);
    if (count($withData) >= 3) $labScore = min(100, $labScore + 8);
    elseif (count($withData) === 1 && $postedN >= 3) $labScore = max(0, $labScore - 10);
    if ($unbalanced) $labScore = max(0, $labScore - 8);
    $labScore = max(0, min(100, $labScore));
    $grade = count($withData) === 0 ? 'D' : ($labScore >= 75 ? 'A' : ($labScore >= 58 ? 'B' : ($labScore >= 40 ? 'C' : 'D')));

    $best = null;
    foreach ($withData as $b) {
        if ($b['status'] === 'hot') { $best = $b; break; }
    }
    if (!$best && $withData) $best = $withData[0];
    $cold = array_values(array_filter($withData, fn($b) => $b['status'] === 'cold'));

    if ($postedN === 0) {
        $mixTip = 'ยังไม่มีเมตริกรายสไตล์แฮชแท็ก — โพสต์มือแล้วกรอกผลที่ /results ก่อนจัดมิกซ์';
        $summary = 'Hashtag Fit Lab: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลหลังโพสต์มือก่อนจัดอันดับมิกซ์แท็ก';
    } else {
        $summary = 'Hashtag Fit Lab: ' . $postedN . ' โพสต์มีเมตริก · สไตล์ที่มีข้อมูล ' . count($withData) . ' · ร้อน ' . $hot . ($unbalanced ? ' · มิกซ์เอนข้างเดียว' : '');
        if ($unbalanced && $best) $mixTip = 'มิกซ์เอนไปสไตล์ ' . $best['bandLabel'] . ' มาก — วันถัดไปลองสลับชุดแท็ก 1 ชิ้น (ทดลอง)';
        elseif ($best) $mixTip = 'สไตล์แฮชแท็กเด่น: ' . $best['bandLabel'] . ' — ใช้เป็นสมมติฐาน ไม่ล็อคทุกโพสต์';
        else $mixTip = 'เก็บผลต่ออีก 2–3 โพสต์ข้ามสไตล์แฮชแท็กก่อนจัดอันดับมิกซ์';
    }

    $preferred = null;
    foreach ($bands as $b) {
        if ($b['status'] === 'hot') { $preferred = $b; break; }
    }
    if (!$preferred) {
        foreach ($bands as $b) {
            if ($b['status'] === 'steady' && $b['samples'] > 0) { $preferred = $b; break; }
        }
    }

    $stmt = db()->prepare("SELECT s.*, p.name AS product_name FROM schedule s LEFT JOIN products p ON p.id=s.product_id WHERE s.post_date=? AND s.status IN ('draft','approved') ORDER BY s.suggested_time");
    $stmt->execute([$date]);
    $todaySlots = $stmt->fetchAll() ?: [];
    $suggestions = [];
    foreach (array_slice($todaySlots, 0, 6) as $slot) {
        if (!$preferred) break;
        $packId = (string)($slot['content_pack_id'] ?? '');
        if ($packId !== '' && !isset($packCache[$packId])) {
            $pstmt = db()->prepare('SELECT * FROM content_packs WHERE id=?');
            $pstmt->execute([$packId]);
            $prow = $pstmt->fetch();
            $packCache[$packId] = $prow ? [
                'hashtagsTh' => decode_list($prow['hashtags_th'] ?? '[]'),
                'hashtagsEn' => decode_list($prow['hashtags_en'] ?? '[]'),
            ] : ['hashtagsTh' => [], 'hashtagsEn' => []];
        }
        $pack = $packCache[$packId] ?? ['hashtagsTh' => [], 'hashtagsEn' => []];
        $lists = resolve_hashtag_lists($pack, (string)($slot['caption_preview'] ?? ''));
        $currentKey = hashtag_style_of([
            'caption_preview' => (string)($slot['caption_preview'] ?? ''),
            'content_pack_id' => $packId,
        ], $pack);
        $currentRow = null;
        foreach ($bands as $b) {
            if ($b['band'] === $currentKey) { $currentRow = $b; break; }
        }
        $same = $currentKey === $preferred['band'];
        $preview = implode(' ', array_slice($lists['all'], 0, 5));
        $currentCold = $currentRow && (
            $currentRow['status'] === 'cold'
            || ($currentRow['status'] === 'no_data' && $preferred['status'] === 'hot')
            || $currentKey === 'sparse'
            || $currentKey === 'generic'
        );
        if ($currentCold && !$same) {
            $suggestions[] = [
                'scheduleId' => $slot['id'],
                'productId' => $slot['product_id'],
                'productName' => $slot['product_name'] ?? $slot['product_id'],
                'currentBand' => $currentKey,
                'currentLabel' => hashtag_band_label($currentKey),
                'suggestedBand' => $preferred['band'],
                'suggestedLabel' => $preferred['bandLabel'],
                'tagPreview' => $preview !== '' ? $preview : '(ไม่มีแท็ก)',
                'tagCount' => count($lists['all']),
                'status' => $slot['status'],
                'channelLabel' => channel_label((string)$slot['channel']),
                'reason' => hashtag_band_label($currentKey) . ' เย็น · ' . $preferred['bandLabel'] . ' ดูดีกว่าในหน้าต่างนี้ (ทดลอง)',
                'tip' => 'ไม่สลับแฮชแท็กอัตโนมัติ — regenerate แคปชันหรือแก้แท็กมือ แล้ว Approve ก่อนโพสต์',
            ];
        } elseif ($unbalanced && $same && $cold && count($suggestions) < 2) {
            $alt = null;
            foreach ($bands as $b) {
                if ($b['band'] !== $currentKey && $b['band'] !== 'generic' && $b['band'] !== 'sparse' && in_array($b['status'], ['steady', 'no_data'], true)) {
                    $alt = $b;
                    break;
                }
            }
            if (!$alt) $alt = $cold[0];
            $suggestions[] = [
                'scheduleId' => $slot['id'],
                'productId' => $slot['product_id'],
                'productName' => $slot['product_name'] ?? $slot['product_id'],
                'currentBand' => $currentKey,
                'currentLabel' => hashtag_band_label($currentKey),
                'suggestedBand' => $alt['band'],
                'suggestedLabel' => $alt['bandLabel'],
                'tagPreview' => $preview !== '' ? $preview : '(ไม่มีแท็ก)',
                'tagCount' => count($lists['all']),
                'status' => $slot['status'],
                'channelLabel' => channel_label((string)$slot['channel']),
                'reason' => 'วันนี้ซ้อนสไตล์ ' . hashtag_band_label($currentKey) . ' — ลองกระจายไป ' . $alt['bandLabel'] . ' เพื่อลดความซ้ำ (ทดลอง)',
                'tip' => 'ระบบไม่เปลี่ยนแท็กเอง — regenerate draft แล้ว Approve ใหม่',
            ];
        }
    }

    $actions = [];
    if ($postedN === 0) {
        $actions[] = [
            'id' => 'need-metrics',
            'title' => 'เริ่มเก็บผลรายสไตล์แฮชแท็ก',
            'detail' => 'Approve → โพสต์มือ → กรอก views/clicks/orders ที่ /results อย่างน้อย 1 ชิ้นต่อมิกซ์แท็ก',
        ];
    }
    if ($best && $best['status'] === 'hot') {
        $actions[] = [
            'id' => 'lean-tags',
            'title' => 'เอียงทดลองไปสไตล์ ' . $best['bandLabel'],
            'detail' => 'n=' . $best['samples'] . ' · คะแนนฟิต ~' . $best['score'] . ' — ใช้ 1–2 สล็อต · ' . hashtag_style_hint($best['band']),
        ];
    }
    if ($unbalanced) {
        $actions[] = [
            'id' => 'diversify',
            'title' => 'กระจายมิกซ์สไตล์แฮชแท็ก',
            'detail' => 'สไตล์เด่นกินสัดส่วนสูง — เพิ่ม draft คนละมิกซ์แท็ก 1 ชิ้นในรอบถัดไป (กันสแปมฟีล)',
        ];
    }
    if ($cold) {
        $actions[] = [
            'id' => 'review-cold',
            'title' => 'ทบทวนสไตล์เย็น: ' . implode(', ', array_map(fn($b) => $b['bandLabel'], $cold)),
            'detail' => 'ปรับชุดแท็ก / regenerate หรือพักมิกซ์นั้นชั่วคราว — อย่าโพสต์ซ้ำชุดแท็กเดิมยาว ๆ',
        ];
    }
    $missing = [];
    foreach ($order as $b) {
        if ($b === 'generic' || $b === 'sparse') continue;
        if (count($byBand[$b]) === 0) $missing[] = $b;
    }
    if ($missing && $postedN > 0) {
        $actions[] = [
            'id' => 'fill-styles',
            'title' => 'ทดลองสไตล์ที่ยังไม่มีข้อมูล (' . count($missing) . ')',
            'detail' => 'ยังไม่มี: ' . implode(' · ', array_map('hashtag_band_label', $missing)) . ' — draft 1 ชิ้นต่อสไตล์แล้ววัดผล',
        ];
    }
    $actions[] = [
        'id' => 'compliance',
        'title' => 'คงกฎ Approve + disclosure',
        'detail' => 'ทุกมิกซ์แฮชแท็กควรมี #AffiliateDisclosure หรือข้อความ affiliate และผ่าน Approve ก่อนโพสต์มือ — ระบบไม่โพสต์อัตโนมัติ',
    ];
    $actions = array_slice($actions, 0, 5);

    $checklist = [
        'อันดับสไตล์แฮชแท็กมาจากเมตริกที่คุณกรอกเอง — ไม่ดึง API แพลตฟอร์ม',
        'คะแนนฟิตเป็นสมมติฐานทดลอง ไม่การันตียอดขาย/ค่าคอม',
        'คำแนะนำสลับมิกซ์เป็นคำแนะนำเท่านั้น — ต้องแก้เอง + Approve',
        'อย่าถล่มแท็กชุดเดียวซ้ำ ๆ ในวันเดียวกัน (กันสแปม)',
        'ทุกโพสต์ต้องมี disclosure และไม่ใช้คำโฆษณาเกินจริง',
    ];

    $lines = [
        "Hashtag Fit Lab {$date}: เกรด {$grade} ({$labScore}/100) · {$summary}",
        $mixTip,
    ];
    foreach (array_slice($withData, 0, 3) as $b) {
        $lines[] = $statusLabel[$b['status']] . ' · ' . $b['bandLabel'] . ': คะแนน ' . $b['score'] . ' (' . $confLabel[$b['confidence']] . ', n=' . $b['samples'] . ', CTR ~' . round($b['avgCtr'] * 100, 1) . '%, แท็ก avg ~' . $b['avgTagCount'] . ')';
    }
    foreach (array_slice($suggestions, 0, 2) as $s) {
        $lines[] = 'แนะนำทดลอง · ' . $s['productName'] . ': ' . $s['currentLabel'] . ' → ' . $s['suggestedLabel'];
    }
    $lines[] = INCOME_DISCLAIMER;

    return [
        'date' => $date,
        'fromDate' => $from,
        'windowDays' => $window,
        'grade' => $grade,
        'score' => $labScore,
        'summary' => $summary,
        'counts' => [
            'postsWithMetrics' => $postedN,
            'bandsWithData' => count($withData),
            'unbalanced' => $unbalanced,
            'suggestions' => count($suggestions),
            'hot' => $hot,
        ],
        'bands' => $bands,
        'mixTip' => $mixTip,
        'suggestions' => array_slice($suggestions, 0, 5),
        'actions' => $actions,
        'checklist' => $checklist,
        'lines' => $lines,
        'disclaimer' => INCOME_DISCLAIMER,
    ];
}

function hashtag_fit_lab_to_markdown(array $lab): string
{
    $bandRows = [];
    foreach ($lab['bands'] as $b) {
        if (($b['samples'] ?? 0) <= 0) continue;
        $statusLabel = ['hot' => 'ร้อน', 'steady' => 'นิ่ง', 'cold' => 'เย็น', 'no_data' => 'ยังไม่มีข้อมูล'][$b['status']] ?? $b['status'];
        $confLabel = ['thin' => 'ข้อมูลบาง', 'ok' => 'พอใช้', 'solid' => 'หนาขึ้น'][$b['confidence']] ?? $b['confidence'];
        $n = count($bandRows) + 1;
        $bandRows[] = "{$n}. **[{$statusLabel}]** {$b['bandLabel']} ({$b['rangeLabel']}) · คะแนน {$b['score']}/100 · n={$b['samples']} · {$confLabel}\n"
            . "   แท็ก avg ~{$b['avgTagCount']} · CTR ~" . round($b['avgCtr'] * 100, 1) . "% · ออเดอร์/คลิก ~{$b['avgOrdersPerClick']} · ค่าคอมเฉลี่ย ฿{$b['avgCommission']}\n"
            . '   สัดส่วนในหน้าต่าง ~' . round($b['shareOfPosts'] * 100) . "%\n"
            . "   {$b['tip']}";
    }
    if (!$bandRows) $bandRows[] = '_(ยังไม่มีข้อมูล)_';

    $suggestionRows = [];
    foreach ($lab['suggestions'] as $i => $s) {
        $n = $i + 1;
        $suggestionRows[] = "{$n}. {$s['productName']} · {$s['status']} · {$s['channelLabel']} · {$s['tagCount']} แท็ก\n"
            . "   preview: {$s['tagPreview']}\n"
            . "   {$s['currentLabel']} → **{$s['suggestedLabel']}**\n"
            . "   {$s['reason']}\n"
            . "   {$s['tip']}";
    }
    if (!$suggestionRows) $suggestionRows[] = '_(ไม่มีคำแนะนำสลับสไตล์แฮชแท็กวันนี้)_';

    $actionLines = [];
    foreach ($lab['actions'] as $a) {
        $actionLines[] = "- **{$a['title']}**: {$a['detail']}";
    }
    $checkLines = array_map(fn($c) => "- {$c}", $lab['checklist']);

    return "# Hashtag Fit Lab · {$lab['date']}\n\n"
        . $lab['summary'] . "\n\n"
        . "- เกรดแล็บ: {$lab['grade']} ({$lab['score']}/100)\n"
        . "- หน้าต่าง: {$lab['fromDate']} → {$lab['date']} ({$lab['windowDays']} วัน)\n"
        . "- โพสต์มีเมตริก: {$lab['counts']['postsWithMetrics']}\n"
        . "- สไตล์ที่มีข้อมูล: {$lab['counts']['bandsWithData']}\n"
        . "- ช่วงร้อน: {$lab['counts']['hot']}\n"
        . '- มิกซ์เอนข้างเดียว: ' . (!empty($lab['counts']['unbalanced']) ? 'ใช่' : 'ไม่') . "\n\n"
        . "## มิกซ์ทิป\n"
        . $lab['mixTip'] . "\n\n"
        . "## อันดับสไตล์แฮชแท็ก (ทดลอง)\n"
        . implode("\n", $bandRows) . "\n\n"
        . "## คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)\n"
        . implode("\n", $suggestionRows) . "\n\n"
        . "## Actions\n"
        . implode("\n", $actionLines) . "\n\n"
        . "## Checklist\n"
        . implode("\n", $checkLines) . "\n\n"
        . $lab['disclaimer'] . "\n";
}


function tone_style_order(): array
{
    return ['helper', 'story', 'compare', 'flat', 'hard_push'];
}

function tone_style_label(string $band): string
{
    return [
        'helper' => 'ช่วยเลือกของ · อ่อนโยน',
        'story' => 'เล่าประสบการณ์จริง',
        'compare' => 'เทียบเลือกเงียบ ๆ',
        'flat' => 'กลาง ๆ / ไม่ชัด',
        'hard_push' => 'เร่งซื้อ / แข็งเกินไป',
    ][$band] ?? $band;
}

function tone_style_range(string $band): string
{
    return [
        'helper' => 'เคยเจอไหม · ลองดู · ค่อยตัดสินใจ · ช่วยเรื่อง',
        'story' => 'เล่าจากมุมคนใช้ · จุดที่ชอบ · สั้น ๆ ตรง ๆ',
        'compare' => 'เทียบของเดิม · ตัวเลือก · ราคาประมาณ',
        'flat' => 'ไม่มีสัญญาณ helper/story/compare ที่ชัด',
        'hard_push' => 'กดเลย · สั่งด่วน · การันตี · !!!',
    ][$band] ?? '';
}

function tone_style_hint(string $band): string
{
    return [
        'helper' => 'น้ำเสียงเพื่อนช่วยเลือก — เปิดด้วยปัญหาสั้น ๆ แล้วชวนดูรายละเอียด ไม่เร่งซื้อ',
        'story' => 'เล่า 1 สถานการณ์ใช้งานจริง + จุดที่ชอบ 1 ข้อ แล้วปิดด้วยลิงก์+disclosure',
        'compare' => 'ให้เทียบกับของเดิม 1 จุด (สเปก/ราคา) แล้วเปิดดูต่อเอง',
        'flat' => 'ใส่ hook ช่วยเลือกหรือมุมเล่าประสบการณ์ให้ชัดขึ้นก่อน Approve',
        'hard_push' => 'ตัดคำเร่งซื้อ/เกินจริง — ใช้โทนช่วยเลือก + disclosure แล้ว regenerate',
    ][$band] ?? '';
}

function resolve_tone_text(?array $pack, string $captionPreview = '', int $hookIndex = 0): string
{
    $parts = [];
    $cap = trim($captionPreview);
    if ($cap !== '') $parts[] = $cap;
    if ($pack) {
        $hooks = $pack['hooks'] ?? [];
        if (!is_array($hooks)) $hooks = [];
        $hook = trim((string)($hooks[$hookIndex] ?? $hooks[0] ?? ''));
        if ($hook !== '') $parts[] = $hook;
        foreach (['facebookCaption', 'facebookGroupCaption', 'reelsCaption'] as $k) {
            $v = trim((string)($pack[$k] ?? ''));
            if ($v !== '') $parts[] = $v;
        }
        $angles = $pack['sellingAngles'] ?? [];
        if (is_array($angles) && $angles) {
            $parts[] = implode(' ', array_slice($angles, 0, 2));
        }
        $scenes = $pack['tiktokScript']['scenes'] ?? [];
        if (is_array($scenes)) {
            $lines = [];
            foreach ($scenes as $s) {
                $line = trim((string)($s['line'] ?? ''));
                if ($line !== '') $lines[] = $line;
            }
            if ($lines) $parts[] = implode(' ', $lines);
        }
    }
    return implode("\n", $parts);
}

function classify_tone_style(string $raw): string
{
    $text = trim($raw);
    if ($text === '') return 'flat';
    if (preg_match('/(?<!ไม่)การันตี|(?<!ไม่)รับประกัน|กดเลย|สั่งด่วน|(?<!ไม่)ต้องซื้อ|รีบซื้อ|หมดแล้วหมดเลย|โอกาสสุดท้าย|รวยแน่|รวยแน่นอน|ขายดีที่สุด|(?<!ไม่)ที่ดีที่สุด|!!!+|ฟรี!!!|ถูกที่สุดในโลก/u', $text)) {
        return 'hard_push';
    }
    $helper = (bool)preg_match('/เคยเจอไหม|ลองดู|ลองฟัง|ช่วยเรื่อง|ถ้ากำลังหา|ค่อยตัดสินใจ|สนใจดูรายละเอียด|เปิดดูรายละเอียด|ไม่เร่งซื้อ|ช้อปอย่างมีเหตุผล|ช่วยเลือก/u', $text);
    $story = (bool)preg_match('/เล่าจากมุม|คนใช้จริง|จุดที่ชอบ|สั้น ๆ ตรง ๆ|สถานการณ์|ใช้งานจริง|มุมเพื่อน|โชว์ของจริง|จากประสบการณ์/u', $text);
    $compare = (bool)preg_match('/เทียบ|ของเดิม|ตัวเลือก|ราคาประมาณ|เปิดดูสเปก|อ่านรีวิว|เทียบกับ|หมวด/u', $text);
    if ($helper && ($story || $compare || mb_strlen($text) >= 40)) return 'helper';
    if ($helper) return 'helper';
    if ($story && !$compare) return 'story';
    if ($compare) return 'compare';
    if ($story) return 'story';
    return 'flat';
}

function tone_style_of(array $post, ?array $pack = null): string
{
    $text = resolve_tone_text(
        $pack,
        (string)($post['caption_preview'] ?? $post['captionPreview'] ?? ''),
        (int)($post['hook_index'] ?? $post['hookIndex'] ?? 0)
    );
    return classify_tone_style($text);
}

function build_tone_fit_lab(?string $date = null, int $windowDays = 14): array
{
    $date = $date ?: today_iso();
    $window = max(7, min(30, $windowDays));
    $from = date('Y-m-d', strtotime($date . ' -' . ($window - 1) . ' days'));
    $order = tone_style_order();
    $statusLabel = ['hot' => 'ร้อน', 'steady' => 'นิ่ง', 'cold' => 'เย็น', 'no_data' => 'ยังไม่มีข้อมูล'];
    $confLabel = ['thin' => 'ข้อมูลบาง', 'ok' => 'พอใช้', 'solid' => 'หนาขึ้น'];

    $products = all_products();
    $byId = [];
    foreach ($products as $p) $byId[$p['id']] = $p;

    $stmt = db()->prepare("SELECT * FROM schedule WHERE status='posted' AND metrics_at IS NOT NULL AND post_date BETWEEN ? AND ?");
    $stmt->execute([$from, $date]);
    $posted = $stmt->fetchAll() ?: [];

    $byBand = [];
    foreach ($order as $b) $byBand[$b] = [];
    $allComm = [];
    $packCache = [];
    foreach ($posted as $row) {
        $packId = (string)($row['content_pack_id'] ?? '');
        if ($packId !== '' && !isset($packCache[$packId])) {
            $pstmt = db()->prepare('SELECT * FROM content_packs WHERE id=?');
            $pstmt->execute([$packId]);
            $prow = $pstmt->fetch();
            if ($prow) {
                $script = json_decode((string)($prow['tiktok_script'] ?? '{}'), true) ?: [];
                $packCache[$packId] = [
                    'hooks' => decode_list($prow['hooks'] ?? '[]'),
                    'facebookCaption' => (string)($prow['facebook_caption'] ?? ''),
                    'facebookGroupCaption' => (string)($prow['facebook_group_caption'] ?? ''),
                    'reelsCaption' => (string)($prow['reels_caption'] ?? ''),
                    'sellingAngles' => decode_list($prow['selling_angles'] ?? '[]'),
                    'tiktokScript' => is_array($script) ? $script : [],
                ];
            } else {
                $packCache[$packId] = null;
            }
        }
        $pack = $packCache[$packId] ?? null;
        if (!$pack) {
            $lp = latest_pack((string)$row['product_id']);
            $pack = $lp ? [
                'hooks' => $lp['hooks'] ?? [],
                'facebookCaption' => (string)($lp['facebookCaption'] ?? ''),
                'facebookGroupCaption' => (string)($lp['facebookGroupCaption'] ?? ''),
                'reelsCaption' => (string)($lp['reelsCaption'] ?? ''),
                'sellingAngles' => $lp['sellingAngles'] ?? [],
                'tiktokScript' => $lp['tiktokScript'] ?? [],
            ] : [];
        }
        $key = tone_style_of([
            'caption_preview' => (string)($row['caption_preview'] ?? ''),
            'hook_index' => (int)($row['hook_index'] ?? 0),
            'content_pack_id' => $packId,
        ], $pack);
        $byBand[$key][] = $row;
        $allComm[] = (float)($row['commission_earned'] ?? 0);
    }

    $postedN = count($posted);
    $globalAvgCommission = $postedN > 0 ? array_sum($allComm) / $postedN : 0.0;

    $bands = [];
    foreach ($order as $band) {
        $list = $byBand[$band] ?? [];
        $samples = count($list);
        $views = array_map(fn($p) => (float)($p['views'] ?? 0), $list);
        $clicks = array_map(fn($p) => (float)($p['clicks'] ?? 0), $list);
        $orders = array_map(fn($p) => (float)($p['orders_count'] ?? 0), $list);
        $comms = array_map(fn($p) => (float)($p['commission_earned'] ?? 0), $list);
        $avgViews = $samples ? array_sum($views) / $samples : 0;
        $avgClicks = $samples ? array_sum($clicks) / $samples : 0;
        $avgOrders = $samples ? array_sum($orders) / $samples : 0;
        $avgCommission = $samples ? array_sum($comms) / $samples : 0;
        $totalViews = array_sum($views);
        $totalClicks = array_sum($clicks);
        $totalOrders = array_sum($orders);
        $avgCtr = $totalViews > 0 ? $totalClicks / $totalViews : 0;
        $avgOrdersPerClick = $totalClicks > 0 ? $totalOrders / $totalClicks : 0;
        $share = $postedN > 0 ? $samples / $postedN : 0;

        $score = 0;
        if ($samples > 0) {
            $commBase = $globalAvgCommission > 0
                ? max(0, min(70, ($avgCommission / $globalAvgCommission) * 50))
                : max(0, min(50, $avgCommission * 2));
            $score = $commBase + max(0, min(22, $avgCtr * 220)) + max(0, min(15, $avgOrdersPerClick * 100)) + max(0, min(15, $avgOrders * 8));
            if ($band === 'helper') $score += 5;
            elseif ($band === 'story') $score += 4;
            elseif ($band === 'compare') $score += 3;
            elseif ($band === 'flat') $score -= 4;
            elseif ($band === 'hard_push') $score -= 10;
            if ($share >= 0.7 && $samples >= 3) $score -= 12;
            elseif ($share >= 0.55 && $samples >= 2) $score -= 6;
            if ($samples === 1) $score *= 0.75;
            $score = (int)round(max(0, min(100, $score)));
        }

        $confidence = $samples >= 4 ? 'solid' : ($samples >= 2 ? 'ok' : 'thin');
        $status = $samples === 0 ? 'no_data' : ($score >= 65 && $samples >= 2 ? 'hot' : ($score >= 45 ? 'steady' : 'cold'));
        $row = [
            'band' => $band,
            'bandLabel' => tone_style_label($band),
            'rangeLabel' => tone_style_range($band),
            'samples' => $samples,
            'avgViews' => round($avgViews, 1),
            'avgClicks' => round($avgClicks, 1),
            'avgOrders' => round($avgOrders, 2),
            'avgCommission' => round($avgCommission, 1),
            'avgCtr' => round($avgCtr, 2),
            'avgOrdersPerClick' => round($avgOrdersPerClick, 2),
            'score' => $score,
            'status' => $status,
            'confidence' => $confidence,
            'shareOfPosts' => round($share, 2),
            'tip' => '',
        ];
        if ($samples === 0) {
            $row['tip'] = 'ยังไม่มีผลโทนนี้ — ลอง draft 1 ชิ้นแนว “' . tone_style_hint($band) . '” แล้วกรอกเมตริก';
        } elseif ($band === 'hard_push') {
            $row['tip'] = 'โทนแข็ง/เร่งซื้อ — ลดการใช้ และ regenerate เป็นช่วยเลือกก่อน Approve';
        } elseif ($status === 'hot') {
            $row['tip'] = 'โทนนี้ดูเวิร์กกว่าในหน้าต่างนี้ (ทดลอง) — ใช้ต่อได้ แต่สลับมุม/สินค้าเพื่อไม่ให้ซ้ำ';
        } elseif ($status === 'cold') {
            $row['tip'] = 'ผลเย็นในโทนนี้ — ลองปรับน้ำเสียงหรือ regenerate แคปชันก่อนโพสต์ซ้ำ';
        } elseif ($share >= 0.55) {
            $row['tip'] = 'ใช้โทนนี้บ่อย (' . round($share * 100) . '%) — กระจาย helper/story/compare เพื่อลดความซ้ำ';
        } else {
            $row['tip'] = 'เก็บข้อมูลต่ออีก 1–2 โพสต์ในโทนนี้ก่อนสรุป — ตัวเลขยังเป็นสมมติฐาน';
        }
        $bands[] = $row;
    }
    usort($bands, fn($a, $b) => ($b['score'] <=> $a['score']) ?: ($b['samples'] <=> $a['samples']));

    $withData = array_values(array_filter($bands, fn($b) => $b['samples'] > 0));
    $hot = count(array_filter($bands, fn($b) => $b['status'] === 'hot'));
    $hardPushSamples = count($byBand['hard_push'] ?? []);
    $topShare = 0.0;
    foreach ($bands as $b) $topShare = max($topShare, (float)$b['shareOfPosts']);
    $unbalanced = $topShare >= 0.55 && $postedN >= 3;

    $scoredAvg = $withData ? array_sum(array_column($withData, 'score')) / count($withData) : 0;
    $labScore = (int)round($scoredAvg);
    if (count($withData) >= 3) $labScore = min(100, $labScore + 8);
    elseif (count($withData) === 1 && $postedN >= 3) $labScore = max(0, $labScore - 10);
    if ($unbalanced) $labScore = max(0, $labScore - 8);
    if ($hardPushSamples > 0) $labScore = max(0, $labScore - 6);
    $labScore = max(0, min(100, $labScore));
    $grade = count($withData) === 0 ? 'D' : ($labScore >= 75 ? 'A' : ($labScore >= 58 ? 'B' : ($labScore >= 40 ? 'C' : 'D')));

    $best = null;
    foreach ($withData as $b) {
        if ($b['status'] === 'hot' && $b['band'] !== 'hard_push') { $best = $b; break; }
    }
    if (!$best) {
        foreach ($withData as $b) {
            if ($b['band'] !== 'hard_push') { $best = $b; break; }
        }
    }
    if (!$best && $withData) $best = $withData[0];

    if ($postedN === 0) {
        $mixTip = 'ยังไม่มีเมตริกรายโทน — โพสต์มือแล้วกรอกผลที่ Results ก่อนจัดมิกซ์น้ำเสียง';
        $summary = 'Tone Fit Lab: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลหลังโพสต์มือก่อนจัดอันดับโทนน้ำเสียง';
    } elseif ($hardPushSamples > 0) {
        $mixTip = "พบโทน hard_push {$hardPushSamples} ชิ้น — ลดคำเร่งซื้อ แล้วเอียงไป helper/story (ทดลอง)";
        $summary = "Tone Fit Lab: {$postedN} โพสต์มีเมตริก · โทนที่มีข้อมูล " . count($withData) . " · ร้อน {$hot} · hard_push {$hardPushSamples}" . ($unbalanced ? ' · มิกซ์เอนข้างเดียว' : '');
    } elseif ($unbalanced && $best) {
        $mixTip = 'มิกซ์เอนไปโทน ' . $best['bandLabel'] . ' มาก — วันถัดไปลองสลับน้ำเสียง 1 ชิ้น (ทดลอง)';
        $summary = "Tone Fit Lab: {$postedN} โพสต์มีเมตริก · โทนที่มีข้อมูล " . count($withData) . " · ร้อน {$hot} · มิกซ์เอนข้างเดียว";
    } elseif ($best) {
        $mixTip = 'โทนเด่น: ' . $best['bandLabel'] . ' — ใช้เป็นสมมติฐาน ไม่ล็อคทุกโพสต์';
        $summary = "Tone Fit Lab: {$postedN} โพสต์มีเมตริก · โทนที่มีข้อมูล " . count($withData) . " · ร้อน {$hot}";
    } else {
        $mixTip = 'เก็บผลต่ออีก 2–3 โพสต์ข้ามโทนก่อนจัดอันดับมิกซ์';
        $summary = "Tone Fit Lab: {$postedN} โพสต์มีเมตริก · โทนที่มีข้อมูล " . count($withData) . " · ร้อน {$hot}";
    }

    $stmt = db()->prepare("SELECT * FROM schedule WHERE post_date=? AND status IN ('draft','approved') ORDER BY suggested_time");
    $stmt->execute([$date]);
    $todaySlots = $stmt->fetchAll() ?: [];

    $preferred = null;
    foreach ($bands as $b) {
        if ($b['status'] === 'hot' && $b['band'] !== 'hard_push') { $preferred = $b; break; }
    }
    if (!$preferred) {
        foreach ($bands as $b) {
            if ($b['status'] === 'steady' && $b['samples'] > 0 && $b['band'] !== 'hard_push' && $b['band'] !== 'flat') {
                $preferred = $b; break;
            }
        }
    }
    if (!$preferred) {
        foreach ($bands as $b) {
            if ($b['band'] === 'helper') { $preferred = $b; break; }
        }
    }

    $suggestions = [];
    foreach (array_slice($todaySlots, 0, 6) as $slot) {
        $product = $byId[$slot['product_id']] ?? null;
        if (!$product || !$preferred) continue;
        $packId = (string)($slot['content_pack_id'] ?? '');
        $pack = $packCache[$packId] ?? null;
        if (!$pack) {
            $lp = latest_pack((string)$slot['product_id']);
            $pack = $lp ?: [];
        }
        $currentKey = tone_style_of([
            'caption_preview' => (string)($slot['caption_preview'] ?? ''),
            'hook_index' => (int)($slot['hook_index'] ?? 0),
        ], $pack);
        $currentRow = null;
        foreach ($bands as $b) if ($b['band'] === $currentKey) { $currentRow = $b; break; }
        $same = $currentKey === $preferred['band'];
        $preview = mb_substr((string)($slot['caption_preview'] ?? ''), 0, 80);
        $currentCold = $currentKey === 'hard_push' || $currentKey === 'flat'
            || ($currentRow && ($currentRow['status'] === 'cold' || ($currentRow['status'] === 'no_data' && $preferred['status'] === 'hot')));
        if ($currentCold && !$same) {
            $suggestions[] = [
                'scheduleId' => $slot['id'],
                'productId' => $product['id'],
                'productName' => $product['name'],
                'currentBand' => $currentKey,
                'currentLabel' => tone_style_label($currentKey),
                'suggestedBand' => $preferred['band'],
                'suggestedLabel' => $preferred['bandLabel'],
                'captionPreview' => $preview !== '' ? $preview : '(ไม่มีแคปชัน)',
                'status' => $slot['status'],
                'channelLabel' => channel_label($slot['channel']),
                'reason' => tone_style_label($currentKey) . ' เย็น/เสี่ยง · ' . $preferred['bandLabel'] . ' ดูดีกว่าในหน้าต่างนี้ (ทดลอง)',
                'tip' => 'ไม่แก้แคปชันอัตโนมัติ — regenerate หรือแก้มือ แล้ว Approve ก่อนโพสต์',
            ];
        }
    }

    $actions = [];
    if ($postedN === 0) {
        $actions[] = ['id' => 'need-metrics', 'title' => 'เริ่มเก็บผลรายโทนน้ำเสียง', 'detail' => 'Approve → โพสต์มือ → กรอก views/clicks/orders ที่ Results อย่างน้อย 1 ชิ้นต่อโทน'];
    }
    if ($hardPushSamples > 0) {
        $actions[] = ['id' => 'drop-hard', 'title' => 'ลดโทน hard_push', 'detail' => "พบ {$hardPushSamples} โพสต์โทนเร่งซื้อ — regenerate เป็นช่วยเลือก + ตรวจ compliance ก่อน Approve"];
    }
    if ($best && $best['status'] === 'hot' && $best['band'] !== 'hard_push') {
        $actions[] = ['id' => 'lean-tone', 'title' => 'เอียงทดลองไปโทน ' . $best['bandLabel'], 'detail' => 'n=' . $best['samples'] . ' · คะแนนฟิต ~' . $best['score'] . ' — ใช้ 1–2 สล็อต · ' . tone_style_hint($best['band'])];
    }
    if ($unbalanced) {
        $actions[] = ['id' => 'diversify', 'title' => 'กระจายมิกซ์โทนน้ำเสียง', 'detail' => 'โทนเด่นกินสัดส่วนสูง — เพิ่ม draft คนละโทน 1 ชิ้นในรอบถัดไป (กันสแปมฟีล)'];
    }
    $actions[] = ['id' => 'compliance', 'title' => 'คงกฎ Approve + disclosure + ไม่ขายแข็ง', 'detail' => 'ทุกแคปชันต้องมี disclosure affiliate และผ่าน Approve ก่อนโพสต์มือ — ระบบไม่โพสต์อัตโนมัติ'];
    $actions = array_slice($actions, 0, 5);

    $checklist = [
        'อันดับโทนมาจากเมตริกที่คุณกรอกเอง — ไม่ดึง API แพลตฟอร์ม',
        'คะแนนฟิตเป็นสมมติฐานทดลอง ไม่การันตียอดขาย/ค่าคอม',
        'คำแนะนำสลับโทนเป็นคำแนะนำเท่านั้น — ต้องแก้เอง + Approve',
        'หลีกเลี่ยงโทน hard_push และคำโฆษณาเกินจริง',
        'ทุกโพสต์ต้องมี disclosure และน้ำเสียงช่วยเลือกของ',
    ];

    $lines = [
        "Tone Fit Lab {$date}: เกรด {$grade} ({$labScore}/100) · {$summary}",
        $mixTip,
    ];
    foreach (array_slice($withData, 0, 3) as $b) {
        $lines[] = $statusLabel[$b['status']] . ' · ' . $b['bandLabel'] . ': คะแนน ' . $b['score'] . ' (' . $confLabel[$b['confidence']] . ', n=' . $b['samples'] . ', CTR ~' . round($b['avgCtr'] * 100, 1) . '%)';
    }
    foreach (array_slice($suggestions, 0, 2) as $s) {
        $lines[] = 'แนะนำทดลอง · ' . $s['productName'] . ': ' . $s['currentLabel'] . ' → ' . $s['suggestedLabel'];
    }
    $lines[] = INCOME_DISCLAIMER;

    return [
        'date' => $date,
        'fromDate' => $from,
        'windowDays' => $window,
        'grade' => $grade,
        'score' => $labScore,
        'summary' => $summary,
        'counts' => [
            'postsWithMetrics' => $postedN,
            'bandsWithData' => count($withData),
            'unbalanced' => $unbalanced,
            'suggestions' => count($suggestions),
            'hot' => $hot,
            'hardPushSamples' => $hardPushSamples,
        ],
        'bands' => $bands,
        'mixTip' => $mixTip,
        'suggestions' => array_slice($suggestions, 0, 5),
        'actions' => $actions,
        'checklist' => $checklist,
        'lines' => $lines,
        'disclaimer' => INCOME_DISCLAIMER,
    ];
}

function tone_fit_lab_to_markdown(array $lab): string
{
    $bandRows = [];
    foreach ($lab['bands'] as $b) {
        if (($b['samples'] ?? 0) <= 0) continue;
        $statusLabel = ['hot' => 'ร้อน', 'steady' => 'นิ่ง', 'cold' => 'เย็น', 'no_data' => 'ยังไม่มีข้อมูล'][$b['status']] ?? $b['status'];
        $confLabel = ['thin' => 'ข้อมูลบาง', 'ok' => 'พอใช้', 'solid' => 'หนาขึ้น'][$b['confidence']] ?? $b['confidence'];
        $n = count($bandRows) + 1;
        $bandRows[] = "{$n}. **[{$statusLabel}]** {$b['bandLabel']} ({$b['rangeLabel']}) · คะแนน {$b['score']}/100 · n={$b['samples']} · {$confLabel}\n"
            . "   CTR ~" . round($b['avgCtr'] * 100, 1) . "% · ออเดอร์/คลิก ~{$b['avgOrdersPerClick']} · ค่าคอมเฉลี่ย ฿{$b['avgCommission']}\n"
            . '   สัดส่วนในหน้าต่าง ~' . round($b['shareOfPosts'] * 100) . "%\n"
            . "   {$b['tip']}";
    }
    if (!$bandRows) $bandRows[] = '_(ยังไม่มีข้อมูล)_';

    $suggestionRows = [];
    foreach ($lab['suggestions'] as $i => $s) {
        $n = $i + 1;
        $suggestionRows[] = "{$n}. {$s['productName']} · {$s['status']} · {$s['channelLabel']}\n"
            . "   preview: {$s['captionPreview']}\n"
            . "   {$s['currentLabel']} → **{$s['suggestedLabel']}**\n"
            . "   {$s['reason']}\n"
            . "   {$s['tip']}";
    }
    if (!$suggestionRows) $suggestionRows[] = '_(ไม่มีคำแนะนำสลับโทนวันนี้)_';

    $actionLines = [];
    foreach ($lab['actions'] as $a) {
        $actionLines[] = "- **{$a['title']}**: {$a['detail']}";
    }
    $checkLines = array_map(fn($c) => "- {$c}", $lab['checklist']);

    return "# Tone Fit Lab · {$lab['date']}\n\n"
        . $lab['summary'] . "\n\n"
        . "- เกรดแล็บ: {$lab['grade']} ({$lab['score']}/100)\n"
        . "- หน้าต่าง: {$lab['fromDate']} → {$lab['date']} ({$lab['windowDays']} วัน)\n"
        . "- โพสต์มีเมตริก: {$lab['counts']['postsWithMetrics']}\n"
        . "- โทนที่มีข้อมูล: {$lab['counts']['bandsWithData']}\n"
        . "- ช่วงร้อน: {$lab['counts']['hot']}\n"
        . "- hard_push: {$lab['counts']['hardPushSamples']}\n"
        . '- มิกซ์เอนข้างเดียว: ' . (!empty($lab['counts']['unbalanced']) ? 'ใช่' : 'ไม่') . "\n\n"
        . "## มิกซ์ทิป\n"
        . $lab['mixTip'] . "\n\n"
        . "## อันดับโทนน้ำเสียง (ทดลอง)\n"
        . implode("\n", $bandRows) . "\n\n"
        . "## คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)\n"
        . implode("\n", $suggestionRows) . "\n\n"
        . "## Actions\n"
        . implode("\n", $actionLines) . "\n\n"
        . "## Checklist\n"
        . implode("\n", $checkLines) . "\n\n"
        . $lab['disclaimer'] . "\n";
}


function angle_style_order(): array
{
    return ['pain', 'compare', 'usage', 'time_save', 'friend', 'flat'];
}

function angle_style_label(string $band): string
{
    return [
        'pain' => 'มุมปัญหา',
        'compare' => 'มุมเทียบเลือก',
        'usage' => 'มุมใช้งานจริง',
        'time_save' => 'มุมประหยัดเวลา',
        'friend' => 'มุมเพื่อนแนะนำ',
        'flat' => 'มุมไม่ชัด / กลาง ๆ',
    ][$band] ?? $band;
}

function angle_style_range(string $band): string
{
    return [
        'pain' => 'เล่า pain สั้น ๆ แล้วค่อยโชว์ตัวเลือก',
        'compare' => 'เทียบสเปก/ราคา/ของเดิมก่อนตัดสินใจ',
        'usage' => 'โชว์ 1 สถานการณ์ใช้งานจริง + จุดที่ชอบ',
        'time_save' => 'ลดขั้นตอน / ประหยัดเวลา โดยไม่โอเวอร์เคลม',
        'friend' => 'น้ำเสียงคุยกัน แชร์ตัวเลือก ไม่เร่งกดซื้อ',
        'flat' => 'ไม่มีสัญญาณมุมขายช่วยเลือกที่ชัด',
    ][$band] ?? '';
}

function angle_style_hint(string $band): string
{
    return [
        'pain' => 'เปิดด้วยปัญหาที่คนดูเจอบ่อย 1 ข้อ แล้วชวนดูรายละเอียด — ไม่การันตีผล',
        'compare' => 'ให้เทียบกับของเดิม 1 จุด (สเปก/ราคา) แล้วเปิดดูต่อเอง',
        'usage' => 'โชว์สถานการณ์ประจำวันสั้น ๆ + จุดที่ชอบ 1 ข้อ ปิดด้วยลิงก์+disclosure',
        'time_save' => 'บอกขั้นตอนที่ลดได้จริงโดยไม่โอเวอร์เคลม แล้วให้ดูรีวิวเพิ่ม',
        'friend' => 'คุยแบบเพื่อนแนะนำตัวเลือก — ไม่เร่งซื้อ และใส่ disclosure',
        'flat' => 'ใส่มุมปัญหา / เทียบเลือก / ใช้งานจริง ให้ชัดขึ้นก่อน Approve',
    ][$band] ?? '';
}

function resolve_angle_text(?array $pack, string $captionPreview = ''): string
{
    $parts = [];
    if (!empty($pack['sellingAngles']) && is_array($pack['sellingAngles'])) {
        $parts[] = implode(' ', $pack['sellingAngles']);
    }
    if (trim($captionPreview) !== '') $parts[] = trim($captionPreview);
    if ($pack) {
        if (!empty($pack['facebookCaption'])) $parts[] = $pack['facebookCaption'];
        if (!empty($pack['facebookGroupCaption'])) $parts[] = $pack['facebookGroupCaption'];
        if (!empty($pack['reelsCaption'])) $parts[] = $pack['reelsCaption'];
        $scenes = $pack['tiktokScript']['scenes'] ?? [];
        if (is_array($scenes) && $scenes) {
            $lines = [];
            foreach ($scenes as $s) {
                if (!empty($s['line'])) $lines[] = $s['line'];
            }
            if ($lines) $parts[] = implode(' ', $lines);
        }
        if (!empty($pack['hooks']) && is_array($pack['hooks'])) {
            $parts[] = implode(' ', array_slice($pack['hooks'], 0, 2));
        }
    }
    return implode("\n", $parts);
}

function classify_angle_style(string $raw): string
{
    $raw = trim($raw);
    if ($raw === '') return 'flat';

    if (preg_match('/มุมปัญหา|มุมเทียบเลือก|มุมเทียบ|มุมใช้งานจริง|มุมใช้งาน|มุมประหยัดเวลา|มุมเพื่อนแนะนำ|มุมเพื่อน/u', $raw, $m)) {
        $label = $m[0];
        if (str_contains($label, 'ปัญหา')) return 'pain';
        if (str_contains($label, 'เทียบ')) return 'compare';
        if (str_contains($label, 'ใช้งาน')) return 'usage';
        if (str_contains($label, 'ประหยัด')) return 'time_save';
        if (str_contains($label, 'เพื่อน')) return 'friend';
    }

    $pain = (bool)preg_match('/มุมปัญหา|เคยเจอไหม|ปัญหาคือ|เหนื่อย|ปวด|รำคาญ|ช่วยเรื่อง|ถ้ากำลังหา|pain/iu', $raw);
    $compare = (bool)preg_match('/มุมเทียบ|เทียบเลือก|เทียบกับ|ของเดิม|ตัวเลือก|ราคาประมาณ|เปิดดูสเปก|อ่านรีวิว/iu', $raw);
    $usage = (bool)preg_match('/มุมใช้งาน|ใช้งานจริง|สถานการณ์|โชว์ของจริง|จุดที่ชอบ|คนใช้จริง|สาธิต|before.?after/iu', $raw);
    $timeSave = (bool)preg_match('/มุมประหยัดเวลา|ประหยัดเวลา|ลดขั้นตอน|ไม่ต้องซื้อแพง|ทำไมของชิ้นนี้ลด/iu', $raw);
    $friend = (bool)preg_match('/มุมเพื่อน|เพื่อนแนะนำ|น้ำเสียงคุย|แชร์ตัวเลือก|ไม่เร่งกดซื้อ|คุยกัน|แนะนำเพื่อน/iu', $raw);

    if ($pain && ($friend || $usage || $compare || $timeSave || mb_strlen($raw) >= 40)) return 'pain';
    if ($pain) return 'pain';
    if ($friend && !$compare) return 'friend';
    if ($usage && !$compare) return 'usage';
    if ($compare) return 'compare';
    if ($timeSave) return 'time_save';
    if ($friend) return 'friend';
    if ($usage) return 'usage';
    return 'flat';
}

function angle_style_of(array $post, ?array $pack = null): string
{
    return classify_angle_style(resolve_angle_text($pack, (string)($post['caption_preview'] ?? $post['captionPreview'] ?? '')));
}

/**
 * Angle Fit Lab — soft ranking of selling-angle styles from logged metrics.
 */
function build_angle_fit_lab(?string $date = null, int $windowDays = 14): array
{
    $date = $date ?: today_iso();
    $window = max(7, min(30, $windowDays));
    $from = date('Y-m-d', strtotime($date . ' -' . ($window - 1) . ' days'));
    $order = angle_style_order();
    $statusLabel = ['hot' => 'ร้อน', 'steady' => 'นิ่ง', 'cold' => 'เย็น', 'no_data' => 'ยังไม่มีข้อมูล'];
    $confLabel = ['thin' => 'ข้อมูลบาง', 'ok' => 'พอใช้', 'solid' => 'หนาขึ้น'];

    $products = all_products();
    $byId = [];
    foreach ($products as $p) $byId[$p['id']] = $p;

    $stmt = db()->prepare("SELECT * FROM schedule WHERE status='posted' AND metrics_at IS NOT NULL AND post_date BETWEEN ? AND ?");
    $stmt->execute([$from, $date]);
    $posted = $stmt->fetchAll() ?: [];

    $byBand = [];
    foreach ($order as $b) $byBand[$b] = [];
    $allComm = [];
    $packCache = [];
    foreach ($posted as $row) {
        $packId = (string)($row['content_pack_id'] ?? '');
        if ($packId !== '' && !isset($packCache[$packId])) {
            $pstmt = db()->prepare('SELECT * FROM content_packs WHERE id=?');
            $pstmt->execute([$packId]);
            $prow = $pstmt->fetch();
            if ($prow) {
                $script = json_decode((string)($prow['tiktok_script'] ?? '{}'), true) ?: [];
                $packCache[$packId] = [
                    'hooks' => decode_list($prow['hooks'] ?? '[]'),
                    'facebookCaption' => (string)($prow['facebook_caption'] ?? ''),
                    'facebookGroupCaption' => (string)($prow['facebook_group_caption'] ?? ''),
                    'reelsCaption' => (string)($prow['reels_caption'] ?? ''),
                    'sellingAngles' => decode_list($prow['selling_angles'] ?? '[]'),
                    'tiktokScript' => is_array($script) ? $script : [],
                ];
            } else {
                $packCache[$packId] = null;
            }
        }
        $pack = $packCache[$packId] ?? null;
        if (!$pack) {
            $lp = latest_pack((string)$row['product_id']);
            $pack = $lp ? [
                'hooks' => $lp['hooks'] ?? [],
                'facebookCaption' => (string)($lp['facebookCaption'] ?? ''),
                'facebookGroupCaption' => (string)($lp['facebookGroupCaption'] ?? ''),
                'reelsCaption' => (string)($lp['reelsCaption'] ?? ''),
                'sellingAngles' => $lp['sellingAngles'] ?? [],
                'tiktokScript' => $lp['tiktokScript'] ?? [],
            ] : [];
        }
        $key = angle_style_of([
            'caption_preview' => (string)($row['caption_preview'] ?? ''),
            'content_pack_id' => $packId,
        ], $pack);
        $byBand[$key][] = $row;
        $allComm[] = (float)($row['commission_earned'] ?? 0);
    }

    $postedN = count($posted);
    $globalAvgCommission = $postedN > 0 ? array_sum($allComm) / $postedN : 0.0;

    $bands = [];
    foreach ($order as $band) {
        $list = $byBand[$band] ?? [];
        $samples = count($list);
        $views = array_map(fn($p) => (float)($p['views'] ?? 0), $list);
        $clicks = array_map(fn($p) => (float)($p['clicks'] ?? 0), $list);
        $orders = array_map(fn($p) => (float)($p['orders_count'] ?? 0), $list);
        $comms = array_map(fn($p) => (float)($p['commission_earned'] ?? 0), $list);
        $avgViews = $samples ? array_sum($views) / $samples : 0;
        $avgClicks = $samples ? array_sum($clicks) / $samples : 0;
        $avgOrders = $samples ? array_sum($orders) / $samples : 0;
        $avgCommission = $samples ? array_sum($comms) / $samples : 0;
        $totalViews = array_sum($views);
        $totalClicks = array_sum($clicks);
        $totalOrders = array_sum($orders);
        $avgCtr = $totalViews > 0 ? $totalClicks / $totalViews : 0;
        $avgOrdersPerClick = $totalClicks > 0 ? $totalOrders / $totalClicks : 0;
        $share = $postedN > 0 ? $samples / $postedN : 0;

        $score = 0;
        if ($samples > 0) {
            $commBase = $globalAvgCommission > 0
                ? max(0, min(70, ($avgCommission / $globalAvgCommission) * 50))
                : max(0, min(50, $avgCommission * 2));
            $score = $commBase + max(0, min(22, $avgCtr * 220)) + max(0, min(15, $avgOrdersPerClick * 100)) + max(0, min(15, $avgOrders * 8));
            if ($band === 'pain') $score += 5;
            elseif ($band === 'friend') $score += 4;
            elseif ($band === 'usage') $score += 4;
            elseif ($band === 'compare') $score += 3;
            elseif ($band === 'time_save') $score += 3;
            elseif ($band === 'flat') $score -= 6;
            if ($share >= 0.7 && $samples >= 3) $score -= 12;
            elseif ($share >= 0.55 && $samples >= 2) $score -= 6;
            if ($samples === 1) $score *= 0.75;
            $score = (int)round(max(0, min(100, $score)));
        }

        $confidence = $samples >= 4 ? 'solid' : ($samples >= 2 ? 'ok' : 'thin');
        $status = $samples === 0 ? 'no_data' : ($score >= 65 && $samples >= 2 ? 'hot' : ($score >= 45 ? 'steady' : 'cold'));
        $row = [
            'band' => $band,
            'bandLabel' => angle_style_label($band),
            'rangeLabel' => angle_style_range($band),
            'samples' => $samples,
            'avgViews' => round($avgViews, 1),
            'avgClicks' => round($avgClicks, 1),
            'avgOrders' => round($avgOrders, 2),
            'avgCommission' => round($avgCommission, 1),
            'avgCtr' => round($avgCtr, 2),
            'avgOrdersPerClick' => round($avgOrdersPerClick, 2),
            'score' => $score,
            'status' => $status,
            'confidence' => $confidence,
            'shareOfPosts' => round($share, 2),
            'tip' => '',
        ];
        if ($samples === 0) {
            $row['tip'] = 'ยังไม่มีผลมุมนี้ — ลอง draft 1 ชิ้นแนว “' . angle_style_hint($band) . '” แล้วกรอกเมตริก';
        } elseif ($band === 'flat') {
            $row['tip'] = 'มุมไม่ชัด — ใส่ selling angle ให้ชัด (ปัญหา/เทียบ/ใช้งาน) แล้ว regenerate ก่อน Approve';
        } elseif ($status === 'hot') {
            $row['tip'] = 'มุมนี้ดูเวิร์กกว่าในหน้าต่างนี้ (ทดลอง) — ใช้ต่อได้ แต่สลับสินค้า/ช่องเพื่อไม่ให้ซ้ำ';
        } elseif ($status === 'cold') {
            $row['tip'] = 'ผลเย็นในมุมนี้ — ลองปรับมุมขายหรือ regenerate แคปชันก่อนโพสต์ซ้ำ';
        } elseif ($share >= 0.55) {
            $row['tip'] = 'ใช้มุมนี้บ่อย (' . round($share * 100) . '%) — กระจาย pain/compare/usage เพื่อลดความซ้ำ';
        } else {
            $row['tip'] = 'เก็บข้อมูลต่ออีก 1–2 โพสต์ในมุมนี้ก่อนสรุป — ตัวเลขยังเป็นสมมติฐาน';
        }
        $bands[] = $row;
    }

    usort($bands, fn($a, $b) => ($b['score'] <=> $a['score']) ?: ($b['samples'] <=> $a['samples']));

    $withData = array_values(array_filter($bands, fn($b) => $b['samples'] > 0));
    $hot = count(array_filter($bands, fn($b) => $b['status'] === 'hot'));
    $flatSamples = count($byBand['flat'] ?? []);
    $topShare = 0.0;
    foreach ($bands as $b) $topShare = max($topShare, (float)$b['shareOfPosts']);
    $unbalanced = $topShare >= 0.55 && $postedN >= 3;

    $scoredAvg = $withData ? array_sum(array_column($withData, 'score')) / count($withData) : 0;
    $labScore = (int)round($scoredAvg);
    if (count($withData) >= 3) $labScore = min(100, $labScore + 8);
    elseif (count($withData) === 1 && $postedN >= 3) $labScore = max(0, $labScore - 10);
    if ($unbalanced) $labScore = max(0, $labScore - 8);
    if ($flatSamples > 0) $labScore = max(0, $labScore - 4);
    $labScore = max(0, min(100, $labScore));

    $bandsWithData = count($withData);
    if ($bandsWithData === 0) $grade = 'D';
    elseif ($labScore >= 75) $grade = 'A';
    elseif ($labScore >= 58) $grade = 'B';
    elseif ($labScore >= 40) $grade = 'C';
    else $grade = 'D';

    $best = null;
    foreach ($withData as $b) {
        if ($b['status'] === 'hot' && $b['band'] !== 'flat') { $best = $b; break; }
    }
    if (!$best) {
        foreach ($withData as $b) {
            if ($b['band'] !== 'flat') { $best = $b; break; }
        }
    }
    if (!$best && $withData) $best = $withData[0];
    $cold = array_values(array_filter($withData, fn($b) => $b['status'] === 'cold' || $b['band'] === 'flat'));

    if ($postedN === 0) {
        $mixTip = 'ยังไม่มีเมตริกรายมุมขาย — โพสต์มือแล้วกรอกผลที่ /results ก่อนจัดมิกซ์มุม';
    } elseif ($flatSamples > 0 && $flatSamples >= (int)ceil($postedN / 2)) {
        $mixTip = "พบมุม flat {$flatSamples} ชิ้น — ใส่ sellingAngles ให้ชัด (ปัญหา/เทียบ/ใช้งาน) ก่อน Approve (ทดลอง)";
    } elseif ($unbalanced && $best) {
        $mixTip = "มิกซ์เอนไปมุม {$best['bandLabel']} มาก — วันถัดไปลองสลับมุมขาย 1 ชิ้น (ทดลอง)";
    } elseif ($best) {
        $mixTip = "มุมเด่น: {$best['bandLabel']} — ใช้เป็นสมมติฐาน ไม่ล็อคทุกโพสต์";
    } else {
        $mixTip = 'เก็บผลต่ออีก 2–3 โพสต์ข้ามุมก่อนจัดอันดับมิกซ์';
    }

    $stmt = db()->prepare("SELECT * FROM schedule WHERE post_date=? AND status IN ('draft','approved') ORDER BY suggested_time ASC");
    $stmt->execute([$date]);
    $todaySlots = $stmt->fetchAll() ?: [];

    $preferred = null;
    foreach ($bands as $b) {
        if ($b['status'] === 'hot' && $b['band'] !== 'flat') { $preferred = $b; break; }
    }
    if (!$preferred) {
        foreach ($bands as $b) {
            if ($b['status'] === 'steady' && $b['samples'] > 0 && $b['band'] !== 'flat') { $preferred = $b; break; }
        }
    }
    if (!$preferred) {
        foreach ($bands as $b) {
            if ($b['band'] === 'pain') { $preferred = $b; break; }
        }
    }

    $suggestions = [];
    foreach (array_slice($todaySlots, 0, 6) as $slot) {
        $product = $byId[$slot['product_id']] ?? null;
        if (!$product || !$preferred) continue;
        $packId = (string)($slot['content_pack_id'] ?? '');
        $pack = null;
        if ($packId !== '') {
            if (!isset($packCache[$packId])) {
                $pstmt = db()->prepare('SELECT * FROM content_packs WHERE id=?');
                $pstmt->execute([$packId]);
                $prow = $pstmt->fetch();
                if ($prow) {
                    $script = json_decode((string)($prow['tiktok_script'] ?? '{}'), true) ?: [];
                    $packCache[$packId] = [
                        'hooks' => decode_list($prow['hooks'] ?? '[]'),
                        'facebookCaption' => (string)($prow['facebook_caption'] ?? ''),
                        'facebookGroupCaption' => (string)($prow['facebook_group_caption'] ?? ''),
                        'reelsCaption' => (string)($prow['reels_caption'] ?? ''),
                        'sellingAngles' => decode_list($prow['selling_angles'] ?? '[]'),
                        'tiktokScript' => is_array($script) ? $script : [],
                    ];
                } else {
                    $packCache[$packId] = null;
                }
            }
            $pack = $packCache[$packId];
        }
        if (!$pack) {
            $lp = latest_pack((string)$slot['product_id']);
            $pack = $lp ? [
                'hooks' => $lp['hooks'] ?? [],
                'facebookCaption' => (string)($lp['facebookCaption'] ?? ''),
                'facebookGroupCaption' => (string)($lp['facebookGroupCaption'] ?? ''),
                'reelsCaption' => (string)($lp['reelsCaption'] ?? ''),
                'sellingAngles' => $lp['sellingAngles'] ?? [],
                'tiktokScript' => $lp['tiktokScript'] ?? [],
            ] : [];
        }
        $currentKey = angle_style_of([
            'caption_preview' => (string)($slot['caption_preview'] ?? ''),
            'content_pack_id' => $packId,
        ], $pack);
        $currentRow = null;
        foreach ($bands as $b) {
            if ($b['band'] === $currentKey) { $currentRow = $b; break; }
        }
        $sameAsPreferred = $currentKey === $preferred['band'];
        $preview = mb_substr((string)($slot['caption_preview'] ?? ''), 0, 80);
        $currentCold = $currentKey === 'flat' || (
            $currentRow && (
                $currentRow['status'] === 'cold' ||
                ($currentRow['status'] === 'no_data' && $preferred['status'] === 'hot')
            )
        );

        if ($currentCold && !$sameAsPreferred) {
            $suggestions[] = [
                'scheduleId' => $slot['id'],
                'productId' => $product['id'],
                'productName' => $product['name'],
                'currentBand' => $currentKey,
                'currentLabel' => angle_style_label($currentKey),
                'suggestedBand' => $preferred['band'],
                'suggestedLabel' => $preferred['bandLabel'],
                'captionPreview' => $preview !== '' ? $preview : '(ไม่มีแคปชัน)',
                'status' => $slot['status'],
                'channelLabel' => channel_label($slot['channel']),
                'reason' => angle_style_label($currentKey) . ' เย็น/ไม่ชัด · ' . $preferred['bandLabel'] . ' ดูดีกว่าในหน้าต่างนี้ (ทดลอง)',
                'tip' => 'ไม่แก้แคปชันอัตโนมัติ — regenerate หรือแก้มือ แล้ว Approve ก่อนโพสต์',
            ];
        } elseif ($unbalanced && $sameAsPreferred && $cold && count($suggestions) < 2) {
            $alt = null;
            foreach ($bands as $b) {
                if ($b['band'] !== $currentKey && $b['band'] !== 'flat' && in_array($b['status'], ['steady', 'no_data'], true)) {
                    $alt = $b; break;
                }
            }
            if (!$alt) {
                foreach ($bands as $b) {
                    if (in_array($b['band'], ['usage', 'compare'], true)) { $alt = $b; break; }
                }
            }
            if (!$alt) {
                foreach ($cold as $b) {
                    if ($b['band'] !== 'flat') { $alt = $b; break; }
                }
            }
            if (!$alt) continue;
            $suggestions[] = [
                'scheduleId' => $slot['id'],
                'productId' => $product['id'],
                'productName' => $product['name'],
                'currentBand' => $currentKey,
                'currentLabel' => angle_style_label($currentKey),
                'suggestedBand' => $alt['band'],
                'suggestedLabel' => $alt['bandLabel'],
                'captionPreview' => $preview !== '' ? $preview : '(ไม่มีแคปชัน)',
                'status' => $slot['status'],
                'channelLabel' => channel_label($slot['channel']),
                'reason' => 'วันนี้ซ้อนมุม ' . angle_style_label($currentKey) . ' — ลองกระจายไป ' . $alt['bandLabel'] . ' เพื่อลดความซ้ำ (ทดลอง)',
                'tip' => 'ระบบไม่เปลี่ยนแคปชันเอง — regenerate draft แล้ว Approve ใหม่',
            ];
        }
    }

    $actions = [];
    if ($postedN === 0) {
        $actions[] = [
            'id' => 'need-metrics',
            'title' => 'เริ่มเก็บผลรายมุมขาย',
            'detail' => 'Approve → โพสต์มือ → กรอก views/clicks/orders ที่ /results อย่างน้อย 1 ชิ้นต่อมุม',
        ];
    }
    if ($flatSamples > 0) {
        $actions[] = [
            'id' => 'clarify-flat',
            'title' => 'ทำให้มุมขายชัดขึ้น',
            'detail' => "พบ {$flatSamples} โพสต์มุมไม่ชัด — ใส่ sellingAngles (ปัญหา/เทียบ/ใช้งาน) แล้ว regenerate ก่อน Approve",
        ];
    }
    if ($best && $best['status'] === 'hot' && $best['band'] !== 'flat') {
        $actions[] = [
            'id' => 'lean-angle',
            'title' => 'เอียงทดลองไปมุม ' . $best['bandLabel'],
            'detail' => 'n=' . $best['samples'] . ' · คะแนนฟิต ~' . $best['score'] . ' — ใช้ 1–2 สล็อต · ' . angle_style_hint($best['band']),
        ];
    }
    if ($unbalanced) {
        $actions[] = [
            'id' => 'diversify',
            'title' => 'กระจายมิกซ์มุมขาย',
            'detail' => 'มุมเด่นกินสัดส่วนสูง — เพิ่ม draft คนละมุม 1 ชิ้นในรอบถัดไป (กันสแปมฟีล)',
        ];
    }
    $coldSoft = array_values(array_filter($cold, fn($b) => $b['band'] !== 'flat'));
    if ($coldSoft) {
        $actions[] = [
            'id' => 'review-cold',
            'title' => 'ทบทวนมุมเย็น: ' . implode(', ', array_column($coldSoft, 'bandLabel')),
            'detail' => 'ปรับมุมขาย / regenerate หรือพักมุมนั้นชั่วคราว — อย่าโพสต์ซ้ำชุดเดิมยาว ๆ',
        ];
    }
    $missing = [];
    foreach ($order as $b) {
        if ($b === 'flat') continue;
        if (count($byBand[$b] ?? []) === 0) $missing[] = $b;
    }
    if ($missing && $postedN > 0) {
        $actions[] = [
            'id' => 'fill-styles',
            'title' => 'ทดลองมุมที่ยังไม่มีข้อมูล (' . count($missing) . ')',
            'detail' => 'ยังไม่มี: ' . implode(' · ', array_map('angle_style_label', $missing)) . ' — draft 1 ชิ้นต่อมุมแล้ววัดผล',
        ];
    }
    $actions[] = [
        'id' => 'compliance',
        'title' => 'คงกฎ Approve + disclosure + ไม่ขายแข็ง',
        'detail' => 'ทุกแคปชันต้องมี disclosure affiliate และผ่าน Approve ก่อนโพสต์มือ — ระบบไม่โพสต์อัตโนมัติ',
    ];
    $actions = array_slice($actions, 0, 5);

    if ($postedN === 0) {
        $summary = 'Angle Fit Lab: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลหลังโพสต์มือก่อนจัดอันดับมุมขาย';
    } else {
        $summary = "Angle Fit Lab: {$postedN} โพสต์มีเมตริก · มุมที่มีข้อมูล {$bandsWithData} · ร้อน {$hot}"
            . ($flatSamples > 0 ? " · flat {$flatSamples}" : '')
            . ($unbalanced ? ' · มิกซ์เอนข้างเดียว' : '');
    }

    $checklist = [
        'อันดับมุมขายมาจากเมตริกที่คุณกรอกเอง — ไม่ดึง API แพลตฟอร์ม',
        'คะแนนฟิตเป็นสมมติฐานทดลอง ไม่การันตียอดขาย/ค่าคอม',
        'คำแนะนำสลับมุมเป็นคำแนะนำเท่านั้น — ต้องแก้เอง + Approve',
        'หลีกเลี่ยงมุมไม่ชัดและคำโฆษณาเกินจริง',
        'ทุกโพสต์ต้องมี disclosure และน้ำเสียงช่วยเลือกของ',
    ];

    $lines = [
        "Angle Fit Lab {$date}: เกรด {$grade} ({$labScore}/100) · {$summary}",
        $mixTip,
    ];
    foreach (array_slice($withData, 0, 3) as $b) {
        $lines[] = $statusLabel[$b['status']] . ' · ' . $b['bandLabel'] . ': คะแนน ' . $b['score'] . ' (' . $confLabel[$b['confidence']] . ', n=' . $b['samples'] . ', CTR ~' . round($b['avgCtr'] * 100, 1) . '%)';
    }
    foreach (array_slice($suggestions, 0, 2) as $s) {
        $lines[] = 'แนะนำทดลอง · ' . $s['productName'] . ': ' . $s['currentLabel'] . ' → ' . $s['suggestedLabel'];
    }
    $lines[] = INCOME_DISCLAIMER;

    return [
        'date' => $date,
        'fromDate' => $from,
        'windowDays' => $window,
        'grade' => $grade,
        'score' => $labScore,
        'summary' => $summary,
        'counts' => [
            'postsWithMetrics' => $postedN,
            'bandsWithData' => $bandsWithData,
            'unbalanced' => $unbalanced,
            'suggestions' => count($suggestions),
            'hot' => $hot,
            'flatSamples' => $flatSamples,
        ],
        'bands' => $bands,
        'mixTip' => $mixTip,
        'suggestions' => array_slice($suggestions, 0, 5),
        'actions' => $actions,
        'checklist' => $checklist,
        'lines' => $lines,
        'disclaimer' => INCOME_DISCLAIMER,
    ];
}

function angle_fit_lab_to_markdown(array $lab): string
{
    $bandRows = [];
    foreach ($lab['bands'] as $b) {
        if (($b['samples'] ?? 0) <= 0) continue;
        $statusLabel = ['hot' => 'ร้อน', 'steady' => 'นิ่ง', 'cold' => 'เย็น', 'no_data' => 'ยังไม่มีข้อมูล'][$b['status']] ?? $b['status'];
        $confLabel = ['thin' => 'ข้อมูลบาง', 'ok' => 'พอใช้', 'solid' => 'หนาขึ้น'][$b['confidence']] ?? $b['confidence'];
        $n = count($bandRows) + 1;
        $bandRows[] = "{$n}. **[{$statusLabel}]** {$b['bandLabel']} ({$b['rangeLabel']}) · คะแนน {$b['score']}/100 · n={$b['samples']} · {$confLabel}\n"
            . "   CTR ~" . round($b['avgCtr'] * 100, 1) . "% · ออเดอร์/คลิก ~{$b['avgOrdersPerClick']} · ค่าคอมเฉลี่ย ฿{$b['avgCommission']}\n"
            . '   สัดส่วนในหน้าต่าง ~' . round($b['shareOfPosts'] * 100) . "%\n"
            . "   {$b['tip']}";
    }
    if (!$bandRows) $bandRows[] = '_(ยังไม่มีข้อมูล)_';

    $suggestionRows = [];
    foreach ($lab['suggestions'] as $i => $s) {
        $n = $i + 1;
        $suggestionRows[] = "{$n}. {$s['productName']} · {$s['status']} · {$s['channelLabel']}\n"
            . "   preview: {$s['captionPreview']}\n"
            . "   {$s['currentLabel']} → **{$s['suggestedLabel']}**\n"
            . "   {$s['reason']}\n"
            . "   {$s['tip']}";
    }
    if (!$suggestionRows) $suggestionRows[] = '_(ไม่มีคำแนะนำสลับมุมวันนี้)_';

    $actionLines = [];
    foreach ($lab['actions'] as $a) {
        $actionLines[] = "- **{$a['title']}**: {$a['detail']}";
    }
    $checkLines = array_map(fn($c) => "- {$c}", $lab['checklist']);

    return "# Angle Fit Lab · {$lab['date']}\n\n"
        . $lab['summary'] . "\n\n"
        . "- เกรดแล็บ: {$lab['grade']} ({$lab['score']}/100)\n"
        . "- หน้าต่าง: {$lab['fromDate']} → {$lab['date']} ({$lab['windowDays']} วัน)\n"
        . "- โพสต์มีเมตริก: {$lab['counts']['postsWithMetrics']}\n"
        . "- มุมที่มีข้อมูล: {$lab['counts']['bandsWithData']}\n"
        . "- ช่วงร้อน: {$lab['counts']['hot']}\n"
        . "- flat: {$lab['counts']['flatSamples']}\n"
        . '- มิกซ์เอนข้างเดียว: ' . (!empty($lab['counts']['unbalanced']) ? 'ใช่' : 'ไม่') . "\n\n"
        . "## มิกซ์ทิป\n"
        . $lab['mixTip'] . "\n\n"
        . "## อันดับมุมขาย (ทดลอง)\n"
        . implode("\n", $bandRows) . "\n\n"
        . "## คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)\n"
        . implode("\n", $suggestionRows) . "\n\n"
        . "## Actions\n"
        . implode("\n", $actionLines) . "\n\n"
        . "## Checklist\n"
        . implode("\n", $checkLines) . "\n\n"
        . $lab['disclaimer'] . "\n";
}






/**
 * Length Fit Lab — soft ranking of caption-length bands from logged metrics.
 */
function length_band_order(): array
{
    return ['micro', 'compact', 'standard', 'detailed', 'longform', 'empty'];
}

function length_band_label(string $band): string
{
    return [
        'micro' => 'สั้นมาก (micro)',
        'compact' => 'กระชับ (compact)',
        'standard' => 'มาตรฐาน (standard)',
        'detailed' => 'ละเอียด (detailed)',
        'longform' => 'ยาวมาก (longform)',
        'empty' => 'ว่าง / ไม่มีเนื้อหา',
    ][$band] ?? $band;
}

function length_band_range(string $band): string
{
    return [
        'micro' => 'เนื้อหา 1–90 ตัวอักษร (หลังตัด disclosure)',
        'compact' => 'เนื้อหา 91–180 ตัวอักษร — เหมาะคลิปสั้น',
        'standard' => 'เนื้อหา 181–340 ตัวอักษร — อ่านง่ายบน FB/Reels',
        'detailed' => 'เนื้อหา 341–560 ตัวอักษร — รายละเอียดพอ',
        'longform' => 'เนื้อหา >560 ตัวอักษร — เสี่ยงยาวเกิน',
        'empty' => 'ไม่มีเนื้อหาขาย / มีแค่ disclosure',
    ][$band] ?? '';
}

function length_style_hint(string $band): string
{
    return [
        'micro' => 'เติม hook + จุดขาย 1 ข้อ + CTA อ่อน ให้อยู่ช่วง compact–standard',
        'compact' => 'คงความกระชับ: ปัญหาสั้น → จุดชอบ 1 ข้อ → ลิงก์+disclosure',
        'standard' => 'คงความยาวพออ่าน: ช่วยเลือกของ ไม่ยัดยี่ห้อยาว ๆ',
        'detailed' => 'ตัดส่วนซ้ำ เหลือจุดขายหลัก 2 ข้อ ก่อน Approve',
        'longform' => 'ย่อเหลือ compact–standard กันสแปมฟีล — เก็บรายละเอียดไว้ในวิดีโอ',
        'empty' => 'เขียนแคปชันจริง + disclosure ก่อน Approve',
    ][$band] ?? '';
}

function caption_body_length(string $text): int
{
    $raw = str_replace(AFFILIATE_DISCLOSURE, ' ', $text);
    $raw = preg_replace('/ลิงก์นี้เป็นลิงก์\\s*affiliate[^\\n]*/iu', ' ', $raw) ?? $raw;
    $raw = preg_replace('/\\s+/u', ' ', $raw) ?? $raw;
    return mb_strlen(trim($raw), 'UTF-8');
}

function classify_length_band(string $text): string
{
    $n = caption_body_length($text);
    if ($n <= 0) return 'empty';
    if ($n <= 90) return 'micro';
    if ($n <= 180) return 'compact';
    if ($n <= 340) return 'standard';
    if ($n <= 560) return 'detailed';
    return 'longform';
}

function resolve_length_text(?array $pack, string $captionPreview = '', string $channel = ''): string
{
    if (trim($captionPreview) !== '') return trim($captionPreview);
    if (!$pack) return '';
    if ($channel === 'facebook_reels' && !empty($pack['reelsCaption'])) return (string)$pack['reelsCaption'];
    if ($channel === 'facebook_group' && !empty($pack['facebookGroupCaption'])) return (string)$pack['facebookGroupCaption'];
    if ($channel === 'facebook_post' && !empty($pack['facebookCaption'])) return (string)$pack['facebookCaption'];
    if (!empty($pack['facebookCaption'])) return (string)$pack['facebookCaption'];
    if (!empty($pack['reelsCaption'])) return (string)$pack['reelsCaption'];
    if (!empty($pack['facebookGroupCaption'])) return (string)$pack['facebookGroupCaption'];
    $scenes = $pack['tiktokScript']['scenes'] ?? [];
    if (is_array($scenes) && $scenes) {
        $lines = [];
        foreach ($scenes as $s) {
            if (is_array($s) && isset($s['line'])) $lines[] = (string)$s['line'];
        }
        if ($lines) return implode(' ', $lines);
    }
    return '';
}

function length_band_of(array $post, ?array $pack = null): string
{
    $preview = (string)($post['caption_preview'] ?? $post['captionPreview'] ?? '');
    $channel = (string)($post['channel'] ?? '');
    return classify_length_band(resolve_length_text($pack, $preview, $channel));
}

function build_length_fit_lab(?string $date = null, int $windowDays = 14): array
{
    $date = $date ?: today_iso();
    $window = max(7, min(30, $windowDays));
    $from = date('Y-m-d', strtotime($date . ' -' . ($window - 1) . ' days'));
    $order = length_band_order();
    $statusLabel = ['hot' => 'ร้อน', 'steady' => 'นิ่ง', 'cold' => 'เย็น', 'no_data' => 'ยังไม่มีข้อมูล'];
    $confLabel = ['thin' => 'ข้อมูลบาง', 'ok' => 'พอใช้', 'solid' => 'หนาขึ้น'];

    $products = all_products();
    $byId = [];
    foreach ($products as $p) $byId[$p['id']] = $p;

    $stmt = db()->prepare("SELECT * FROM schedule WHERE status='posted' AND metrics_at IS NOT NULL AND post_date BETWEEN ? AND ?");
    $stmt->execute([$from, $date]);
    $posted = $stmt->fetchAll() ?: [];

    $byBand = [];
    foreach ($order as $b) $byBand[$b] = [];
    $allComm = [];
    $packCache = [];
    foreach ($posted as $row) {
        $packId = (string)($row['content_pack_id'] ?? '');
        if ($packId !== '' && !isset($packCache[$packId])) {
            $pstmt = db()->prepare('SELECT * FROM content_packs WHERE id=?');
            $pstmt->execute([$packId]);
            $prow = $pstmt->fetch();
            if ($prow) {
                $script = json_decode((string)($prow['tiktok_script'] ?? '{}'), true) ?: [];
                $packCache[$packId] = [
                    'facebookCaption' => (string)($prow['facebook_caption'] ?? ''),
                    'facebookGroupCaption' => (string)($prow['facebook_group_caption'] ?? ''),
                    'reelsCaption' => (string)($prow['reels_caption'] ?? ''),
                    'tiktokScript' => is_array($script) ? $script : [],
                ];
            } else {
                $packCache[$packId] = null;
            }
        }
        $pack = $packCache[$packId] ?? null;
        if (!$pack) {
            $lp = latest_pack((string)$row['product_id']);
            $pack = $lp ? [
                'facebookCaption' => (string)($lp['facebookCaption'] ?? ''),
                'facebookGroupCaption' => (string)($lp['facebookGroupCaption'] ?? ''),
                'reelsCaption' => (string)($lp['reelsCaption'] ?? ''),
                'tiktokScript' => $lp['tiktokScript'] ?? [],
            ] : [];
        }
        $key = length_band_of([
            'caption_preview' => (string)($row['caption_preview'] ?? ''),
            'channel' => (string)($row['channel'] ?? ''),
            'content_pack_id' => $packId,
        ], $pack);
        $byBand[$key][] = $row;
        $allComm[] = (float)($row['commission_earned'] ?? 0);
    }

    $postedN = count($posted);
    $globalAvgCommission = $postedN > 0 ? array_sum($allComm) / $postedN : 0.0;

    $bands = [];
    foreach ($order as $band) {
        $list = $byBand[$band] ?? [];
        $samples = count($list);
        $views = array_map(fn($p) => (float)($p['views'] ?? 0), $list);
        $clicks = array_map(fn($p) => (float)($p['clicks'] ?? 0), $list);
        $orders = array_map(fn($p) => (float)($p['orders_count'] ?? 0), $list);
        $comms = array_map(fn($p) => (float)($p['commission_earned'] ?? 0), $list);
        $chars = [];
        foreach ($list as $p) {
            $packId = (string)($p['content_pack_id'] ?? '');
            $pack = $packCache[$packId] ?? [];
            $chars[] = caption_body_length(resolve_length_text($pack, (string)($p['caption_preview'] ?? ''), (string)($p['channel'] ?? '')));
        }
        $avgViews = $samples ? array_sum($views) / $samples : 0;
        $avgClicks = $samples ? array_sum($clicks) / $samples : 0;
        $avgOrders = $samples ? array_sum($orders) / $samples : 0;
        $avgCommission = $samples ? array_sum($comms) / $samples : 0;
        $avgChars = $samples ? array_sum($chars) / $samples : 0;
        $totalViews = array_sum($views);
        $totalClicks = array_sum($clicks);
        $totalOrders = array_sum($orders);
        $avgCtr = $totalViews > 0 ? $totalClicks / $totalViews : 0;
        $avgOrdersPerClick = $totalClicks > 0 ? $totalOrders / $totalClicks : 0;
        $share = $postedN > 0 ? $samples / $postedN : 0;

        $score = 0.0;
        if ($samples > 0) {
            if ($globalAvgCommission > 0) {
                $commBase = max(0, min(70, ($avgCommission / $globalAvgCommission) * 50));
            } else {
                $commBase = max(0, min(50, $avgCommission * 2));
            }
            $ctrScore = max(0, min(22, $avgCtr * 220));
            $opcScore = max(0, min(15, $avgOrdersPerClick * 100));
            $orderScore = max(0, min(15, $avgOrders * 8));
            $score = $commBase + $ctrScore + $opcScore + $orderScore;
            if ($band === 'compact') $score += 5;
            elseif ($band === 'standard') $score += 5;
            elseif ($band === 'detailed') $score += 2;
            elseif ($band === 'micro') $score += 1;
            elseif ($band === 'longform') $score -= 3;
            elseif ($band === 'empty') $score -= 8;
            if ($share >= 0.7 && $samples >= 3) $score -= 12;
            elseif ($share >= 0.55 && $samples >= 2) $score -= 6;
            if ($samples === 1) $score *= 0.75;
            $score = max(0, min(100, round($score)));
        }

        $confidence = $samples >= 4 ? 'solid' : ($samples >= 2 ? 'ok' : 'thin');
        if ($samples === 0) $status = 'no_data';
        elseif ($score >= 65 && $samples >= 2) $status = 'hot';
        elseif ($score >= 45) $status = 'steady';
        else $status = 'cold';

        $tip = '';
        if ($samples === 0) {
            $tip = 'ยังไม่มีผลช่วงนี้ — ลอง draft 1 ชิ้นแนว “' . length_style_hint($band) . '” แล้วกรอกเมตริก';
        } elseif ($band === 'empty') {
            $tip = 'แคปชันว่าง/มีแค่ disclosure — เขียนเนื้อหาช่วยเลือกของก่อน Approve';
        } elseif ($status === 'hot') {
            $tip = 'ความยาวนี้ดูเวิร์กกว่าในหน้าต่างนี้ (ทดลอง) — ใช้ต่อได้ แต่สลับสินค้า/ช่องเพื่อไม่ให้ซ้ำ';
        } elseif ($status === 'cold') {
            $tip = 'ผลเย็นในช่วงความยาวนี้ — ลองย่อ/ขยายแคปชันหรือ regenerate ก่อนโพสต์ซ้ำ';
        } elseif ($share >= 0.55) {
            $tip = 'ใช้ความยาวนี้บ่อย (' . round($share * 100) . '%) — กระจาย compact/standard เพื่อลดความซ้ำ';
        } else {
            $tip = 'เก็บข้อมูลต่ออีก 1–2 โพสต์ในช่วงนี้ก่อนสรุป — ตัวเลขยังเป็นสมมติฐาน';
        }

        $bands[] = [
            'band' => $band,
            'bandLabel' => length_band_label($band),
            'rangeLabel' => length_band_range($band),
            'samples' => $samples,
            'avgChars' => round($avgChars, 1),
            'avgViews' => round($avgViews, 1),
            'avgClicks' => round($avgClicks, 1),
            'avgOrders' => round($avgOrders, 2),
            'avgCommission' => round($avgCommission, 1),
            'avgCtr' => round($avgCtr, 2),
            'avgOrdersPerClick' => round($avgOrdersPerClick, 2),
            'score' => (int)$score,
            'status' => $status,
            'confidence' => $confidence,
            'shareOfPosts' => round($share, 2),
            'tip' => $tip,
        ];
    }

    usort($bands, function ($a, $b) {
        if ($a['score'] === $b['score']) return $b['samples'] <=> $a['samples'];
        return $b['score'] <=> $a['score'];
    });

    $withData = array_values(array_filter($bands, fn($b) => $b['samples'] > 0));
    $hot = count(array_filter($bands, fn($b) => $b['status'] === 'hot'));
    $emptySamples = count($byBand['empty'] ?? []);
    $topShare = 0.0;
    foreach ($bands as $b) $topShare = max($topShare, (float)$b['shareOfPosts']);
    $unbalanced = $topShare >= 0.55 && $postedN >= 3;

    $scoredAvg = $withData ? array_sum(array_column($withData, 'score')) / count($withData) : 0;
    $labScore = (int)round($scoredAvg);
    if (count($withData) >= 3) $labScore = min(100, $labScore + 8);
    elseif (count($withData) === 1 && $postedN >= 3) $labScore = max(0, $labScore - 10);
    if ($unbalanced) $labScore = max(0, $labScore - 8);
    if ($emptySamples > 0) $labScore = max(0, $labScore - 4);
    $labScore = max(0, min(100, $labScore));

    if (!$withData) $grade = 'D';
    elseif ($labScore >= 75) $grade = 'A';
    elseif ($labScore >= 58) $grade = 'B';
    elseif ($labScore >= 40) $grade = 'C';
    else $grade = 'D';

    $best = null;
    foreach ($withData as $b) {
        if ($b['status'] === 'hot' && $b['band'] !== 'empty') { $best = $b; break; }
    }
    if (!$best) {
        foreach ($withData as $b) {
            if ($b['band'] !== 'empty') { $best = $b; break; }
        }
    }
    if (!$best && $withData) $best = $withData[0];

    $cold = array_values(array_filter($withData, fn($b) => $b['status'] === 'cold' || $b['band'] === 'empty'));

    if ($postedN === 0) {
        $mixTip = 'ยังไม่มีเมตริกรายความยาวแคปชัน — โพสต์มือแล้วกรอกผลที่ Results ก่อนจัดมิกซ์ความยาว';
    } elseif ($emptySamples > 0 && $emptySamples >= (int)ceil($postedN / 2)) {
        $mixTip = "พบแคปชันว่าง {$emptySamples} ชิ้น — เขียนเนื้อหาช่วยเลือกของ + disclosure ก่อน Approve (ทดลอง)";
    } elseif ($unbalanced && $best) {
        $mixTip = 'มิกซ์เอนไปช่วง ' . $best['bandLabel'] . ' มาก — วันถัดไปลองสลับความยาว 1 ชิ้น (ทดลอง)';
    } elseif ($best) {
        $mixTip = 'ความยาวเด่น: ' . $best['bandLabel'] . ' — ใช้เป็นสมมติฐาน ไม่ล็อคทุกโพสต์';
    } else {
        $mixTip = 'เก็บผลต่ออีก 2–3 โพสต์ข้ามช่วงความยาก่อนจัดอันดับมิกซ์';
    }

    $stmt = db()->prepare("SELECT s.*, p.name AS product_name FROM schedule s LEFT JOIN products p ON p.id=s.product_id WHERE s.post_date=? AND s.status IN ('draft','approved') ORDER BY s.suggested_time");
    $stmt->execute([$date]);
    $todaySlots = $stmt->fetchAll() ?: [];

    $preferred = null;
    foreach ($bands as $b) {
        if ($b['status'] === 'hot' && $b['band'] !== 'empty') { $preferred = $b; break; }
    }
    if (!$preferred) {
        foreach ($bands as $b) {
            if ($b['status'] === 'steady' && $b['samples'] > 0 && $b['band'] !== 'empty') { $preferred = $b; break; }
        }
    }
    if (!$preferred) {
        foreach ($bands as $b) {
            if ($b['band'] === 'compact' || $b['band'] === 'standard') { $preferred = $b; break; }
        }
    }

    $suggestions = [];
    foreach (array_slice($todaySlots, 0, 6) as $slot) {
        if (!$preferred) break;
        $packId = (string)($slot['content_pack_id'] ?? '');
        if ($packId !== '' && !isset($packCache[$packId])) {
            $pstmt = db()->prepare('SELECT * FROM content_packs WHERE id=?');
            $pstmt->execute([$packId]);
            $prow = $pstmt->fetch();
            if ($prow) {
                $script = json_decode((string)($prow['tiktok_script'] ?? '{}'), true) ?: [];
                $packCache[$packId] = [
                    'facebookCaption' => (string)($prow['facebook_caption'] ?? ''),
                    'facebookGroupCaption' => (string)($prow['facebook_group_caption'] ?? ''),
                    'reelsCaption' => (string)($prow['reels_caption'] ?? ''),
                    'tiktokScript' => is_array($script) ? $script : [],
                ];
            }
        }
        $pack = $packCache[$packId] ?? [];
        $text = resolve_length_text($pack, (string)($slot['caption_preview'] ?? ''), (string)($slot['channel'] ?? ''));
        $charCount = caption_body_length($text);
        $currentKey = classify_length_band($text);
        $currentRow = null;
        foreach ($bands as $b) if ($b['band'] === $currentKey) { $currentRow = $b; break; }
        $sameAsPreferred = $currentKey === $preferred['band'];
        $preview = mb_substr((string)($slot['caption_preview'] ?? ''), 0, 80, 'UTF-8');
        $currentCold = $currentKey === 'empty' || $currentKey === 'longform' || ($currentRow && ($currentRow['status'] === 'cold' || ($currentRow['status'] === 'no_data' && $preferred['status'] === 'hot')));
        if ($currentCold && !$sameAsPreferred) {
            $suggestions[] = [
                'scheduleId' => (string)$slot['id'],
                'productId' => (string)$slot['product_id'],
                'productName' => (string)($slot['product_name'] ?? $slot['product_id']),
                'currentBand' => $currentKey,
                'currentLabel' => length_band_label($currentKey),
                'suggestedBand' => $preferred['band'],
                'suggestedLabel' => $preferred['bandLabel'],
                'captionPreview' => $preview !== '' ? $preview : '(ไม่มีแคปชัน)',
                'charCount' => $charCount,
                'status' => (string)$slot['status'],
                'channelLabel' => channel_label((string)$slot['channel']),
                'reason' => length_band_label($currentKey) . ' เย็น/เสี่ยง · ' . $preferred['bandLabel'] . ' ดูดีกว่าในหน้าต่างนี้ (ทดลอง)',
                'tip' => 'ไม่แก้แคปชันอัตโนมัติ — regenerate หรือแก้มือ แล้ว Approve ก่อนโพสต์',
            ];
        } elseif ($unbalanced && $sameAsPreferred && $cold && count($suggestions) < 2) {
            $alt = null;
            foreach ($bands as $b) {
                if ($b['band'] !== $currentKey && $b['band'] !== 'empty' && ($b['status'] === 'steady' || $b['status'] === 'no_data')) { $alt = $b; break; }
            }
            if (!$alt) {
                foreach ($bands as $b) {
                    if ($b['band'] === 'standard' || $b['band'] === 'compact') { $alt = $b; break; }
                }
            }
            if (!$alt) {
                foreach ($cold as $b) {
                    if ($b['band'] !== 'empty') { $alt = $b; break; }
                }
            }
            if (!$alt) continue;
            $suggestions[] = [
                'scheduleId' => (string)$slot['id'],
                'productId' => (string)$slot['product_id'],
                'productName' => (string)($slot['product_name'] ?? $slot['product_id']),
                'currentBand' => $currentKey,
                'currentLabel' => length_band_label($currentKey),
                'suggestedBand' => $alt['band'],
                'suggestedLabel' => $alt['bandLabel'],
                'captionPreview' => $preview !== '' ? $preview : '(ไม่มีแคปชัน)',
                'charCount' => $charCount,
                'status' => (string)$slot['status'],
                'channelLabel' => channel_label((string)$slot['channel']),
                'reason' => 'วันนี้ซ้อนความยาว ' . length_band_label($currentKey) . ' — ลองกระจายไป ' . $alt['bandLabel'] . ' เพื่อลดความซ้ำ (ทดลอง)',
                'tip' => 'ระบบไม่เปลี่ยนแคปชันเอง — regenerate draft แล้ว Approve ใหม่',
            ];
        }
    }

    $actions = [];
    if ($postedN === 0) {
        $actions[] = ['id' => 'need-metrics', 'title' => 'เริ่มเก็บผลรายความยาวแคปชัน', 'detail' => 'Approve → โพสต์มือ → กรอก views/clicks/orders ที่ Results อย่างน้อย 1 ชิ้นต่อช่วงความยาว'];
    }
    if ($emptySamples > 0) {
        $actions[] = ['id' => 'fill-empty', 'title' => 'เติมเนื้อหาแคปชันที่ว่าง', 'detail' => "พบ {$emptySamples} โพสต์ว่าง/มีแค่ disclosure — เขียนช่วยเลือกของแล้ว regenerate ก่อน Approve"];
    }
    if ($best && $best['status'] === 'hot' && $best['band'] !== 'empty') {
        $actions[] = ['id' => 'lean-length', 'title' => 'เอียงทดลองไปช่วง ' . $best['bandLabel'], 'detail' => 'n=' . $best['samples'] . ' · คะแนนฟิต ~' . $best['score'] . ' — ใช้ 1–2 สล็อต · ' . length_style_hint($best['band'])];
    }
    if ($unbalanced) {
        $actions[] = ['id' => 'diversify', 'title' => 'กระจายมิกซ์ความยาว', 'detail' => 'ช่วงเด่นกินสัดส่วนสูง — เพิ่ม draft คนละความยาว 1 ชิ้นในรอบถัดไป (กันสแปมฟีล)'];
    }
    $coldSoft = array_values(array_filter($cold, fn($b) => $b['band'] !== 'empty'));
    if ($coldSoft) {
        $actions[] = ['id' => 'review-cold', 'title' => 'ทบทวนความยาวเย็น: ' . implode(', ', array_map(fn($b) => $b['bandLabel'], $coldSoft)), 'detail' => 'ย่อ/ขยายแคปชัน / regenerate หรือพักช่วงนั้นชั่วคราว — อย่าโพสต์ซ้ำชุดเดิมยาว ๆ'];
    }
    $missing = [];
    foreach ($order as $b) {
        if ($b === 'empty') continue;
        if (count($byBand[$b] ?? []) === 0) $missing[] = $b;
    }
    if ($missing && $postedN > 0) {
        $actions[] = ['id' => 'fill-bands', 'title' => 'ทดลองความยาวที่ยังไม่มีข้อมูล (' . count($missing) . ')', 'detail' => 'ยังไม่มี: ' . implode(' · ', array_map('length_band_label', $missing)) . ' — draft 1 ชิ้นต่อช่วงแล้ววัดผล'];
    }
    $actions[] = ['id' => 'compliance', 'title' => 'คงกฎ Approve + disclosure + ไม่ขายแข็ง', 'detail' => 'ทุกแคปชันต้องมี disclosure affiliate และผ่าน Approve ก่อนโพสต์มือ — ระบบไม่โพสต์อัตโนมัติ'];
    $actions = array_slice($actions, 0, 5);

    if ($postedN === 0) {
        $summary = 'Length Fit Lab: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลหลังโพสต์มือก่อนจัดอันดับความยาวแคปชัน';
    } else {
        $summary = "Length Fit Lab: {$postedN} โพสต์มีเมตริก · ช่วงที่มีข้อมูล " . count($withData) . " · ร้อน {$hot}"
            . ($emptySamples > 0 ? " · ว่าง {$emptySamples}" : '')
            . ($unbalanced ? ' · มิกซ์เอนข้างเดียว' : '');
    }

    $checklist = [
        'อันดับความยาวมาจากเมตริกที่คุณกรอกเอง — ไม่ดึง API แพลตฟอร์ม',
        'คะแนนฟิตเป็นสมมติฐานทดลอง ไม่การันตียอดขาย/ค่าคอม',
        'คำแนะนำสลับความยาวเป็นคำแนะนำเท่านั้น — ต้องแก้เอง + Approve',
        'หลีกเลี่ยงแคปชันว่างและยาวเกินจนดูสแปม',
        'ทุกโพสต์ต้องมี disclosure และน้ำเสียงช่วยเลือกของ',
    ];

    $lines = [
        "Length Fit Lab {$date}: เกรด {$grade} ({$labScore}/100) · {$summary}",
        $mixTip,
    ];
    foreach (array_slice($withData, 0, 3) as $b) {
        $lines[] = $statusLabel[$b['status']] . ' · ' . $b['bandLabel'] . ': คะแนน ' . $b['score'] . ' (' . $confLabel[$b['confidence']] . ', n=' . $b['samples'] . ', ~' . $b['avgChars'] . ' ตัวอักษร, CTR ~' . round($b['avgCtr'] * 100, 1) . '%)';
    }
    foreach (array_slice($suggestions, 0, 2) as $s) {
        $lines[] = 'แนะนำทดลอง · ' . $s['productName'] . ': ' . $s['currentLabel'] . ' → ' . $s['suggestedLabel'];
    }
    $lines[] = INCOME_DISCLAIMER;

    return [
        'date' => $date,
        'fromDate' => $from,
        'windowDays' => $window,
        'grade' => $grade,
        'score' => $labScore,
        'summary' => $summary,
        'counts' => [
            'postsWithMetrics' => $postedN,
            'bandsWithData' => count($withData),
            'unbalanced' => $unbalanced,
            'suggestions' => count($suggestions),
            'hot' => $hot,
            'emptySamples' => $emptySamples,
        ],
        'bands' => $bands,
        'mixTip' => $mixTip,
        'suggestions' => array_slice($suggestions, 0, 5),
        'actions' => $actions,
        'checklist' => $checklist,
        'lines' => $lines,
        'disclaimer' => INCOME_DISCLAIMER,
    ];
}

function length_fit_lab_to_markdown(array $lab): string
{
    $bandRows = [];
    foreach ($lab['bands'] as $b) {
        if (($b['samples'] ?? 0) <= 0) continue;
        $statusLabel = ['hot' => 'ร้อน', 'steady' => 'นิ่ง', 'cold' => 'เย็น', 'no_data' => 'ยังไม่มีข้อมูล'][$b['status']] ?? $b['status'];
        $confLabel = ['thin' => 'ข้อมูลบาง', 'ok' => 'พอใช้', 'solid' => 'หนาขึ้น'][$b['confidence']] ?? $b['confidence'];
        $n = count($bandRows) + 1;
        $bandRows[] = "{$n}. **[{$statusLabel}]** {$b['bandLabel']} ({$b['rangeLabel']}) · คะแนน {$b['score']}/100 · n={$b['samples']} · {$confLabel}\n"
            . "   ~{$b['avgChars']} ตัวอักษร · CTR ~" . round($b['avgCtr'] * 100, 1) . "% · ออเดอร์/คลิก ~{$b['avgOrdersPerClick']} · ค่าคอมเฉลี่ย ฿{$b['avgCommission']}\n"
            . '   สัดส่วนในหน้าต่าง ~' . round($b['shareOfPosts'] * 100) . "%\n"
            . "   {$b['tip']}";
    }
    if (!$bandRows) $bandRows[] = '_(ยังไม่มีข้อมูล)_';

    $suggestionRows = [];
    foreach ($lab['suggestions'] as $i => $s) {
        $n = $i + 1;
        $suggestionRows[] = "{$n}. {$s['productName']} · {$s['status']} · {$s['channelLabel']} · {$s['charCount']} ตัวอักษร\n"
            . "   preview: {$s['captionPreview']}\n"
            . "   {$s['currentLabel']} → **{$s['suggestedLabel']}**\n"
            . "   {$s['reason']}\n"
            . "   {$s['tip']}";
    }
    if (!$suggestionRows) $suggestionRows[] = '_(ไม่มีคำแนะนำสลับความยาววันนี้)_';

    $actionLines = [];
    foreach ($lab['actions'] as $a) {
        $actionLines[] = "- **{$a['title']}**: {$a['detail']}";
    }
    $checkLines = array_map(fn($c) => "- {$c}", $lab['checklist']);

    return "# Length Fit Lab · {$lab['date']}\n\n"
        . $lab['summary'] . "\n\n"
        . "- เกรดแล็บ: {$lab['grade']} ({$lab['score']}/100)\n"
        . "- หน้าต่าง: {$lab['fromDate']} → {$lab['date']} ({$lab['windowDays']} วัน)\n"
        . "- โพสต์มีเมตริก: {$lab['counts']['postsWithMetrics']}\n"
        . "- ช่วงที่มีข้อมูล: {$lab['counts']['bandsWithData']}\n"
        . "- ช่วงร้อน: {$lab['counts']['hot']}\n"
        . "- ว่าง: {$lab['counts']['emptySamples']}\n"
        . '- มิกซ์เอนข้างเดียว: ' . (!empty($lab['counts']['unbalanced']) ? 'ใช่' : 'ไม่') . "\n\n"
        . "## มิกซ์ทิป\n"
        . $lab['mixTip'] . "\n\n"
        . "## อันดับความยาวแคปชัน (ทดลอง)\n"
        . implode("\n", $bandRows) . "\n\n"
        . "## คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)\n"
        . implode("\n", $suggestionRows) . "\n\n"
        . "## Actions\n"
        . implode("\n", $actionLines) . "\n\n"
        . "## Checklist\n"
        . implode("\n", $checkLines) . "\n\n"
        
. $lab['disclaimer'] . "\n";
}


/**
 * Script Fit Lab — soft ranking of short-video script structures from logged metrics.
 */
function script_style_order(): array
{
    return ['problem_demo', 'howto', 'before_after', 'unbox', 'pov', 'flat'];
}

function script_style_label(string $band): string
{
    return [
        'problem_demo' => 'โครงปัญหา→สาธิต',
        'howto' => 'โครงวิธีใช้ทีละขั้น',
        'before_after' => 'โครงก่อน–หลัง',
        'unbox' => 'โครงแกะกล่อง',
        'pov' => 'โครง POV / วันหนึ่ง',
        'flat' => 'โครงไม่ชัด / กลาง ๆ',
    ][$band] ?? $band;
}

function script_style_range(string $band): string
{
    return [
        'problem_demo' => 'เปิด pain สั้น → โชว์ของ → สาธิต 1 จุด → CTA+disclosure',
        'howto' => 'บอกขั้นตอน 2–3 ก้าวแบบช่วยใช้ ไม่เร่งซื้อ',
        'before_after' => 'โชว์ก่อน/หลังแบบเบา ๆ ไม่โอเวอร์เคลมผลลัพธ์',
        'unbox' => 'เปิดกล่อง + จุดที่ชอบ 1 ข้อ + ลิงก์ดูรายละเอียด',
        'pov' => 'ตามไปดูสถานการณ์จริงสั้น ๆ แล้วแชร์ตัวเลือก',
        'flat' => 'ไม่มีสัญญาณโครงสคริปต์วิดีโอสั้นที่ชัด',
    ][$band] ?? '';
}

function script_style_hint(string $band): string
{
    return [
        'problem_demo' => '0–3วิ pain → 3–15วิ โชว์+สาธิต → ปิดด้วยลิงก์+disclosure (ไม่การันตีผล)',
        'howto' => 'บอก 2–3 ขั้นตอนใช้งานจริง แล้วให้ดูสเปกต่อเอง',
        'before_after' => 'ก่อน–หลังเบา ๆ 1 จุด — ไม่เคลมหายขาด/ปังแน่นอน',
        'unbox' => 'แกะกล่องสั้น + จุดที่ชอบ 1 ข้อ + CTA อ่อน',
        'pov' => 'ตามไปดู 1 สถานการณ์ในวัน → แชร์ตัวเลือก ไม่เร่งกดซื้อ',
        'flat' => 'ใส่ป้ายโครงสคริปต์ (ปัญหา→สาธิต / วิธีใช้ / ก่อน–หลัง) ให้ชัดก่อน Approve',
    ][$band] ?? '';
}

function resolve_script_text(?array $pack, string $captionPreview = ''): string
{
    $parts = [];
    if ($pack) {
        $script = $pack['tiktokScript'] ?? [];
        if (is_array($script)) {
            foreach (($script['scenes'] ?? []) as $s) {
                if (!is_array($s)) continue;
                foreach (['line', 'visual', 'time'] as $k) {
                    if (!empty($s[$k])) $parts[] = (string)$s[$k];
                }
            }
            if (!empty($script['voiceover'])) $parts[] = (string)$script['voiceover'];
        }
        if (!empty($pack['videoPriorityNote'])) $parts[] = (string)$pack['videoPriorityNote'];
        if (!empty($pack['filmingChecklist']) && is_array($pack['filmingChecklist'])) {
            $parts[] = implode(' ', $pack['filmingChecklist']);
        }
        if (!empty($pack['reelsCaption'])) $parts[] = (string)$pack['reelsCaption'];
        if (!empty($pack['hooks']) && is_array($pack['hooks'])) {
            $parts[] = implode(' ', array_slice($pack['hooks'], 0, 2));
        }
    }
    if (trim($captionPreview) !== '') $parts[] = trim($captionPreview);
    return implode("\n", $parts);
}

function classify_script_style(string $raw): string
{
    $raw = trim($raw);
    if ($raw === '') return 'flat';

    if (preg_match('/โครงปัญหา→สาธิต|โครงปัญหา.?สาธิต|โครงปัญหา|โครงวิธีใช้ทีละขั้น|โครงวิธีใช้|โครงก่อน–หลัง|โครงก่อน.?หลัง|โครงแกะกล่อง|โครง\s*POV|โครงPOV/iu', $raw, $m)) {
        $label = mb_strtolower($m[0]);
        if (str_contains($label, 'ปัญหา')) return 'problem_demo';
        if (str_contains($label, 'วิธีใช้')) return 'howto';
        if (str_contains($label, 'ก่อน')) return 'before_after';
        if (str_contains($label, 'แกะ')) return 'unbox';
        if (str_contains($label, 'pov')) return 'pov';
    }

    $problem = (bool)preg_match('/โครงปัญหา|ปัญหา→สาธิต|ปัญหาคือ|โชว์ปัญหา|เคยเจอไหม|pain.?demo|problem.?demo/iu', $raw);
    $howto = (bool)preg_match('/โครงวิธีใช้|วิธีใช้ทีละขั้น|ทีละขั้น|ขั้นตอน|how.?to|สอนใช้|ทำตามนี้|ก้าวที่/iu', $raw);
    $beforeAfter = (bool)preg_match('/โครงก่อน.?หลัง|before.?after|ก่อนใช้|หลังใช้|ก่อน–หลัง|ก่อนหลัง/iu', $raw);
    $unbox = (bool)preg_match('/โครงแกะกล่อง|แกะกล่อง|unbox|เปิดกล่อง|ของมาถึง|first look|unboxing/iu', $raw);
    $pov = (bool)preg_match('/โครง\s*POV|POV|วันหนึ่งของ|ตามไปดู|ในชีวิตประจำวัน|day in the life/iu', $raw);

    if ($problem && ($howto || $beforeAfter || $unbox || $pov || mb_strlen($raw) >= 40)) return 'problem_demo';
    if ($problem) return 'problem_demo';
    if ($howto && !$beforeAfter) return 'howto';
    if ($beforeAfter) return 'before_after';
    if ($unbox) return 'unbox';
    if ($pov) return 'pov';
    if ($howto) return 'howto';
    return 'flat';
}

function script_style_of(array $post, ?array $pack = null): string
{
    return classify_script_style(resolve_script_text($pack, (string)($post['caption_preview'] ?? $post['captionPreview'] ?? '')));
}

function build_script_fit_lab(?string $date = null, int $windowDays = 14): array
{
    $date = $date ?: today_iso();
    $window = max(7, min(30, $windowDays));
    $from = date('Y-m-d', strtotime($date . ' -' . ($window - 1) . ' days'));
    $order = script_style_order();
    $statusLabel = ['hot' => 'ร้อน', 'steady' => 'นิ่ง', 'cold' => 'เย็น', 'no_data' => 'ยังไม่มีข้อมูล'];
    $confLabel = ['thin' => 'ข้อมูลบาง', 'ok' => 'พอใช้', 'solid' => 'หนาขึ้น'];

    $products = all_products();
    $byId = [];
    foreach ($products as $p) $byId[$p['id']] = $p;

    $stmt = db()->prepare("SELECT * FROM schedule WHERE status='posted' AND metrics_at IS NOT NULL AND post_date BETWEEN ? AND ?");
    $stmt->execute([$from, $date]);
    $posted = $stmt->fetchAll() ?: [];

    $byBand = [];
    foreach ($order as $b) $byBand[$b] = [];
    $allComm = [];
    $packCache = [];
    foreach ($posted as $row) {
        $packId = (string)($row['content_pack_id'] ?? '');
        if ($packId !== '' && !isset($packCache[$packId])) {
            $pstmt = db()->prepare('SELECT * FROM content_packs WHERE id=?');
            $pstmt->execute([$packId]);
            $prow = $pstmt->fetch();
            if ($prow) {
                $script = json_decode((string)($prow['tiktok_script'] ?? '{}'), true) ?: [];
                $packCache[$packId] = [
                    'hooks' => decode_list($prow['hooks'] ?? '[]'),
                    'reelsCaption' => (string)($prow['reels_caption'] ?? ''),
                    'videoPriorityNote' => (string)($prow['video_priority_note'] ?? ''),
                    'tiktokScript' => is_array($script) ? $script : [],
                ];
            } else {
                $packCache[$packId] = null;
            }
        }
        $pack = $packCache[$packId] ?? null;
        if (!$pack) {
            $lp = latest_pack((string)$row['product_id']);
            $pack = $lp ? [
                'hooks' => $lp['hooks'] ?? [],
                'reelsCaption' => (string)($lp['reelsCaption'] ?? ''),
                'videoPriorityNote' => (string)($lp['videoPriorityNote'] ?? ''),
                'tiktokScript' => $lp['tiktokScript'] ?? [],
            ] : [];
        }
        $key = script_style_of([
            'caption_preview' => (string)($row['caption_preview'] ?? ''),
            'content_pack_id' => $packId,
        ], $pack);
        $byBand[$key][] = $row;
        $allComm[] = (float)($row['commission_earned'] ?? 0);
    }

    $postedN = count($posted);
    $globalAvgCommission = $postedN > 0 ? array_sum($allComm) / $postedN : 0.0;

    $bands = [];
    foreach ($order as $band) {
        $list = $byBand[$band] ?? [];
        $samples = count($list);
        $views = array_map(fn($p) => (float)($p['views'] ?? 0), $list);
        $clicks = array_map(fn($p) => (float)($p['clicks'] ?? 0), $list);
        $orders = array_map(fn($p) => (float)($p['orders_count'] ?? 0), $list);
        $comms = array_map(fn($p) => (float)($p['commission_earned'] ?? 0), $list);
        $avgViews = $samples ? array_sum($views) / $samples : 0.0;
        $avgClicks = $samples ? array_sum($clicks) / $samples : 0.0;
        $avgOrders = $samples ? array_sum($orders) / $samples : 0.0;
        $avgCommission = $samples ? array_sum($comms) / $samples : 0.0;
        $totalViews = array_sum($views);
        $totalClicks = array_sum($clicks);
        $totalOrders = array_sum($orders);
        $avgCtr = $totalViews > 0 ? $totalClicks / $totalViews : 0.0;
        $avgOrdersPerClick = $totalClicks > 0 ? $totalOrders / $totalClicks : 0.0;
        $share = $postedN > 0 ? $samples / $postedN : 0.0;

        if ($samples === 0) {
            $score = 0;
            $status = 'no_data';
            $confidence = 'thin';
        } else {
            $commBase = $globalAvgCommission > 0
                ? max(0, min(70, ($avgCommission / $globalAvgCommission) * 50))
                : max(0, min(50, $avgCommission * 2));
            $score = $commBase + max(0, min(22, $avgCtr * 220)) + max(0, min(15, $avgOrdersPerClick * 100)) + max(0, min(15, $avgOrders * 8));
            if ($band === 'problem_demo') $score += 5;
            elseif ($band === 'howto') $score += 4;
            elseif (in_array($band, ['before_after', 'unbox', 'pov'], true)) $score += 3;
            elseif ($band === 'flat') $score -= 6;
            if ($share >= 0.7 && $samples >= 3) $score -= 12;
            elseif ($share >= 0.55 && $samples >= 2) $score -= 6;
            if ($samples === 1) $score *= 0.75;
            $score = (int)round(max(0, min(100, $score)));
            $confidence = $samples >= 4 ? 'solid' : ($samples >= 2 ? 'ok' : 'thin');
            $status = ($score >= 65 && $samples >= 2) ? 'hot' : ($score >= 45 ? 'steady' : 'cold');
        }

        if ($samples === 0) {
            $tip = 'ยังไม่มีผลโครงนี้ — ลอง draft 1 ชิ้นแนว “' . script_style_hint($band) . '” แล้วกรอกเมตริก';
        } elseif ($band === 'flat') {
            $tip = 'โครงไม่ชัด — ใส่ป้ายโครงสคริปต์ให้ชัด แล้ว regenerate ก่อน Approve';
        } elseif ($status === 'hot') {
            $tip = 'โครงนี้ดูเวิร์กกว่าในหน้าต่างนี้ (ทดลอง) — ใช้ถ่ายก่อนได้ แต่สลับสินค้า/ช่องเพื่อไม่ให้ซ้ำ';
        } elseif ($status === 'cold') {
            $tip = 'ผลเย็นในโครงนี้ — ลองปรับโครงสคริปต์หรือ regenerate ก่อนโพสต์ซ้ำ';
        } elseif ($share >= 0.55) {
            $tip = 'ใช้โครงนี้บ่อย (' . round($share * 100) . '%) — กระจายปัญหา→สาธิต/วิธีใช้/ก่อน–หลัง เพื่อลดความซ้ำ';
        } else {
            $tip = 'เก็บข้อมูลต่ออีก 1–2 โพสต์ในโครงนี้ก่อนสรุป — ตัวเลขยังเป็นสมมติฐาน';
        }

        $bands[] = [
            'band' => $band,
            'bandLabel' => script_style_label($band),
            'rangeLabel' => script_style_range($band),
            'samples' => $samples,
            'avgViews' => round($avgViews, 1),
            'avgClicks' => round($avgClicks, 1),
            'avgOrders' => round($avgOrders, 2),
            'avgCommission' => round($avgCommission, 1),
            'avgCtr' => round($avgCtr, 2),
            'avgOrdersPerClick' => round($avgOrdersPerClick, 2),
            'score' => $score,
            'status' => $status,
            'confidence' => $confidence,
            'shareOfPosts' => round($share, 2),
            'tip' => $tip,
        ];
    }

    usort($bands, fn($a, $b) => ($b['score'] <=> $a['score']) ?: ($b['samples'] <=> $a['samples']));
    $withData = array_values(array_filter($bands, fn($b) => $b['samples'] > 0));
    $hot = count(array_filter($bands, fn($b) => $b['status'] === 'hot'));
    $flatSamples = count($byBand['flat'] ?? []);
    $topShare = 0.0;
    foreach ($bands as $b) $topShare = max($topShare, (float)$b['shareOfPosts']);
    $unbalanced = $topShare >= 0.55 && $postedN >= 3;
    $scoredAvg = $withData ? array_sum(array_column($withData, 'score')) / count($withData) : 0.0;
    $labScore = (int)round($scoredAvg);
    if (count($withData) >= 3) $labScore = min(100, $labScore + 8);
    elseif (count($withData) === 1 && $postedN >= 3) $labScore = max(0, $labScore - 10);
    if ($unbalanced) $labScore = max(0, $labScore - 8);
    if ($flatSamples > 0) $labScore = max(0, $labScore - 4);
    $labScore = max(0, min(100, $labScore));
    $grade = count($withData) === 0 ? 'D' : ($labScore >= 75 ? 'A' : ($labScore >= 58 ? 'B' : ($labScore >= 40 ? 'C' : 'D')));

    $best = null;
    foreach ($withData as $b) {
        if ($b['status'] === 'hot' && $b['band'] !== 'flat') { $best = $b; break; }
    }
    if (!$best) {
        foreach ($withData as $b) {
            if ($b['band'] !== 'flat') { $best = $b; break; }
        }
    }
    if (!$best && $withData) $best = $withData[0];

    if ($postedN === 0) {
        $mixTip = 'ยังไม่มีเมตริกรายโครงสคริปต์ — โพสต์มือแล้วกรอกผลที่ Results ก่อนจัดมิกซ์โครงคลิป';
        $summary = 'Script Fit Lab: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลหลังโพสต์มือก่อนจัดอันดับโครงสคริปต์';
    } elseif ($flatSamples > 0 && $flatSamples >= (int)ceil($postedN / 2)) {
        $mixTip = "พบโครง flat {$flatSamples} ชิ้น — ใส่ป้ายโครงสคริปต์ให้ชัดก่อน Approve (ทดลอง)";
        $summary = "Script Fit Lab: {$postedN} โพสต์มีเมตริก · โครงที่มีข้อมูล " . count($withData) . " · ร้อน {$hot} · flat {$flatSamples}" . ($unbalanced ? ' · มิกซ์เอนข้างเดียว' : '');
    } elseif ($unbalanced && $best) {
        $mixTip = 'มิกซ์เอนไปโครง ' . $best['bandLabel'] . ' มาก — วันถัดไปลองสลับโครงคลิป 1 ชิ้น (ทดลอง)';
        $summary = "Script Fit Lab: {$postedN} โพสต์มีเมตริก · โครงที่มีข้อมูล " . count($withData) . " · ร้อน {$hot}" . ($flatSamples ? " · flat {$flatSamples}" : '') . ' · มิกซ์เอนข้างเดียว';
    } elseif ($best) {
        $mixTip = 'โครงเด่น: ' . $best['bandLabel'] . ' — ใช้ถ่ายก่อนเป็นสมมติฐาน ไม่ล็อคทุกคลิป';
        $summary = "Script Fit Lab: {$postedN} โพสต์มีเมตริก · โครงที่มีข้อมูล " . count($withData) . " · ร้อน {$hot}" . ($flatSamples ? " · flat {$flatSamples}" : '');
    } else {
        $mixTip = 'เก็บผลต่ออีก 2–3 คลิปข้ามโครงก่อนจัดอันดับมิกซ์';
        $summary = "Script Fit Lab: {$postedN} โพสต์มีเมตริก · โครงที่มีข้อมูล " . count($withData) . " · ร้อน {$hot}";
    }

    $preferred = null;
    foreach ($bands as $b) {
        if ($b['status'] === 'hot' && $b['band'] !== 'flat') { $preferred = $b; break; }
    }
    if (!$preferred) {
        foreach ($bands as $b) {
            if ($b['status'] === 'steady' && $b['samples'] > 0 && $b['band'] !== 'flat') { $preferred = $b; break; }
        }
    }
    if (!$preferred) {
        foreach ($bands as $b) {
            if ($b['band'] === 'problem_demo') { $preferred = $b; break; }
        }
    }

    $stmtToday = db()->prepare("SELECT * FROM schedule WHERE post_date=? AND status IN ('draft','approved') ORDER BY suggested_time ASC LIMIT 6");
    $stmtToday->execute([$date]);
    $todaySlots = $stmtToday->fetchAll() ?: [];
    $suggestions = [];
    foreach ($todaySlots as $slot) {
        if (!$preferred) break;
        $pid = (string)$slot['product_id'];
        $product = $byId[$pid] ?? null;
        if (!$product) continue;
        $packId = (string)($slot['content_pack_id'] ?? '');
        $pack = null;
        if ($packId !== '') {
            $pstmt = db()->prepare('SELECT * FROM content_packs WHERE id=?');
            $pstmt->execute([$packId]);
            $prow = $pstmt->fetch();
            if ($prow) {
                $script = json_decode((string)($prow['tiktok_script'] ?? '{}'), true) ?: [];
                $pack = [
                    'hooks' => decode_list($prow['hooks'] ?? '[]'),
                    'reelsCaption' => (string)($prow['reels_caption'] ?? ''),
                    'videoPriorityNote' => (string)($prow['video_priority_note'] ?? ''),
                    'tiktokScript' => is_array($script) ? $script : [],
                ];
            }
        }
        $currentKey = script_style_of(['caption_preview' => (string)($slot['caption_preview'] ?? '')], $pack);
        $currentRow = null;
        foreach ($bands as $b) {
            if ($b['band'] === $currentKey) { $currentRow = $b; break; }
        }
        $same = $currentKey === $preferred['band'];
        $currentCold = $currentKey === 'flat' || ($currentRow && ($currentRow['status'] === 'cold' || ($currentRow['status'] === 'no_data' && $preferred['status'] === 'hot')));
        $preview = mb_substr((string)($slot['caption_preview'] ?? ''), 0, 80) ?: '(ไม่มีแคปชัน)';
        if ($currentCold && !$same) {
            $suggestions[] = [
                'scheduleId' => (string)$slot['id'],
                'productId' => $pid,
                'productName' => (string)$product['name'],
                'currentBand' => $currentKey,
                'currentLabel' => script_style_label($currentKey),
                'suggestedBand' => $preferred['band'],
                'suggestedLabel' => $preferred['bandLabel'],
                'captionPreview' => $preview,
                'status' => (string)$slot['status'],
                'channelLabel' => channel_label((string)$slot['channel']),
                'reason' => script_style_label($currentKey) . ' เย็น/ไม่ชัด · ' . $preferred['bandLabel'] . ' ดูดีกว่าในหน้าต่างนี้ (ทดลอง)',
                'tip' => 'ไม่แก้สคริปต์อัตโนมัติ — regenerate หรือแก้มือ แล้ว Approve ก่อนโพสต์',
            ];
        }
        if (count($suggestions) >= 5) break;
    }

    $actions = [];
    if ($postedN === 0) {
        $actions[] = ['id' => 'need-metrics', 'title' => 'เริ่มเก็บผลรายโครงสคริปต์', 'detail' => 'Approve → โพสต์มือ → กรอก views/clicks/orders ที่ Results อย่างน้อย 1 ชิ้นต่อโครง'];
    }
    if ($flatSamples > 0) {
        $actions[] = ['id' => 'clarify-flat', 'title' => 'ทำให้โครงสคริปต์ชัดขึ้น', 'detail' => "พบ {$flatSamples} โพสต์โครงไม่ชัด — ใส่ป้ายโครง (ปัญหา→สาธิต/วิธีใช้/ก่อน–หลัง) แล้ว regenerate ก่อน Approve"];
    }
    if ($best && $best['status'] === 'hot' && $best['band'] !== 'flat') {
        $actions[] = ['id' => 'lean-script', 'title' => 'ถ่ายก่อนด้วยโครง ' . $best['bandLabel'], 'detail' => 'n=' . $best['samples'] . ' · คะแนนฟิต ~' . $best['score'] . ' — ใช้ 1–2 สล็อต · ' . script_style_hint($best['band'])];
    }
    if ($unbalanced) {
        $actions[] = ['id' => 'diversify', 'title' => 'กระจายมิกซ์โครงคลิป', 'detail' => 'โครงเด่นกินสัดส่วนสูง — เพิ่ม draft คนละโครง 1 ชิ้นในรอบถัดไป (กันสแปมฟีล)'];
    }
    $actions[] = ['id' => 'compliance', 'title' => 'คงกฎ Approve + disclosure + ไม่ขายแข็ง', 'detail' => 'ทุกแคปชัน/คลิปต้องมี disclosure affiliate และผ่าน Approve ก่อนโพสต์มือ — ระบบไม่โพสต์อัตโนมัติ'];
    $actions = array_slice($actions, 0, 5);

    $lines = [
        "Script Fit Lab {$date}: เกรด {$grade} ({$labScore}/100) · {$summary}",
        $mixTip,
    ];
    foreach (array_slice($withData, 0, 3) as $b) {
        $lines[] = $statusLabel[$b['status']] . ' · ' . $b['bandLabel'] . ': คะแนน ' . $b['score'] . ' (' . $confLabel[$b['confidence']] . ', n=' . $b['samples'] . ', CTR ~' . round($b['avgCtr'] * 100, 1) . '%)';
    }
    foreach (array_slice($suggestions, 0, 2) as $s) {
        $lines[] = 'แนะนำทดลอง · ' . $s['productName'] . ': ' . $s['currentLabel'] . ' → ' . $s['suggestedLabel'];
    }
    $lines[] = INCOME_DISCLAIMER;

    return [
        'date' => $date,
        'fromDate' => $from,
        'windowDays' => $window,
        'grade' => $grade,
        'score' => $labScore,
        'summary' => $summary,
        'counts' => [
            'postsWithMetrics' => $postedN,
            'bandsWithData' => count($withData),
            'unbalanced' => $unbalanced,
            'suggestions' => count($suggestions),
            'hot' => $hot,
            'flatSamples' => $flatSamples,
        ],
        'bands' => $bands,
        'mixTip' => $mixTip,
        'suggestions' => array_slice($suggestions, 0, 5),
        'actions' => $actions,
        'checklist' => [
            'อันดับโครงสคริปต์มาจากเมตริกที่คุณกรอกเอง — ไม่ดึง API แพลตฟอร์ม',
            'คะแนนฟิตเป็นสมมติฐานทดลอง ไม่การันตียอดขาย/ค่าคอม',
            'คำแนะนำสลับโครงเป็นคำแนะนำเท่านั้น — ต้องแก้เอง + Approve',
            'หลีกเลี่ยงโครงไม่ชัดและคำโฆษณาเกินจริงในคลิป',
            'ทุกโพสต์ต้องมี disclosure และน้ำเสียงช่วยเลือกของ',
        ],
        'lines' => $lines,
        'disclaimer' => INCOME_DISCLAIMER,
    ];
}

function script_fit_lab_to_markdown(array $lab): string
{
    $bandRows = [];
    foreach ($lab['bands'] as $b) {
        if (($b['samples'] ?? 0) <= 0) continue;
        $statusLabel = ['hot' => 'ร้อน', 'steady' => 'นิ่ง', 'cold' => 'เย็น', 'no_data' => 'ยังไม่มีข้อมูล'][$b['status']] ?? $b['status'];
        $confLabel = ['thin' => 'ข้อมูลบาง', 'ok' => 'พอใช้', 'solid' => 'หนาขึ้น'][$b['confidence']] ?? $b['confidence'];
        $n = count($bandRows) + 1;
        $bandRows[] = "{$n}. **[{$statusLabel}]** {$b['bandLabel']} ({$b['rangeLabel']}) · คะแนน {$b['score']}/100 · n={$b['samples']} · {$confLabel}\n"
            . '   CTR ~' . round($b['avgCtr'] * 100, 1) . "% · ออเดอร์/คลิก ~{$b['avgOrdersPerClick']} · ค่าคอมเฉลี่ย ฿{$b['avgCommission']}\n"
            . '   สัดส่วนในหน้าต่าง ~' . round($b['shareOfPosts'] * 100) . "%\n"
            . "   {$b['tip']}";
    }
    if (!$bandRows) $bandRows[] = '_(ยังไม่มีข้อมูล)_';

    $suggestionRows = [];
    foreach ($lab['suggestions'] as $i => $s) {
        $n = $i + 1;
        $suggestionRows[] = "{$n}. {$s['productName']} · {$s['status']} · {$s['channelLabel']}\n"
            . "   preview: {$s['captionPreview']}\n"
            . "   {$s['currentLabel']} → **{$s['suggestedLabel']}**\n"
            . "   {$s['reason']}\n"
            . "   {$s['tip']}";
    }
    if (!$suggestionRows) $suggestionRows[] = '_(ไม่มีคำแนะนำสลับโครงวันนี้)_';

    $actionLines = [];
    foreach ($lab['actions'] as $a) {
        $actionLines[] = "- **{$a['title']}**: {$a['detail']}";
    }
    $checkLines = array_map(fn($c) => "- {$c}", $lab['checklist']);

    return "# Script Fit Lab · {$lab['date']}\n\n"
        . $lab['summary'] . "\n\n"
        . "- เกรดแล็บ: {$lab['grade']} ({$lab['score']}/100)\n"
        . "- หน้าต่าง: {$lab['fromDate']} → {$lab['date']} ({$lab['windowDays']} วัน)\n"
        . "- โพสต์มีเมตริก: {$lab['counts']['postsWithMetrics']}\n"
        . "- โครงที่มีข้อมูล: {$lab['counts']['bandsWithData']}\n"
        . "- ช่วงร้อน: {$lab['counts']['hot']}\n"
        . "- flat: {$lab['counts']['flatSamples']}\n"
        . '- มิกซ์เอนข้างเดียว: ' . (!empty($lab['counts']['unbalanced']) ? 'ใช่' : 'ไม่') . "\n\n"
        . "## มิกซ์ทิป\n"
        . $lab['mixTip'] . "\n\n"
        . "## อันดับโครงสคริปต์วิดีโอสั้น (ทดลอง)\n"
        . implode("\n", $bandRows) . "\n\n"
        . "## คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)\n"
        . implode("\n", $suggestionRows) . "\n\n"
        . "## Actions\n"
        . implode("\n", $actionLines) . "\n\n"
        . "## Checklist\n"
        . implode("\n", $checkLines) . "\n\n"
        . $lab['disclaimer'] . "\n";
}


/**
 * Proof Fit Lab — soft ranking of social-proof / credibility framing from logged metrics.
 */
function proof_style_order(): array
{
    return ['used_real', 'compare_help', 'spec_point', 'situation', 'soft_popular', 'none'];
}

function proof_style_label(string $band): string
{
    return [
        'used_real' => 'หลักฐานใช้จริง / ลองเอง',
        'compare_help' => 'หลักฐานเทียบตัวเลือก',
        'spec_point' => 'หลักฐานชี้สเปก 1 ข้อ',
        'situation' => 'หลักฐานสถานการณ์ปัญหา',
        'soft_popular' => 'หลักฐานคนถามบ่อย (เบา)',
        'none' => 'ไม่มีสัญญาณหลักฐาน',
    ][$band] ?? $band;
}

function proof_style_range(string $band): string
{
    return [
        'used_real' => 'บอกว่าลองใช้ / ใช้จริงสั้น ๆ ไม่โอเวอร์เคลมผล',
        'compare_help' => 'เทียบตัวเลือก 1–2 ข้อแบบช่วยตัดสินใจ',
        'spec_point' => 'ชี้จุดสเปกหรือจุดที่ชอบ 1 ข้อชัด',
        'situation' => 'เล่าสถานการณ์ pain จริงสั้น ๆ แล้วแชร์ตัวเลือก',
        'soft_popular' => 'คนถามบ่อย / น่าลองดู — ไม่เคลมยอดขายมหาศาล',
        'none' => 'ไม่มีสัญญาณหลักฐานหรือ credibility ในแคปชัน/สคริปต์',
    ][$band] ?? '';
}

function proof_style_hint(string $band): string
{
    return [
        'used_real' => 'บอกสั้น ๆ ว่าลองใช้แล้วชอบจุดไหน 1 ข้อ + disclosure',
        'compare_help' => 'เทียบของเดิม/ตัวเลือกอื่นเบา ๆ แล้วให้ดูสเปกต่อเอง',
        'spec_point' => 'ชี้สเปกหรือจุดขาย 1 ข้อ ไม่ยัดยาว',
        'situation' => 'เปิดด้วยสถานการณ์ปัญหา → แชร์ตัวเลือก ไม่เร่งซื้อ',
        'soft_popular' => 'คนถามบ่อย / น่าลอง — ห้ามเคลมปังแน่นอนหรือยอดขายเท็จ',
        'none' => 'ใส่ป้ายหลักฐาน (ใช้จริง / เทียบเลือก / สเปก / สถานการณ์) ให้ชัดก่อน Approve',
    ][$band] ?? '';
}

function resolve_proof_text(?array $pack, string $captionPreview = ''): string
{
    $parts = [];
    if (trim($captionPreview) !== '') $parts[] = trim($captionPreview);
    if ($pack) {
        foreach (['facebookCaption', 'facebookGroupCaption', 'reelsCaption', 'videoPriorityNote'] as $k) {
            if (!empty($pack[$k])) $parts[] = (string)$pack[$k];
        }
        $script = $pack['tiktokScript'] ?? [];
        if (is_array($script)) {
            foreach (($script['scenes'] ?? []) as $s) {
                if (!is_array($s)) continue;
                foreach (['line', 'visual'] as $k) {
                    if (!empty($s[$k])) $parts[] = (string)$s[$k];
                }
            }
            if (!empty($script['voiceover'])) $parts[] = (string)$script['voiceover'];
        }
        if (!empty($pack['sellingAngles']) && is_array($pack['sellingAngles'])) {
            $parts[] = implode(' ', array_slice($pack['sellingAngles'], 0, 3));
        }
        if (!empty($pack['hooks']) && is_array($pack['hooks'])) {
            $parts[] = implode(' ', array_slice($pack['hooks'], 0, 2));
        }
    }
    return implode("\n", $parts);
}

function classify_proof_style(string $raw): string
{
    $raw = trim($raw);
    if ($raw === '') return 'none';

    if (preg_match('/หลักฐานใช้จริง|หลักฐานเทียบ(?:ตัวเลือก|เลือก)?|หลักฐานสเปก|หลักฐานสถานการณ์|หลักฐานยอดนิยม(?:เบา)?/iu', $raw, $m)) {
        $label = mb_strtolower($m[0]);
        if (str_contains($label, 'ใช้จริง')) return 'used_real';
        if (str_contains($label, 'เทียบ')) return 'compare_help';
        if (str_contains($label, 'สเปก')) return 'spec_point';
        if (str_contains($label, 'สถานการณ์')) return 'situation';
        if (str_contains($label, 'ยอดนิยม')) return 'soft_popular';
    }

    $used = (bool)preg_match('/หลักฐานใช้จริง|ใช้จริง|ลองใช้|ลองเอง|ของที่ได้ลอง|used.?real|tried it|i tried|ลองมาแล้ว/iu', $raw);
    $compare = (bool)preg_match('/หลักฐานเทียบ|เทียบตัวเลือก|เทียบของ|เทียบสเปก|compare|ช่วยเลือก|ช่วยตัดสินใจ|ของเดิม/iu', $raw);
    $spec = (bool)preg_match('/หลักฐานสเปก|ชี้สเปก|จุดที่ชอบ|จุดขาย|สเปกชัด|spec.?point|รายละเอียดสำคัญ/iu', $raw);
    $situation = (bool)preg_match('/หลักฐานสถานการณ์|สถานการณ์|เคยเจอไหม|ปัญหาคือ|วันหนึ่ง|situation|pain.?scene/iu', $raw);
    $popular = (bool)preg_match('/หลักฐานยอดนิยม|คนถามบ่อย|น่าลองดู|หลายคนสนใจ|soft.?popular|popular.?soft|ยอดนิยมเบา/iu', $raw);

    if ($used) return 'used_real';
    if ($compare) return 'compare_help';
    if ($situation) return 'situation';
    if ($spec) return 'spec_point';
    if ($popular) return 'soft_popular';
    return 'none';
}

function proof_style_of(array $post, ?array $pack = null): string
{
    return classify_proof_style(resolve_proof_text($pack, (string)($post['caption_preview'] ?? $post['captionPreview'] ?? '')));
}

function build_proof_fit_lab(?string $date = null, int $windowDays = 14): array
{
    $date = $date ?: today_iso();
    $window = max(7, min(30, $windowDays));
    $from = date('Y-m-d', strtotime($date . ' -' . ($window - 1) . ' days'));
    $order = proof_style_order();
    $packs = [];
    foreach (all_content_packs() as $p) $packs[$p['id']] = $p;
    $products = [];
    foreach (all_products() as $p) $products[$p['id']] = $p;

    $stmt = db()->prepare("SELECT * FROM schedule WHERE status='posted' AND metrics_at IS NOT NULL AND post_date>=? AND post_date<=?");
    $stmt->execute([$from, $date]);
    $posted = $stmt->fetchAll();

    $byBand = [];
    foreach ($order as $b) $byBand[$b] = [];
    foreach ($posted as $row) {
        $pack = $packs[$row['content_pack_id']] ?? null;
        $post = [
            'captionPreview' => $row['caption_preview'] ?? '',
            'contentPackId' => $row['content_pack_id'],
        ];
        $key = proof_style_of($post, $pack);
        $byBand[$key][] = $row;
    }

    $allComm = array_map(fn($r) => (float)$r['commission_earned'], $posted);
    $globalAvg = $allComm ? array_sum($allComm) / count($allComm) : 0.0;
    $postedN = count($posted);

    $bands = [];
    foreach ($order as $band) {
        $list = $byBand[$band] ?? [];
        $samples = count($list);
        $views = array_map(fn($r) => (int)$r['views'], $list);
        $clicks = array_map(fn($r) => (int)$r['clicks'], $list);
        $orders = array_map(fn($r) => (int)$r['orders_count'], $list);
        $comms = array_map(fn($r) => (float)$r['commission_earned'], $list);
        $avgViews = $samples ? array_sum($views) / $samples : 0;
        $avgClicks = $samples ? array_sum($clicks) / $samples : 0;
        $avgOrders = $samples ? array_sum($orders) / $samples : 0;
        $avgCommission = $samples ? array_sum($comms) / $samples : 0;
        $totalViews = array_sum($views);
        $totalClicks = array_sum($clicks);
        $totalOrders = array_sum($orders);
        $avgCtr = $totalViews > 0 ? $totalClicks / $totalViews : 0;
        $avgOpc = $totalClicks > 0 ? $totalOrders / $totalClicks : 0;
        $share = $postedN > 0 ? $samples / $postedN : 0;

        $score = 0;
        if ($samples > 0) {
            $commBase = $globalAvg > 0 ? max(0, min(70, ($avgCommission / $globalAvg) * 50)) : max(0, min(50, $avgCommission * 2));
            $ctrScore = max(0, min(22, $avgCtr * 220));
            $opcScore = max(0, min(15, $avgOpc * 100));
            $orderScore = max(0, min(15, $avgOrders * 8));
            $score = $commBase + $ctrScore + $opcScore + $orderScore;
            $nudge = ['used_real' => 5, 'compare_help' => 4, 'situation' => 4, 'spec_point' => 3, 'soft_popular' => 2, 'none' => -6][$band] ?? 0;
            $score += $nudge;
            if ($share >= 0.7 && $samples >= 3) $score -= 12;
            elseif ($share >= 0.55 && $samples >= 2) $score -= 6;
            if ($samples === 1) $score *= 0.75;
            $score = (int)round(max(0, min(100, $score)));
        }

        $confidence = $samples >= 4 ? 'solid' : ($samples >= 2 ? 'ok' : 'thin');
        $status = $samples === 0 ? 'no_data' : ($score >= 65 && $samples >= 2 ? 'hot' : ($score >= 45 ? 'steady' : 'cold'));
        $row = [
            'band' => $band,
            'bandLabel' => proof_style_label($band),
            'rangeLabel' => proof_style_range($band),
            'samples' => $samples,
            'avgViews' => round($avgViews, 1),
            'avgClicks' => round($avgClicks, 1),
            'avgOrders' => round($avgOrders, 2),
            'avgCommission' => round($avgCommission, 1),
            'avgCtr' => round($avgCtr, 2),
            'avgOrdersPerClick' => round($avgOpc, 2),
            'score' => $score,
            'status' => $status,
            'confidence' => $confidence,
            'shareOfPosts' => round($share, 2),
            'tip' => '',
        ];
        if ($samples === 0) {
            $row['tip'] = 'ยังไม่มีผลหลักฐานนี้ — ลอง draft 1 ชิ้นแนว “' . proof_style_hint($band) . '” แล้วกรอกเมตริก';
        } elseif ($band === 'none') {
            $row['tip'] = 'ไม่มีสัญญาณหลักฐาน — ใส่ป้ายหลักฐานให้ชัด แล้ว regenerate ก่อน Approve';
        } elseif ($status === 'hot') {
            $row['tip'] = 'หลักฐานนี้ดูเวิร์กกว่าในหน้าต่างนี้ (ทดลอง) — ใช้ได้ แต่สลับสินค้า/ช่องเพื่อไม่ให้ซ้ำ';
        } elseif ($status === 'cold') {
            $row['tip'] = 'ผลเย็นในหลักฐานนี้ — ลองปรับมุมหลักฐานหรือ regenerate ก่อนโพสต์ซ้ำ';
        } elseif ($share >= 0.55) {
            $row['tip'] = 'ใช้หลักฐานนี้บ่อย (' . round($share * 100) . '%) — กระจายใช้จริง/เทียบเลือก/สถานการณ์ เพื่อลดความซ้ำ';
        } else {
            $row['tip'] = 'เก็บข้อมูลต่ออีก 1–2 โพสต์ในหลักฐานนี้ก่อนสรุป — ตัวเลขยังเป็นสมมติฐาน';
        }
        $bands[] = $row;
    }
    usort($bands, fn($a, $b) => ($b['score'] <=> $a['score']) ?: ($b['samples'] <=> $a['samples']));

    $withData = array_values(array_filter($bands, fn($b) => $b['samples'] > 0));
    $hot = count(array_filter($bands, fn($b) => $b['status'] === 'hot'));
    $noneSamples = count($byBand['none'] ?? []);
    $topShare = max(0, ...array_map(fn($b) => $b['shareOfPosts'], $bands));
    $unbalanced = $topShare >= 0.55 && $postedN >= 3;
    $scoredAvg = $withData ? array_sum(array_column($withData, 'score')) / count($withData) : 0;
    $labScore = (int)round($scoredAvg);
    if (count($withData) >= 3) $labScore = min(100, $labScore + 8);
    elseif (count($withData) === 1 && $postedN >= 3) $labScore = max(0, $labScore - 10);
    if ($unbalanced) $labScore = max(0, $labScore - 8);
    if ($noneSamples > 0) $labScore = max(0, $labScore - 4);
    $labScore = max(0, min(100, $labScore));
    $grade = count($withData) === 0 ? 'D' : ($labScore >= 75 ? 'A' : ($labScore >= 58 ? 'B' : ($labScore >= 40 ? 'C' : 'D')));

    $best = null;
    foreach ($withData as $b) {
        if ($b['status'] === 'hot' && $b['band'] !== 'none') { $best = $b; break; }
    }
    if (!$best) {
        foreach ($withData as $b) {
            if ($b['band'] !== 'none') { $best = $b; break; }
        }
    }
    if (!$best && $withData) $best = $withData[0];

    if ($postedN === 0) {
        $mixTip = 'ยังไม่มีเมตริกรายหลักฐาน — โพสต์มือแล้วกรอกผลที่หน้า Results ก่อนจัดมิกซ์หลักฐาน';
        $summary = 'Proof Fit Lab: ยังไม่มีเมตริกในหน้าต่างนี้ — กรอกผลหลังโพสต์มือก่อนจัดอันดับหลักฐาน';
    } elseif ($noneSamples > 0 && $noneSamples >= (int)ceil($postedN / 2)) {
        $mixTip = "พบหลักฐาน none {$noneSamples} ชิ้น — ใส่ป้ายหลักฐานให้ชัดก่อน Approve (ทดลอง)";
        $summary = "Proof Fit Lab: {$postedN} โพสต์มีเมตริก · หลักฐานที่มีข้อมูล " . count($withData) . " · ร้อน {$hot} · none {$noneSamples}" . ($unbalanced ? ' · มิกซ์เอนข้างเดียว' : '');
    } elseif ($unbalanced && $best) {
        $mixTip = 'มิกซ์เอนไปหลักฐาน ' . $best['bandLabel'] . ' มาก — วันถัดไปลองสลับหลักฐาน 1 ชิ้น (ทดลอง)';
        $summary = "Proof Fit Lab: {$postedN} โพสต์มีเมตริก · หลักฐานที่มีข้อมูล " . count($withData) . " · ร้อน {$hot}" . ($noneSamples ? " · none {$noneSamples}" : '') . ' · มิกซ์เอนข้างเดียว';
    } elseif ($best) {
        $mixTip = 'หลักฐานเด่น: ' . $best['bandLabel'] . ' — ใช้เป็นสมมติฐาน ไม่ล็อคทุกโพสต์';
        $summary = "Proof Fit Lab: {$postedN} โพสต์มีเมตริก · หลักฐานที่มีข้อมูล " . count($withData) . " · ร้อน {$hot}" . ($noneSamples ? " · none {$noneSamples}" : '');
    } else {
        $mixTip = 'เก็บผลต่ออีก 2–3 โพสต์ข้ามหลักฐานก่อนจัดอันดับมิกซ์';
        $summary = "Proof Fit Lab: {$postedN} โพสต์มีเมตริก · หลักฐานที่มีข้อมูล " . count($withData) . " · ร้อน {$hot}";
    }

    $preferred = null;
    foreach ($bands as $b) {
        if ($b['status'] === 'hot' && $b['band'] !== 'none') { $preferred = $b; break; }
    }
    if (!$preferred) {
        foreach ($bands as $b) {
            if ($b['status'] === 'steady' && $b['samples'] > 0 && $b['band'] !== 'none') { $preferred = $b; break; }
        }
    }
    if (!$preferred) {
        foreach ($bands as $b) {
            if ($b['band'] === 'used_real') { $preferred = $b; break; }
        }
    }

    $stmt = db()->prepare("SELECT * FROM schedule WHERE post_date=? AND status IN ('draft','approved') ORDER BY suggested_time ASC LIMIT 6");
    $stmt->execute([$date]);
    $slots = $stmt->fetchAll();
    $suggestions = [];
    foreach ($slots as $slot) {
        if (!$preferred) break;
        $product = $products[$slot['product_id']] ?? null;
        $pack = $packs[$slot['content_pack_id']] ?? null;
        if (!$product) continue;
        $post = ['captionPreview' => $slot['caption_preview'] ?? '', 'contentPackId' => $slot['content_pack_id']];
        $currentKey = proof_style_of($post, $pack);
        $currentRow = null;
        foreach ($bands as $b) if ($b['band'] === $currentKey) { $currentRow = $b; break; }
        $same = $currentKey === $preferred['band'];
        $preview = mb_substr((string)($slot['caption_preview'] ?? ''), 0, 80) ?: '(ไม่มีแคปชัน)';
        $currentCold = $currentKey === 'none' || ($currentRow && ($currentRow['status'] === 'cold' || ($currentRow['status'] === 'no_data' && $preferred['status'] === 'hot')));
        if ($currentCold && !$same) {
            $suggestions[] = [
                'scheduleId' => $slot['id'],
                'productId' => $product['id'],
                'productName' => $product['name'],
                'currentBand' => $currentKey,
                'currentLabel' => proof_style_label($currentKey),
                'suggestedBand' => $preferred['band'],
                'suggestedLabel' => $preferred['bandLabel'],
                'captionPreview' => $preview,
                'status' => $slot['status'],
                'channelLabel' => channel_label($slot['channel']),
                'reason' => proof_style_label($currentKey) . ' เย็น/ไม่ชัด · ' . $preferred['bandLabel'] . ' ดูดีกว่าในหน้าต่างนี้ (ทดลอง)',
                'tip' => 'ไม่แก้แคปชันอัตโนมัติ — regenerate หรือแก้มือ แล้ว Approve ก่อนโพสต์',
            ];
        } elseif ($unbalanced && $same && count($suggestions) < 2) {
            $alt = null;
            foreach ($bands as $b) {
                if ($b['band'] !== $currentKey && $b['band'] !== 'none' && in_array($b['status'], ['steady', 'no_data'], true)) { $alt = $b; break; }
            }
            if (!$alt) {
                foreach ($bands as $b) {
                    if (in_array($b['band'], ['compare_help', 'situation'], true)) { $alt = $b; break; }
                }
            }
            if (!$alt) continue;
            $suggestions[] = [
                'scheduleId' => $slot['id'],
                'productId' => $product['id'],
                'productName' => $product['name'],
                'currentBand' => $currentKey,
                'currentLabel' => proof_style_label($currentKey),
                'suggestedBand' => $alt['band'],
                'suggestedLabel' => $alt['bandLabel'],
                'captionPreview' => $preview,
                'status' => $slot['status'],
                'channelLabel' => channel_label($slot['channel']),
                'reason' => 'วันนี้ซ้อนหลักฐาน ' . proof_style_label($currentKey) . ' — ลองกระจายไป ' . $alt['bandLabel'] . ' เพื่อลดความซ้ำ (ทดลอง)',
                'tip' => 'ระบบไม่เปลี่ยนแคปชันเอง — regenerate draft แล้ว Approve ใหม่',
            ];
        }
    }
    $suggestions = array_slice($suggestions, 0, 5);

    $actions = [];
    if ($postedN === 0) {
        $actions[] = ['id' => 'need-metrics', 'title' => 'เริ่มเก็บผลรายหลักฐาน', 'detail' => 'Approve → โพสต์มือ → กรอก views/clicks/orders ที่ Results อย่างน้อย 1 ชิ้นต่อหลักฐาน'];
    }
    if ($noneSamples > 0) {
        $actions[] = ['id' => 'clarify-none', 'title' => 'ทำให้หลักฐานชัดขึ้น', 'detail' => "พบ {$noneSamples} โพสต์ไม่มีสัญญาณหลักฐาน — ใส่ป้าย (ใช้จริง/เทียบเลือก/สเปก/สถานการณ์) แล้ว regenerate ก่อน Approve"];
    }
    if ($best && $best['status'] === 'hot' && $best['band'] !== 'none') {
        $actions[] = ['id' => 'lean-proof', 'title' => 'เอียงไปหลักฐาน ' . $best['bandLabel'], 'detail' => 'n=' . $best['samples'] . ' · คะแนนฟิต ~' . $best['score'] . ' — ใช้ 1–2 สล็อต · ' . proof_style_hint($best['band'])];
    }
    if ($unbalanced) {
        $actions[] = ['id' => 'diversify', 'title' => 'กระจายมิกซ์หลักฐาน', 'detail' => 'หลักฐานเด่นกินสัดส่วนสูง — เพิ่ม draft คนละหลักฐาน 1 ชิ้นในรอบถัดไป (กันสแปมฟีล)'];
    }
    $actions[] = ['id' => 'compliance', 'title' => 'คงกฎ Approve + disclosure + ไม่หลอกลวง', 'detail' => 'ห้ามเคลมรีวิวปลอม/ยอดขายเท็จ — ทุกแคปชันต้องมี disclosure และผ่าน Approve ก่อนโพสต์มือ'];
    $actions = array_slice($actions, 0, 5);

    $checklist = [
        'อันดับหลักฐานมาจากเมตริกที่คุณกรอกเอง — ไม่ดึง API แพลตฟอร์ม',
        'คะแนนฟิตเป็นสมมติฐานทดลอง ไม่การันตียอดขาย/ค่าคอม',
        'คำแนะนำสลับหลักฐานเป็นคำแนะนำเท่านั้น — ต้องแก้เอง + Approve',
        'ห้ามใช้รีวิวปลอม คำโฆษณาเกินจริง หรือยอดขายเท็จ',
        'ทุกโพสต์ต้องมี disclosure และน้ำเสียงช่วยเลือกของ',
    ];

    $statusLabel = ['hot' => 'ร้อน', 'steady' => 'นิ่ง', 'cold' => 'เย็น', 'no_data' => 'ยังไม่มีข้อมูล'];
    $confLabel = ['thin' => 'ข้อมูลบาง', 'ok' => 'พอใช้', 'solid' => 'หนาขึ้น'];
    $lines = [
        "Proof Fit Lab {$date}: เกรด {$grade} ({$labScore}/100) · {$summary}",
        $mixTip,
    ];
    foreach (array_slice($withData, 0, 3) as $b) {
        $lines[] = ($statusLabel[$b['status']] ?? $b['status']) . ' · ' . $b['bandLabel'] . ': คะแนน ' . $b['score'] . ' (' . ($confLabel[$b['confidence']] ?? '') . ', n=' . $b['samples'] . ', CTR ~' . round($b['avgCtr'] * 100, 1) . '%)';
    }
    foreach (array_slice($suggestions, 0, 2) as $s) {
        $lines[] = 'แนะนำทดลอง · ' . $s['productName'] . ': ' . $s['currentLabel'] . ' → ' . $s['suggestedLabel'];
    }
    $lines[] = INCOME_DISCLAIMER;

    return [
        'date' => $date,
        'fromDate' => $from,
        'windowDays' => $window,
        'grade' => $grade,
        'score' => $labScore,
        'summary' => $summary,
        'counts' => [
            'postsWithMetrics' => $postedN,
            'bandsWithData' => count($withData),
            'unbalanced' => $unbalanced,
            'suggestions' => count($suggestions),
            'hot' => $hot,
            'noneSamples' => $noneSamples,
        ],
        'bands' => $bands,
        'mixTip' => $mixTip,
        'suggestions' => $suggestions,
        'actions' => $actions,
        'checklist' => $checklist,
        'lines' => $lines,
        'disclaimer' => INCOME_DISCLAIMER,
    ];
}

function proof_fit_lab_to_markdown(array $lab): string
{
    $bandRows = [];
    foreach ($lab['bands'] as $b) {
        if (($b['samples'] ?? 0) <= 0) continue;
        $statusLabel = ['hot' => 'ร้อน', 'steady' => 'นิ่ง', 'cold' => 'เย็น', 'no_data' => 'ยังไม่มีข้อมูล'][$b['status']] ?? $b['status'];
        $confLabel = ['thin' => 'ข้อมูลบาง', 'ok' => 'พอใช้', 'solid' => 'หนาขึ้น'][$b['confidence']] ?? $b['confidence'];
        $n = count($bandRows) + 1;
        $bandRows[] = "{$n}. **[{$statusLabel}]** {$b['bandLabel']} ({$b['rangeLabel']}) · คะแนน {$b['score']}/100 · n={$b['samples']} · {$confLabel}\n"
            . '   CTR ~' . round($b['avgCtr'] * 100, 1) . "% · ออเดอร์/คลิก ~{$b['avgOrdersPerClick']} · ค่าคอมเฉลี่ย ฿{$b['avgCommission']}\n"
            . '   สัดส่วนในหน้าต่าง ~' . round($b['shareOfPosts'] * 100) . "%\n"
            . "   {$b['tip']}";
    }
    if (!$bandRows) $bandRows[] = '_(ยังไม่มีข้อมูล)_';

    $suggestionRows = [];
    foreach ($lab['suggestions'] as $i => $s) {
        $n = $i + 1;
        $suggestionRows[] = "{$n}. {$s['productName']} · {$s['status']} · {$s['channelLabel']}\n"
            . "   preview: {$s['captionPreview']}\n"
            . "   {$s['currentLabel']} → **{$s['suggestedLabel']}**\n"
            . "   {$s['reason']}\n"
            . "   {$s['tip']}";
    }
    if (!$suggestionRows) $suggestionRows[] = '_(ไม่มีคำแนะนำสลับหลักฐานวันนี้)_';

    $actionLines = [];
    foreach ($lab['actions'] as $a) {
        $actionLines[] = "- **{$a['title']}**: {$a['detail']}";
    }
    $checkLines = array_map(fn($c) => "- {$c}", $lab['checklist']);

    return "# Proof Fit Lab · {$lab['date']}\n\n"
        . $lab['summary'] . "\n\n"
        . "- เกรดแล็บ: {$lab['grade']} ({$lab['score']}/100)\n"
        . "- หน้าต่าง: {$lab['fromDate']} → {$lab['date']} ({$lab['windowDays']} วัน)\n"
        . "- โพสต์มีเมตริก: {$lab['counts']['postsWithMetrics']}\n"
        . "- หลักฐานที่มีข้อมูล: {$lab['counts']['bandsWithData']}\n"
        . "- ช่วงร้อน: {$lab['counts']['hot']}\n"
        . "- none: {$lab['counts']['noneSamples']}\n"
        . '- มิกซ์เอนข้างเดียว: ' . (!empty($lab['counts']['unbalanced']) ? 'ใช่' : 'ไม่') . "\n\n"
        . "## มิกซ์ทิป\n"
        . $lab['mixTip'] . "\n\n"
        . "## อันดับหลักฐาน / social proof (ทดลอง)\n"
        . implode("\n", $bandRows) . "\n\n"
        . "## คำแนะนำคิววันนี้ (ไม่เปลี่ยนอัตโนมัติ)\n"
        . implode("\n", $suggestionRows) . "\n\n"
        . "## Actions\n"
        . implode("\n", $actionLines) . "\n\n"
        . "## Checklist\n"
        . implode("\n", $checkLines) . "\n\n"
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
    $channelFitLines = array_slice(build_channel_fit_lab($date)['lines'], 0, 4);
    $categoryFitLines = array_slice(build_category_fit_lab($date)['lines'], 0, 4);
    $priceBandFitLines = array_slice(build_price_band_fit_lab($date)['lines'], 0, 4);
    $commissionBandFitLines = array_slice(build_commission_band_fit_lab($date)['lines'], 0, 4);
    $painClarityFitLines = array_slice(build_pain_clarity_fit_lab($date)['lines'], 0, 4);
    $videoEaseFitLines = array_slice(build_video_ease_fit_lab($date)['lines'], 0, 4);
    $seasonalFitLines = array_slice(build_seasonal_fit_lab($date)['lines'], 0, 4);
    $audienceFitLines = array_slice(build_audience_fit_lab($date)['lines'], 0, 4);
    $hookFitLines = array_slice(build_hook_fit_lab($date)['lines'], 0, 4);
    $ctaFitLines = array_slice(build_cta_fit_lab($date)['lines'], 0, 4);
    $hashtagFitLines = array_slice(build_hashtag_fit_lab($date)['lines'], 0, 4);
    $toneFitLines = array_slice(build_tone_fit_lab($date)['lines'], 0, 4);
    $angleFitLines = array_slice(build_angle_fit_lab($date)['lines'], 0, 4);
    $lengthFitLines = array_slice(build_length_fit_lab($date)['lines'], 0, 4);
    $scriptFitLines = array_slice(build_script_fit_lab($date)['lines'], 0, 4);
    $proofFitLines = array_slice(build_proof_fit_lab($date)['lines'], 0, 4);

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
        ...$channelFitLines,
        ...$categoryFitLines,
        ...$priceBandFitLines,
        ...$commissionBandFitLines,
        ...$painClarityFitLines,
        ...$videoEaseFitLines,
        ...$seasonalFitLines,
        ...$audienceFitLines,
        ...$hookFitLines,
        ...$ctaFitLines,
        ...$hashtagFitLines,
        ...$toneFitLines,
        ...$angleFitLines,
        ...$lengthFitLines,
        ...$scriptFitLines,
        ...$proofFitLines,
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
    $hashtagFitLab = build_hashtag_fit_lab($date);
    $toneFitLab = build_tone_fit_lab($date);
    $angleFitLab = build_angle_fit_lab($date);
    $lengthFitLab = build_length_fit_lab($date);
    $scriptFitLab = build_script_fit_lab($date);
    $proofFitLab = build_proof_fit_lab($date);
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
    foreach (array_slice($channelFitLab['lines'], 0, 5) as $line) {
        $recs[] = $line;
    }
    foreach (array_slice($categoryFitLab['lines'], 0, 5) as $line) {
        $recs[] = $line;
    }
    foreach (array_slice($priceBandFitLab['lines'], 0, 5) as $line) {
        $recs[] = $line;
    }
    foreach (array_slice($commissionBandFitLab['lines'], 0, 5) as $line) {
        $recs[] = $line;
    }
    foreach (array_slice($painClarityFitLab['lines'], 0, 5) as $line) {
        $recs[] = $line;
    }
    foreach (array_slice($videoEaseFitLab['lines'], 0, 5) as $line) {
        $recs[] = $line;
    }
    foreach (array_slice($seasonalFitLab['lines'], 0, 5) as $line) {
        $recs[] = $line;
    }
    foreach (array_slice($audienceFitLab['lines'], 0, 5) as $line) {
        $recs[] = $line;
    }
    foreach (array_slice($hookFitLab['lines'], 0, 5) as $line) {
        $recs[] = $line;
    }
    foreach (array_slice($ctaFitLab['lines'], 0, 5) as $line) {
        $recs[] = $line;
    }
    foreach (array_slice($hashtagFitLab['lines'], 0, 5) as $line) {
        $recs[] = $line;
    }
    foreach (array_slice($toneFitLab['lines'], 0, 5) as $line) {
        $recs[] = $line;
    }
    foreach (array_slice($angleFitLab['lines'], 0, 5) as $line) {
        $recs[] = $line;
    }
    foreach (array_slice($lengthFitLab['lines'], 0, 5) as $line) {
        $recs[] = $line;
    }
    foreach (array_slice($scriptFitLab['lines'], 0, 5) as $line) {
        $recs[] = $line;
    }
    foreach (array_slice($proofFitLab['lines'], 0, 5) as $line) {
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
    if (($channelFitLab['counts']['strong'] ?? 0) > 0 || !empty($channelFitLab['counts']['unbalanced'])) {
        $recs[] = 'Channel Fit: ช่องแข็งแรง ' . $channelFitLab['counts']['strong'] . ' · ' . $channelFitLab['mixTip'];
    }
    if (($categoryFitLab['counts']['hot'] ?? 0) > 0 || !empty($categoryFitLab['counts']['unbalanced'])) {
        $recs[] = 'Category Fit: หมวดร้อน ' . $categoryFitLab['counts']['hot'] . ' · ' . $categoryFitLab['mixTip'];
    }
    if (($priceBandFitLab['counts']['hot'] ?? 0) > 0 || !empty($priceBandFitLab['counts']['unbalanced'])) {
        $recs[] = 'Price Band: ช่วงร้อน ' . $priceBandFitLab['counts']['hot'] . ' · ' . $priceBandFitLab['mixTip'];
    }
    if (($commissionBandFitLab['counts']['hot'] ?? 0) > 0 || !empty($commissionBandFitLab['counts']['unbalanced'])) {
        $recs[] = 'Commission Band: ช่วงร้อน ' . $commissionBandFitLab['counts']['hot'] . ' · ' . $commissionBandFitLab['mixTip'];
    }
    if (($painClarityFitLab['counts']['hot'] ?? 0) > 0 || !empty($painClarityFitLab['counts']['unbalanced'])) {
        $recs[] = 'Pain Clarity: ช่วงร้อน ' . $painClarityFitLab['counts']['hot'] . ' · ' . $painClarityFitLab['mixTip'];
    }
    if (($videoEaseFitLab['counts']['hot'] ?? 0) > 0 || !empty($videoEaseFitLab['counts']['unbalanced'])) {
        $recs[] = 'Video Ease: ช่วงร้อน ' . $videoEaseFitLab['counts']['hot'] . ' · ' . $videoEaseFitLab['mixTip'];
    }
    if (($seasonalFitLab['counts']['hot'] ?? 0) > 0 || !empty($seasonalFitLab['counts']['unbalanced'])) {
        $recs[] = 'Seasonal Fit: ช่วงร้อน ' . $seasonalFitLab['counts']['hot'] . ' · ' . $seasonalFitLab['mixTip'];
    }
    if (($audienceFitLab['counts']['hot'] ?? 0) > 0 || !empty($audienceFitLab['counts']['unbalanced'])) {
        $recs[] = 'Audience Fit: ช่วงร้อน ' . $audienceFitLab['counts']['hot'] . ' · ' . $audienceFitLab['mixTip'];
    }
    if (($hookFitLab['counts']['hot'] ?? 0) > 0 || !empty($hookFitLab['counts']['unbalanced'])) {
        $recs[] = 'Hook Fit: ช่วงร้อน ' . $hookFitLab['counts']['hot'] . ' · ' . $hookFitLab['mixTip'];
    }
    if (($ctaFitLab['counts']['hot'] ?? 0) > 0 || !empty($ctaFitLab['counts']['unbalanced'])) {
        $recs[] = 'CTA Fit: ช่วงร้อน ' . $ctaFitLab['counts']['hot'] . ' · ' . $ctaFitLab['mixTip'];
    }
    if (($hashtagFitLab['counts']['hot'] ?? 0) > 0 || !empty($hashtagFitLab['counts']['unbalanced'])) {
        $recs[] = 'Hashtag Fit: ช่วงร้อน ' . $hashtagFitLab['counts']['hot'] . ' · ' . $hashtagFitLab['mixTip'];
    }
    if (($toneFitLab['counts']['hot'] ?? 0) > 0 || !empty($toneFitLab['counts']['unbalanced']) || ($toneFitLab['counts']['hardPushSamples'] ?? 0) > 0) {
        $recs[] = 'Tone Fit: ช่วงร้อน ' . $toneFitLab['counts']['hot'] . ' · ' . $toneFitLab['mixTip'];
    }
    if (($angleFitLab['counts']['hot'] ?? 0) > 0 || !empty($angleFitLab['counts']['unbalanced']) || ($angleFitLab['counts']['flatSamples'] ?? 0) > 0) {
        $recs[] = 'Angle Fit: ช่วงร้อน ' . $angleFitLab['counts']['hot'] . ' · ' . $angleFitLab['mixTip'];
    }
    if (($lengthFitLab['counts']['hot'] ?? 0) > 0 || !empty($lengthFitLab['counts']['unbalanced']) || ($lengthFitLab['counts']['emptySamples'] ?? 0) > 0) {
        $recs[] = 'Length Fit: ช่วงร้อน ' . $lengthFitLab['counts']['hot'] . ' · ' . $lengthFitLab['mixTip'];
    }
    if (($scriptFitLab['counts']['hot'] ?? 0) > 0 || !empty($scriptFitLab['counts']['unbalanced']) || ($scriptFitLab['counts']['flatSamples'] ?? 0) > 0) {
        $recs[] = 'Script Fit: ช่วงร้อน ' . $scriptFitLab['counts']['hot'] . ' · ' . $scriptFitLab['mixTip'];
    }
    if (($proofFitLab['counts']['hot'] ?? 0) > 0 || !empty($proofFitLab['counts']['unbalanced']) || ($proofFitLab['counts']['noneSamples'] ?? 0) > 0) {
        $recs[] = 'Proof Fit: ช่วงร้อน ' . $proofFitLab['counts']['hot'] . ' · ' . $proofFitLab['mixTip'];
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
