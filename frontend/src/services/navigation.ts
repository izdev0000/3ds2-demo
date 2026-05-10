// window.location 操作の薄いラッパ。テスト時 vi.spyOn(navigation, 'redirect')
// で差し替えるための間接化。
export const navigation = {
  redirect(url: string): void {
    window.location.href = url
  },
}
