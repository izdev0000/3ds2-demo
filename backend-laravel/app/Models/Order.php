<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\OrderStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * 業務単位の Order (注文)。
 *
 * 1 Order : N Transaction (再決済対応)。
 * status 遷移は POST /api/orders で PENDING、webhook 経由で PAID/REFUNDED、
 * 明示キャンセルで CANCELED (docs/design/error-handling.md §8.4)。
 *
 * @property string $id
 * @property OrderStatus $status
 * @property int $amount
 * @property string $currency
 * @property array<string, mixed>|null $metadata
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class Order extends Model
{
    protected $primaryKey = 'id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'status',
        'amount',
        'currency',
        'metadata',
    ];

    protected function casts(): array
    {
        return [
            'status' => OrderStatus::class,
            'metadata' => 'array',
            'amount' => 'integer',
        ];
    }

    /**
     * @return HasMany<OrderItem, $this>
     */
    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class, 'order_id');
    }

    /**
     * @return HasMany<Transaction, $this>
     */
    public function transactions(): HasMany
    {
        return $this->hasMany(Transaction::class, 'order_id');
    }
}
