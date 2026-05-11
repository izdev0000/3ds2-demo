<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Order に含まれる明細行。
 *
 * @property string $id
 * @property string $order_id
 * @property string $name
 * @property int $quantity
 * @property int $unit_price
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class OrderItem extends Model
{
    protected $primaryKey = 'id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'order_id',
        'name',
        'quantity',
        'unit_price',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'unit_price' => 'integer',
        ];
    }

    public function subtotal(): int
    {
        return $this->quantity * $this->unit_price;
    }

    /**
     * @return BelongsTo<Order, $this>
     */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class, 'order_id');
    }
}
