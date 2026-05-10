// PSP (Payment Service Provider) 抽象化 interface。
// PSP SDK 固有の型を Vue 層に漏らさず、PSP 切替を可能にする。
// backend 側の対称な抽象化:
//   backend-laravel/app/Adapters/PaymentAdapterInterface.php

// PSP ごとに型が異なる「カード入力ハンドル」の opaque 型。
// 利用側は中身を触らず、PspClient のメソッドへ受け渡すだけ。
export type CardHandle = unknown

export interface MountCardFormTargets {
  number: HTMLElement
  expiry: HTMLElement
  cvc: HTMLElement
}

export interface MountCardFormOptions {
  placeholders?: {
    number?: string
    expiry?: string
    cvc?: string
  }
}

export interface MountedCardForm {
  // confirmAndChallenge の card 引数に渡す opaque ハンドル。
  card: CardHandle
  unmount: () => void
}

// card と paymentMethodId は XOR (どちらか一方を指定)。
// card: Elements 経由のカード入力 (通常 flow)
// paymentMethodId: Stripe の test PM alias 等 (`pm_card_visa` 等) を直接 confirm
export type ConfirmAndChallengeArgs = {
  clientSecret: string
  // 3DS2 challenge が発火した瞬間に呼ばれる (UI で「認証中」を表示するため)。
  // frictionless で完了する場合は呼ばれない。
  onChallenge?: () => void
} & ({ card: CardHandle } | { paymentMethodId: string })

// confirm + 必要なら challenge まで完了した最終結果。
// finalStatus は表示用の生 status (PSP 由来、debug value)。
export type ConfirmResult =
  | { kind: 'succeeded'; finalStatus: string }
  | { kind: 'failed'; message: string; finalStatus?: string }

export interface CreatedPaymentMethod {
  paymentMethodId: string
}

export interface PspClient {
  // PSP SDK の lazy 初期化。複数回呼ばれても 1 回しか load しない。
  init(): Promise<void>

  // カード入力 UI を指定要素へ mount。戻り値の card / unmount を保持して使う。
  mountCardForm(
    targets: MountCardFormTargets,
    options?: MountCardFormOptions,
  ): Promise<MountedCardForm>

  // 与えられた client_secret で支払いを confirm し、必要なら 3DS2 challenge を実行。
  // (client_sdk flow 専用)
  confirmAndChallenge(args: ConfirmAndChallengeArgs): Promise<ConfirmResult>

  // server_redirect flow では backend に payment_method_id を渡す必要があるため、
  // Elements の card から PaymentMethod ID を生成する (confirm はしない)。
  createPaymentMethod(card: CardHandle): Promise<CreatedPaymentMethod>
}
