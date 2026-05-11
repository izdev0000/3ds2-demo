<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Transaction;
use App\Models\WebhookEvent;
use Illuminate\Http\JsonResponse;

/**
 * 教育デモ用 debug endpoint。
 *
 * 各テーブルの直近 5 行を返し、frontend が「データフローを可視化」できる
 * ようにする。Order INSERT / Transaction INSERT / webhook 受信で
 * webhook_events INSERT + Order/Transaction UPDATE が起きる流れを観察する用途。
 *
 * 本デモは TEST 環境専用のため認証は付けない。本番化する場合は middleware
 * で local 環境限定にすること。
 */
final class DebugController extends Controller
{
    public function recentRows(): JsonResponse
    {
        return response()->json([
            'orders' => Order::query()
                ->orderByDesc('created_at')
                ->limit(5)
                ->get(['id', 'status', 'amount', 'currency', 'created_at', 'updated_at'])
                ->map(fn (Order $o) => [
                    'id' => $o->id,
                    'status' => $o->status->value,
                    'amount' => $o->amount,
                    'currency' => $o->currency,
                    'created_at' => $o->created_at?->toIso8601String(),
                    'updated_at' => $o->updated_at?->toIso8601String(),
                ])
                ->all(),
            'transactions' => Transaction::query()
                ->orderByDesc('created_at')
                ->limit(5)
                ->get(['id', 'order_id', 'status', 'psp_payment_intent_id', 'amount', 'currency', 'created_at', 'updated_at'])
                ->map(fn (Transaction $t) => [
                    'id' => $t->id,
                    'order_id' => $t->order_id,
                    'status' => $t->status->value,
                    'psp_payment_intent_id' => $t->psp_payment_intent_id,
                    'amount' => $t->amount,
                    'currency' => $t->currency,
                    'created_at' => $t->created_at?->toIso8601String(),
                    'updated_at' => $t->updated_at?->toIso8601String(),
                ])
                ->all(),
            'order_items' => OrderItem::query()
                ->orderByDesc('created_at')
                ->limit(5)
                ->get(['id', 'order_id', 'name', 'quantity', 'unit_price', 'created_at'])
                ->map(fn (OrderItem $i) => [
                    'id' => $i->id,
                    'order_id' => $i->order_id,
                    'name' => $i->name,
                    'quantity' => $i->quantity,
                    'unit_price' => $i->unit_price,
                    'created_at' => $i->created_at?->toIso8601String(),
                ])
                ->all(),
            'webhook_events' => WebhookEvent::query()
                ->orderByDesc('received_at')
                ->limit(5)
                ->get(['id', 'psp', 'psp_event_id', 'event_type', 'transaction_id', 'received_at', 'processed_at'])
                ->map(fn (WebhookEvent $e) => [
                    'id' => $e->id,
                    'psp' => $e->psp,
                    'psp_event_id' => $e->psp_event_id,
                    'event_type' => $e->event_type,
                    'transaction_id' => $e->transaction_id,
                    'received_at' => $e->received_at?->toIso8601String(),
                    'processed_at' => $e->processed_at?->toIso8601String(),
                ])
                ->all(),
        ]);
    }
}
