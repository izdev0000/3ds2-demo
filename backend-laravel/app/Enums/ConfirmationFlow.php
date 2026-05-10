<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * 3DS2 confirmation 経路。
 *
 * - CLIENT_SDK: frontend 側 SDK (Stripe.js 等) が iframe で 3DS2 challenge を表示
 *               する経路。Stripe / Adyen など欧米系 PSP のデフォルト。
 *               next_action.type = use_stripe_sdk が返る想定。
 *
 * - SERVER_REDIRECT: backend が confirm 後、redirect URL を frontend に返却し、
 *                    frontend は issuer ページへ画面遷移する経路。
 *                    国内 PSP で主流のパターン。next_action.type = redirect_to_url
 *                    が返る想定。return_url は必須。
 *
 * 詳細設計は docs/design/confirmation-flow.md を参照。
 */
enum ConfirmationFlow: string
{
    case CLIENT_SDK = 'client_sdk';
    case SERVER_REDIRECT = 'server_redirect';

    /**
     * この flow で confirm するとき return_url が必須かどうか。
     * SERVER_REDIRECT は issuer challenge 完了後の戻り先として必須、
     * CLIENT_SDK は同一ページに留まるため不要。
     */
    public function requiresReturnUrl(): bool
    {
        return $this === self::SERVER_REDIRECT;
    }
}
