<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Support\Str;

/**
 * 内部 ID 生成ヘルパ。
 *
 * 接頭辞付き ULID で transaction / webhook event の主キーを発行する。
 * 接頭辞によりログ・DB ダンプ・障害調査時に ID 種別を一目で判別できる。
 *
 * 形式:
 *   transaction:    "txn_" + ULID 26 桁  (例: txn_01HYZ80012345MNOPQRSTUVWX)
 *   webhook event:  "evt_" + ULID 26 桁
 *
 * ULID は時系列順かつグローバルに一意。UUID v4 と違って B-Tree 索引フレンドリ。
 */
final class IdGenerator
{
    public static function transactionId(): string
    {
        return 'txn_'.(string) Str::ulid();
    }

    public static function webhookEventId(): string
    {
        return 'evt_'.(string) Str::ulid();
    }
}
