<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

function install_schema(bool $seed = true): void
{
    $pdo = db();
    $pdo->exec("SET NAMES utf8mb4");

    $pdo->exec(<<<SQL
CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  platform ENUM('shopee','tiktok_shop','facebook') NOT NULL DEFAULT 'shopee',
  affiliate_url TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  commission_rate DECIMAL(6,2) NOT NULL DEFAULT 0,
  category VARCHAR(120) NOT NULL DEFAULT '',
  selling_points LONGTEXT NOT NULL,
  pain_points LONGTEXT NOT NULL,
  target_audience VARCHAR(255) NOT NULL DEFAULT '',
  video_ease TINYINT NOT NULL DEFAULT 3,
  seasonal_score TINYINT NOT NULL DEFAULT 3,
  notes TEXT NULL,
  image_url TEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

    $pdo->exec(<<<SQL
CREATE TABLE IF NOT EXISTS content_packs (
  id VARCHAR(64) PRIMARY KEY,
  product_id VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL,
  disclosure TEXT NOT NULL,
  hooks LONGTEXT NOT NULL,
  ctas LONGTEXT NOT NULL,
  hashtags_th LONGTEXT NOT NULL,
  hashtags_en LONGTEXT NOT NULL,
  tiktok_script LONGTEXT NOT NULL,
  facebook_caption MEDIUMTEXT NOT NULL,
  facebook_group_caption MEDIUMTEXT NOT NULL,
  reels_caption MEDIUMTEXT NOT NULL,
  video_priority_note TEXT NOT NULL,
  variant INT NOT NULL DEFAULT 0,
  INDEX (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

    $pdo->exec(<<<SQL
CREATE TABLE IF NOT EXISTS schedule (
  id VARCHAR(64) PRIMARY KEY,
  post_date DATE NOT NULL,
  suggested_time VARCHAR(8) NOT NULL,
  channel ENUM('tiktok','facebook_post','facebook_group','facebook_reels') NOT NULL,
  product_id VARCHAR(64) NOT NULL,
  content_pack_id VARCHAR(64) NOT NULL,
  hook_index INT NOT NULL DEFAULT 0,
  cta_index INT NOT NULL DEFAULT 0,
  status ENUM('draft','approved','posted','skipped') NOT NULL DEFAULT 'draft',
  caption_preview MEDIUMTEXT NOT NULL,
  approved_at DATETIME NULL,
  posted_at DATETIME NULL,
  views INT NULL,
  clicks INT NULL,
  orders_count INT NULL,
  commission_earned DECIMAL(10,2) NULL,
  metrics_notes TEXT NULL,
  metrics_at DATETIME NULL,
  INDEX (post_date),
  INDEX (product_id),
  INDEX (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

    $pdo->exec(<<<SQL
CREATE TABLE IF NOT EXISTS briefs (
  id VARCHAR(64) PRIMARY KEY,
  brief_date DATE NOT NULL,
  type ENUM('morning','evening') NOT NULL,
  top_product_ids LONGTEXT NOT NULL,
  content_pack_ids LONGTEXT NOT NULL,
  schedule_ids LONGTEXT NOT NULL,
  summary TEXT NOT NULL,
  recommendations LONGTEXT NOT NULL,
  disclaimer TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  INDEX (brief_date),
  INDEX (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

    $pdo->exec(<<<SQL
CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(64) PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

    $now = date('Y-m-d H:i:s');
    $stmt = $pdo->prepare('INSERT INTO settings (setting_key, setting_value, updated_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value), updated_at=VALUES(updated_at)');
    $stmt->execute(['installed_at', $now, $now]);
    $stmt->execute(['app_mode', 'production', $now]);

    if ($seed) {
        seed_starter_catalog();
    }
}

function seed_starter_catalog(): void
{
    $pdo = db();
    $count = (int) $pdo->query('SELECT COUNT(*) FROM products')->fetchColumn();
    if ($count > 0) {
        return;
    }

    $now = date('Y-m-d H:i:s');
    $items = [
        [
            'name' => 'พัดลมมือถือมินิ USB ชาร์จไว',
            'platform' => 'shopee',
            'affiliate_url' => 'https://shopee.co.th/',
            'price' => 159,
            'commission_rate' => 12,
            'category' => 'แกเจ็ต',
            'selling_points' => ['พกง่าย', 'เงียบ', 'ชาร์จ USB-C'],
            'pain_points' => ['ร้อนระหว่างเดินทาง', 'พัดลมใหญ่พกไม่สะดวก'],
            'target_audience' => 'คนทำงานนอกสถานที่ / นักเรียน',
            'video_ease' => 5,
            'seasonal_score' => 5,
            'notes' => 'เหมาะฤดูร้อน — ใส่ลิงก์ affiliate จริงก่อนโพสต์',
            'image_url' => 'assets/products/fan.svg',
        ],
        [
            'name' => 'ครีมกันแดดเนื้อบางเบา SPF50',
            'platform' => 'shopee',
            'affiliate_url' => 'https://shopee.co.th/',
            'price' => 289,
            'commission_rate' => 15,
            'category' => 'บิวตี้',
            'selling_points' => ['ไม่เหนอะ', 'ซับไว', 'SPF50'],
            'pain_points' => ['ครีมกันแดดเหนียว', 'หน้ามันระหว่างวัน'],
            'target_audience' => 'คนที่ต้องออกแดดบ่อย',
            'video_ease' => 4,
            'seasonal_score' => 5,
            'notes' => 'อย่าเคลมผลลัพธ์เกินจริง — แนะนำให้อ่านส่วนผสม',
            'image_url' => 'assets/products/sunscreen.svg',
        ],
        [
            'name' => 'ขวดน้ำเก็บอุณหภูมิ 500ml',
            'platform' => 'tiktok_shop',
            'affiliate_url' => 'https://shop.tiktok.com/',
            'price' => 249,
            'commission_rate' => 10,
            'category' => 'ไลฟ์สไตล์',
            'selling_points' => ['เก็บร้อน/เย็น', 'น้ำหนักเบา', 'ปากกว้างล้างง่าย'],
            'pain_points' => ['น้ำอุ่นเร็ว', 'ขวดหนักพกยาก'],
            'target_audience' => 'คนออกกำลังกาย / ทำงานออฟฟิศ',
            'video_ease' => 4,
            'seasonal_score' => 3,
            'notes' => 'สาธิต ice test สั้น ๆ ได้',
            'image_url' => 'assets/products/bottle.svg',
        ],
        [
            'name' => 'แผ่นรองเมาส์ข้อมือกันเมื่อย',
            'platform' => 'shopee',
            'affiliate_url' => 'https://shopee.co.th/',
            'price' => 129,
            'commission_rate' => 18,
            'category' => 'แกเจ็ต',
            'selling_points' => ['เมมโมรี่โฟม', 'กันลื่น', 'ราคาเข้าถึงง่าย'],
            'pain_points' => ['ข้อมือเมื่อยจากใช้เมาส์นาน'],
            'target_audience' => 'คนทำงานคอมพิวเตอร์',
            'video_ease' => 5,
            'seasonal_score' => 2,
            'notes' => 'impulse buy ชัด',
            'image_url' => 'assets/products/mousepad.svg',
        ],
        [
            'name' => 'กล่องจัดระเบียบสายชาร์จ',
            'platform' => 'tiktok_shop',
            'affiliate_url' => 'https://shop.tiktok.com/',
            'price' => 99,
            'commission_rate' => 14,
            'category' => 'จัดบ้าน',
            'selling_points' => ['กะทัดรัด', 'หลายช่อง', 'พกในกระเป๋าได้'],
            'pain_points' => ['สายพันกันในกระเป๋า'],
            'target_audience' => 'คนเดินทาง / นักเรียน',
            'video_ease' => 5,
            'seasonal_score' => 2,
            'notes' => 'before-after จัดกระเป๋าได้ดี',
            'image_url' => 'assets/products/cablebox.svg',
        ],
        [
            'name' => 'ไฟวงแหวนมือถือถ่ายรีวิว',
            'platform' => 'shopee',
            'affiliate_url' => 'https://shopee.co.th/',
            'price' => 399,
            'commission_rate' => 11,
            'category' => 'ครีเอเตอร์',
            'selling_points' => ['แสงนุ่ม', 'คลิปมือถือ', 'ปรับความสว่าง'],
            'pain_points' => ['ภาพมืดเวลาถ่ายรีวิว'],
            'target_audience' => 'ครีเอเตอร์มือใหม่',
            'video_ease' => 4,
            'seasonal_score' => 3,
            'notes' => 'เหมาะคนเริ่มทำคลิป affiliate',
            'image_url' => 'assets/products/ringlight.svg',
        ],
        [
            'name' => 'กระเป๋าจัดระเบียบเครื่องสำอาง',
            'platform' => 'shopee',
            'affiliate_url' => 'https://shopee.co.th/',
            'price' => 179,
            'commission_rate' => 13,
            'category' => 'บิวตี้',
            'selling_points' => ['ช่องเยอะ', 'กันน้ำ', 'พับเก็บได้'],
            'pain_points' => ['เครื่องสำอางหาของไม่เจอเวลาเดินทาง'],
            'target_audience' => 'คนชอบท่องเที่ยว / แต่งหน้า',
            'video_ease' => 4,
            'seasonal_score' => 3,
            'notes' => 'แพ็กของจริงให้เห็นการจัด',
            'image_url' => 'assets/products/bag.svg',
        ],
        [
            'name' => 'ที่ตัดแต่งขนจมูกแบบชาร์จ',
            'platform' => 'tiktok_shop',
            'affiliate_url' => 'https://shop.tiktok.com/',
            'price' => 199,
            'commission_rate' => 16,
            'category' => 'กรูมมิ่ง',
            'selling_points' => ['ใบมีดสแตนเลส', 'ชาร์จ USB', 'เสียงเบา'],
            'pain_points' => ['ดูแลตัวเองไม่สะดวกตอนเช้า'],
            'target_audience' => 'ผู้ชายวัยทำงาน',
            'video_ease' => 3,
            'seasonal_score' => 2,
            'notes' => 'รีวิวแบบสุภาพ ไม่ขายแข็ง',
            'image_url' => 'assets/products/trimmer.svg',
        ],
    ];

    $stmt = $pdo->prepare(<<<SQL
INSERT INTO products
(id,name,platform,affiliate_url,price,commission_rate,category,selling_points,pain_points,target_audience,video_ease,seasonal_score,notes,image_url,created_at,updated_at)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
SQL);

    foreach ($items as $i => $it) {
        $stmt->execute([
            new_id('prod'),
            $it['name'],
            $it['platform'],
            $it['affiliate_url'],
            $it['price'],
            $it['commission_rate'],
            $it['category'],
            json_encode($it['selling_points'], JSON_UNESCAPED_UNICODE),
            json_encode($it['pain_points'], JSON_UNESCAPED_UNICODE),
            $it['target_audience'],
            $it['video_ease'],
            $it['seasonal_score'],
            $it['notes'],
            $it['image_url'],
            $now,
            $now,
        ]);
    }
}
