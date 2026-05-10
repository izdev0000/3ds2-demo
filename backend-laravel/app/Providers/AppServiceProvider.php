<?php

namespace App\Providers;

use App\Adapters\PaymentAdapterInterface;
use App\Adapters\StripeAdapter;
use Illuminate\Support\ServiceProvider;
use Stripe\StripeClient;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(StripeClient::class, function () {
            return new StripeClient((string) config('services.stripe.secret_key'));
        });

        $this->app->bind(PaymentAdapterInterface::class, function ($app) {
            return new StripeAdapter(
                $app->make(StripeClient::class),
                (string) config('services.stripe.webhook_secret', ''),
            );
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
