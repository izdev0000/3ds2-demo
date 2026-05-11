<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\DTO\CreateOrderRequest;
use App\DTO\OrderResponse;
use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderItem;
use App\Support\IdGenerator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Order endpoints。
 *
 * @see docs/api-contract.yaml createOrder / getOrder
 */
final class OrderController extends Controller
{
    public function create(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'currency' => ['required', 'string', 'size:3', 'regex:/^[a-z]{3}$/i'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.name' => ['required', 'string', 'max:255'],
            'items.*.quantity' => ['required', 'integer', 'min:1'],
            'items.*.unit_price' => ['required', 'integer', 'min:0'],
            'metadata' => ['nullable', 'array'],
        ]);

        $dto = CreateOrderRequest::fromArray($validated);

        // 業務ルール: 合計金額は Stripe の最小 (50) 以上。
        // amount 自体は items から導出される真値なので request では受け取らない。
        $total = $dto->totalAmount();
        if ($total < 50) {
            return response()->json([
                'code' => 'invalid_amount',
                'message' => 'Order total must be at least 50 (minor unit).',
                'details' => ['amount' => $total],
            ], 422);
        }

        $order = DB::transaction(function () use ($dto, $total): Order {
            $order = Order::create([
                'id' => IdGenerator::orderId(),
                'status' => OrderStatus::PENDING,
                'amount' => $total,
                'currency' => $dto->currency,
                'metadata' => $dto->metadata,
            ]);

            foreach ($dto->items as $item) {
                OrderItem::create([
                    'id' => IdGenerator::orderItemId(),
                    'order_id' => $order->id,
                    'name' => $item->name,
                    'quantity' => $item->quantity,
                    'unit_price' => $item->unitPrice,
                ]);
            }

            return $order->fresh(['items']);
        });

        return response()->json(OrderResponse::fromModel($order)->toArray(), 201);
    }

    public function show(string $id): JsonResponse
    {
        $order = Order::query()->with('items')->find($id);
        if ($order === null) {
            return response()->json([
                'code' => 'order_not_found',
                'message' => 'Order not found.',
                'details' => ['order_id' => $id],
            ], 404);
        }

        return response()->json(OrderResponse::fromModel($order)->toArray());
    }
}
