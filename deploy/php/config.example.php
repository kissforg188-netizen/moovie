<?php
/**
 * เลือกดี Affiliate Lab — production config (cPanel/MySQL)
 * Credentials stay server-side only.
 */
declare(strict_types=1);

const APP_NAME = 'เลือกดี';
const APP_TAGLINE = 'Affiliate Lab';
const APP_URL = 'https://shopee.sogiin6868.com';

const DB_HOST = 'localhost';
const DB_NAME = 'sogiinco_shopee';
const DB_USER = 'sogiinco_shopee';
const DB_PASS = 'CHANGE_ME';
const DB_CHARSET = 'utf8mb4';

const AFFILIATE_DISCLOSURE = 'ลิงก์นี้เป็นลิงก์ affiliate ผู้เขียนอาจได้รับค่าคอมมิชชัน';
const INCOME_DISCLAIMER = 'ระบบนี้เป็นเครื่องมือทดลองและปรับปรุงจากข้อมูลจริง ไม่รับประกันรายได้หรือยอดขาย';

const TIMEZONE = 'Asia/Bangkok';

date_default_timezone_set(TIMEZONE);

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}

function json_response(array $data, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function h(?string $s): string
{
    return htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function new_id(string $prefix): string
{
    return $prefix . '_' . base_convert((string) time(), 10, 36) . '_' . bin2hex(random_bytes(3));
}

function today_iso(): string
{
    return date('Y-m-d');
}

function is_installed(): bool
{
    try {
        $n = (int) db()->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=" . db()->quote(DB_NAME) . " AND table_name='products'")->fetchColumn();
        return $n > 0;
    } catch (Throwable $e) {
        return false;
    }
}
