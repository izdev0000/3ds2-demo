<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Webhook 受信イベント (idempotency 検証 + 監査ログ)。
 *
 * @property string $id
 * @property string $psp
 * @property string $psp_event_id
 * @property string $event_type
 * @property string|null $transaction_id
 * @property array<string, mixed> $payload
 * @property Carbon $received_at
 * @property Carbon|null $processed_at
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class WebhookEvent extends Model
{
    protected $primaryKey = 'id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'psp',
        'psp_event_id',
        'event_type',
        'transaction_id',
        'payload',
        'received_at',
        'processed_at',
    ];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'received_at' => 'datetime',
            'processed_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<Transaction, $this>
     */
    public function transaction(): BelongsTo
    {
        return $this->belongsTo(Transaction::class, 'transaction_id');
    }
}
