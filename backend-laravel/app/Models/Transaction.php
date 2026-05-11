<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\PaymentStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * Payment transaction (PaymentIntent の内部レコード)。
 *
 * @property string $id
 * @property string $order_id
 * @property string $psp
 * @property string|null $psp_payment_intent_id
 * @property string|null $client_secret
 * @property PaymentStatus $status
 * @property int $amount
 * @property string $currency
 * @property array<string, mixed>|null $next_action
 * @property array<string, mixed>|null $metadata
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class Transaction extends Model
{
    protected $primaryKey = 'id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'order_id',
        'psp',
        'psp_payment_intent_id',
        'client_secret',
        'status',
        'amount',
        'currency',
        'next_action',
        'metadata',
    ];

    protected function casts(): array
    {
        return [
            'status' => PaymentStatus::class,
            'next_action' => 'array',
            'metadata' => 'array',
            'amount' => 'integer',
        ];
    }

    /**
     * @return HasMany<WebhookEvent, $this>
     */
    public function events(): HasMany
    {
        return $this->hasMany(WebhookEvent::class, 'transaction_id');
    }

    /**
     * @return BelongsTo<Order, $this>
     */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class, 'order_id');
    }
}
