<?php

declare(strict_types=1);

use App\Http\Controllers\Api\DebugController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\WebhookController;
use Illuminate\Support\Facades\Route;

/*
 * API routes は docs/api-contract.yaml と完全に一致させる：
 *   POST  /api/orders
 *   GET   /api/orders/{id}
 *   POST  /api/payments
 *   GET   /api/payments/{id}
 *   POST  /api/payments/{id}/confirm
 *   GET   /api/payments/{id}/events
 *   POST  /api/webhooks/stripe
 */

Route::prefix('orders')->name('orders.')->group(function (): void {
    Route::post('/', [OrderController::class, 'create'])->name('create');
    Route::get('/{id}', [OrderController::class, 'show'])->name('show');
});

Route::prefix('payments')->name('payments.')->group(function (): void {
    Route::post('/', [PaymentController::class, 'create'])->name('create');
    Route::get('/{id}', [PaymentController::class, 'show'])->name('show');
    Route::post('/{id}/confirm', [PaymentController::class, 'confirm'])->name('confirm');
    Route::get('/{id}/events', [PaymentController::class, 'events'])->name('events');
});

Route::post('webhooks/stripe', [WebhookController::class, 'stripe'])->name('webhooks.stripe');

// 教育デモ用 debug endpoint。各テーブルの直近 5 行を返し、frontend が
// データフローを可視化できるようにする。
Route::get('_debug/recent-rows', [DebugController::class, 'recentRows'])->name('debug.recent-rows');
