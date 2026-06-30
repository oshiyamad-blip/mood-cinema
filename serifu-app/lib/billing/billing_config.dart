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

  /// 開発時に全機能を解放するフラグ（リリースでは必ず false）。
  static const debugUnlockAll = false;
}
