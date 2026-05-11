// PSP DI ポイント (frontend 用)。
//
// component は具体実装 (StripePspClient) を直接 import せず、ここから
// `pspClient` を取得する。将来 Adyen / 国内 PSP の Client が追加された場合は
// この 1 ファイルを差し替えれば全 component が追従する設計。
//
// backend の PaymentAdapterInterface / StripeAdapter と同じ抽象方針。

import type { PspClient } from './PspClient'
import { stripePspClient } from './StripePspClient'

export const pspClient: PspClient = stripePspClient
