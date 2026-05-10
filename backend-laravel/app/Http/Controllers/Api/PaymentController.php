<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Adapters\PaymentAdapterInterface;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Payment endpoints。
 *
 * @see docs/api-contract.yaml createPayment / getPayment / confirmPayment / listPaymentEvents
 *
 * 本クラスはスケルトン (Y2)。実装は Phase 4 後半 (Y3) で行う。
 */
final class PaymentController extends Controller
{
    public function __construct(
        private readonly PaymentAdapterInterface $adapter,
    ) {
    }

    public function create(Request $request): JsonResponse
    {
        return $this->notImplemented(__FUNCTION__);
    }

    public function show(string $id): JsonResponse
    {
        return $this->notImplemented(__FUNCTION__);
    }

    public function confirm(Request $request, string $id): JsonResponse
    {
        return $this->notImplemented(__FUNCTION__);
    }

    public function events(string $id): JsonResponse
    {
        return $this->notImplemented(__FUNCTION__);
    }

    private function notImplemented(string $method): JsonResponse
    {
        return response()->json([
            'code' => 'not_implemented',
            'message' => sprintf('PaymentController::%s() is a Y2 skeleton; logic comes in Y3.', $method),
        ], 501);
    }
}
