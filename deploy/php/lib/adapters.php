<?php
declare(strict_types=1);

/**
 * Platform adapters (placeholders until API keys exist).
 * Default mode = manual / mock. Never auto-publishes.
 */
interface AffiliateAdapter
{
    public function name(): string;
    public function mode(): string; // manual|api
    public function fetchProducts(array $query = []): array;
}

interface SocialPublisher
{
    public function name(): string;
    public function canPublish(): bool;
    /** Always blocked unless explicitly approved + manual mode. */
    public function publishDraft(array $post): array;
}

class ManualShopeeAdapter implements AffiliateAdapter
{
    public function name(): string { return 'Shopee Affiliate'; }
    public function mode(): string { return 'manual'; }
    public function fetchProducts(array $query = []): array
    {
        return [
            'mode' => 'manual',
            'message' => 'ยังไม่มี Shopee API key — ใช้ import CSV/JSON หรือเพิ่มสินค้ามือ',
            'items' => [],
        ];
    }
}

class ManualTikTokAdapter implements AffiliateAdapter
{
    public function name(): string { return 'TikTok Shop Affiliate'; }
    public function mode(): string { return 'manual'; }
    public function fetchProducts(array $query = []): array
    {
        return [
            'mode' => 'manual',
            'message' => 'ยังไม่มี TikTok Shop API key — ใช้ import หรือเพิ่มสินค้ามือ',
            'items' => [],
        ];
    }
}

class ShopeeApiAdapterPlaceholder implements AffiliateAdapter
{
    public function name(): string { return 'Shopee API (placeholder)'; }
    public function mode(): string { return 'api'; }
    public function fetchProducts(array $query = []): array
    {
        return ['mode' => 'api', 'ready' => false, 'message' => 'รอ credentials'];
    }
}

class TikTokApiAdapterPlaceholder implements AffiliateAdapter
{
    public function name(): string { return 'TikTok Shop API (placeholder)'; }
    public function mode(): string { return 'api'; }
    public function fetchProducts(array $query = []): array
    {
        return ['mode' => 'api', 'ready' => false, 'message' => 'รอ credentials'];
    }
}

class FacebookPublisherPlaceholder implements SocialPublisher
{
    public function name(): string { return 'Facebook/Meta Publisher'; }
    public function canPublish(): bool { return false; }
    public function publishDraft(array $post): array
    {
        return [
            'ok' => false,
            'blocked' => true,
            'message' => 'ห้ามโพสต์อัตโนมัติ — ต้อง Approve แล้วโพสต์ด้วยมือ (adapter พร้อมต่อ API ภายหลัง)',
        ];
    }
}

function active_affiliate_adapters(): array
{
    return [new ManualShopeeAdapter(), new ManualTikTokAdapter()];
}

function future_affiliate_adapters(): array
{
    return [new ShopeeApiAdapterPlaceholder(), new TikTokApiAdapterPlaceholder()];
}

function social_publishers(): array
{
    return [new FacebookPublisherPlaceholder()];
}
