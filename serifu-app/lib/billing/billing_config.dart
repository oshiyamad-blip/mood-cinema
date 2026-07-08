/// 課金（RevenueCat）の設定。
///
/// APIキーは公開リポジトリにコミットしない。実運用では
/// `--dart-define=RC_IOS_KEY=...` / `RC_ANDROID_KEY=...` で注入する。
/// 未設定なら課金は「無効化」され、アプリは無料層として正常動作する
/// （このプロジェクトの「未設定でも安全に縮退」方針に従う）。
class BillingConfig {
  BillingConfig._();

  static const iosApiKey = String.fromEnvironment('RC_IOS_KEY');
  static const androidApiKey = String.fromEnvironment('RC_ANDROID_KEY');

  /// 有料アクセスを表すエンタイトルメント識別子（RevenueCat ダッシュボードと一致させる）。
  static const entitlementId = 'pro';

  /// 全機能を解放するフラグ。実機レビュー用ビルドでのみ
  /// `--dart-define=UNLOCK_ALL=true` を渡して有効化する（ストア用は必ず未指定=false）。
  static const debugUnlockAll = bool.fromEnvironment('UNLOCK_ALL');
}
