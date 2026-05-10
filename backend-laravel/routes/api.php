<?php

declare(strict_types=1);

use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\WebhookController;
use Illuminate\Support\Facades\Route;

/*
 * API routes は docs/api-contract.yaml と完全に一致させる：
 *   POST  /api/payments
 *   GET   /api/payments/{id}
 *   POST  /api/payments/{id}/confirm
 *   GET   /api/payments/{id}/events
 *   POST  /api/webhooks/stripe
 *
 * 現状はすべての Controller がスケルトンで 501 を返す (Y2)。
 * 実装は Y3 で行う。
 */

Route::prefix('payments')->name('payments.')->group(function (): void {
    Route::post('/', [PaymentController::class, 'create'])->name('create');
    Route::get('/{id}', [PaymentController::class, 'show'])->name('show');
    Route::post('/{id}/confirm', [PaymentController::class, 'confirm'])->name('confirm');
    Route::get('/{id}/events', [PaymentController::class, 'events'])->name('events');
});

Route::post('webhooks/stripe', [WebhookController::class, 'stripe'])->name('webhooks.stripe');
