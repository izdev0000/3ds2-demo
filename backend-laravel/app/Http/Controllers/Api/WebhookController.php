<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Adapters\PaymentAdapterInterface;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Stripe webhook endpoint。
 *
 * @see docs/api-contract.yaml receiveStripeWebhook
 *
 * 本クラスはスケルトン (Y2)。署名検証 + イベント分岐の実装は Y3 で行う。
 */
final class WebhookController extends Controller
{
    public function __construct(
        private readonly PaymentAdapterInterface $adapter,
    ) {
    }

    public function stripe(Request $request): JsonResponse
    {
        return response()->json([
            'code' => 'not_implemented',
            'message' => 'WebhookController::stripe() is a Y2 skeleton; logic comes in Y3.',
        ], 501);
    }
}
