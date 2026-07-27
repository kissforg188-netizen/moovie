<?php
declare(strict_types=1);

require_once __DIR__ . '/../config.php';

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

    $now = date('Y-m-d H:i:s');
    $stmt = $pdo->prepare('INSERT INTO settings (setting_key, setting_value, updated_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value), updated_at=VALUES(updated_at)');
    $stmt->execute(['installed_at', $now, $now]);
    $stmt->execute(['app_mode', 'production', $now]);

    if ($seed) {
        seed_starter_catalog();
    }
}

/** No starter/sample products — catalog stays empty until user imports real items. */
function seed_starter_catalog(): void
{
    // intentionally empty
}
