import 'purchase_service.dart';

/// 無料/有料の機能ゲート（docs/03-monetization.md の線引きに対応）。
///
/// 無料：端末内蔵TTS・台本表示/暗記モード・男女ボイス・台本 [freeScriptLimit] 件まで。
/// 有料（pro）：台本無制限・ハンズフリー進行・声モデル選択・（将来）クラウド高品質音声・広告なし。
class Features {
  Features._();

  /// 無料で保存できる台本の上限。
  static const freeScriptLimit = 3;

  static bool get isPro => PurchaseService.instance.isPro;

  static bool get unlimitedScripts => isPro;
  static bool get handsFree => isPro;
  static bool get voiceModelSelection => isPro;
  static bool get cloudVoices => isPro; // 将来のクラウド音声
}
