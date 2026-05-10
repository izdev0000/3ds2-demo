FROM php:8.3-fpm-alpine

RUN apk add --no-cache \
        bash \
        git \
        unzip \
        icu-dev \
        libzip-dev \
        oniguruma-dev \
        $PHPIZE_DEPS \
    && docker-php-ext-install -j"$(nproc)" \
        bcmath \
        intl \
        opcache \
        pdo_mysql \
        zip \
    && apk del $PHPIZE_DEPS

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# php-fpm をフォアグラウンド実行（コンテナのメインプロセス）
WORKDIR /var/www/html
EXPOSE 9000
CMD ["php-fpm", "-F"]
