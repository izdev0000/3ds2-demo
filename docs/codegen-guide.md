# API Contract から型を生成する手順

`docs/api-contract.yaml` を single source of truth として、frontend / backend が
それぞれの言語型を生成・参照する手順をまとめる。

## 1. Frontend (TypeScript)

[`openapi-typescript`](https://openapi-ts.dev/) で `.d.ts` を生成する。

### インストール

```bash
cd frontend
npm install -D openapi-typescript
```

### 生成コマンド

```bash
npx openapi-typescript ../docs/api-contract.yaml -o src/types/api.d.ts
```

`package.json` の `scripts` に登録すると便利：

```json
{
  "scripts": {
    "codegen": "openapi-typescript ../docs/api-contract.yaml -o src/types/api.d.ts"
  }
}
```

### 使い方

```ts
import type { components, paths } from '@/types/api'

type CreatePaymentRequest = components['schemas']['CreatePaymentRequest']
type PaymentResponse = components['schemas']['PaymentResponse']
type PaymentStatus = components['schemas']['PaymentStatus']

// PaymentIntent 作成は事前に作成済の Order に紐付ける (amount/currency は
// Order から導出するため client では送らない)。
const body: CreatePaymentRequest = { order_id: 'ord_01HYZ800' }
const res = await fetch('/api/payments', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
const payment: PaymentResponse = await res.json()
```

### 補助ツール（任意）

- [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/) — `fetch` を契約準拠の型安全 API client に置き換える
  ```bash
  npm install openapi-fetch
  ```

## 2. Backend (PHP / Laravel)

PHP は OpenAPI からの型生成エコシステムが TypeScript ほど成熟していない。
本リポジトリでは **手書き DTO + 契約検証テスト** を採用する。

### 方針

- DTO クラスを `backend-laravel/app/DTO/` に手書きする
- Controller の入出力はすべて DTO 経由（直接 array や stdClass を返さない）
- 契約との整合性は PHPUnit/Pest + JSON Schema 検証で担保する
- 必要に応じて [`spatie/laravel-data`](https://spatie.be/docs/laravel-data) で boilerplate を圧縮

### 補助ツール（参考、未採用）

- [`cebe/php-openapi`](https://github.com/cebe/php-openapi) — YAML → PHP オブジェクトのパーサ。コード生成はしない（自作 generator のベースに使える）
- [`openapi-generator`](https://github.com/OpenAPITools/openapi-generator) — Java 製の多言語対応 generator。PHP-Laravel テンプレートあり。本デモでは過剰
- 手書き優先：契約は人間可読なので、DTO を hand-rolled で書いて契約検証テストで担保するのが学習用途として明快

### 契約検証テスト（方針スケッチ）

```php
// tests/Contract/PaymentControllerContractTest.php
public function test_create_payment_returns_payment_response_schema(): void
{
    $response = $this->postJson('/api/payments', [
        'amount' => 1000,
        'currency' => 'jpy',
    ]);

    $response->assertCreated();
    $this->assertMatchesOpenApiSchema(
        $response->json(),
        spec: base_path('../docs/api-contract.yaml'),
        schemaRef: '#/components/schemas/PaymentResponse',
    );
}
```

`assertMatchesOpenApiSchema` は trait として `tests/Contract/AssertsOpenApi.php` に
実装する（具体ライブラリは Phase 4 着手時に決定）。

候補ライブラリ：
- [`league/openapi-psr7-validator`](https://github.com/thephpleague/openapi-psr7-validator)
- [`hkarlstrom/openapi-validation-middleware`](https://github.com/hkarlstrom/openapi-validation-middleware)
- 手書き：`opis/json-schema` で contract から JSON Schema を抽出して assertion

## 3. Drift 検出（Phase 7 で CI 化予定）

contract と実装の drift を防ぐ仕組みは Phase 7 で `.github/workflows/` に組み込む。
ここでは方針のみ：

| 検出対象 | 手段 |
| --- | --- |
| 契約自体の lint | [`@stoplight/spectral`](https://github.com/stoplightio/spectral) で OpenAPI ベストプラクティス検証 |
| TS 型の鮮度 | `npm run codegen && git diff --exit-code` で contract 更新時に型が古ければ CI fail |
| PHP 実装の整合 | 上記契約検証テストを PR で必ず通す |
| breaking change の検知 | `oasdiff` 等で前回コミットとの差分検出（任意） |

詳細は Phase 7 で `.github/workflows/openapi-drift.yml` 追加時に確定。

## 参考

- OpenAPI 仕様: https://spec.openapis.org/oas/latest.html
- `openapi-typescript` ドキュメント: https://openapi-ts.dev/
- Laravel での DTO パターン: spatie/laravel-data ドキュメント
