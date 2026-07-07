import 'package:flutter/foundation.dart' show kIsWeb;

import 'purchase_service.dart';

/// 無料/有料の機能ゲート。
///
/// **現在の配布方針：完全無料＋控えめな広告**（[freeWithAds]）。
/// 全機能を無料で開放し、ホーム画面下部の小さなバナー広告でマネタイズする。
/// 練習画面（リハーサル）には広告を出さない。
/// サブスクを再導入する場合は [freeWithAds] を false に戻せば
/// 従来のプロ判定（RevenueCat）に復帰する。
class Features {
  Features._();

  /// 完全無料＋広告モード。
  static const freeWithAds = true;

  /// 無料で保存できる台本の上限（サブスク時代の名残。freeWithAds では未使用）。
  static const freeScriptLimit = 3;

  /// Web版はPC確認用のため全機能を解放する（課金はモバイルのみ）。
  static bool get isPro =>
      freeWithAds || kIsWeb || PurchaseService.instance.isPro;

  static bool get unlimitedScripts => isPro;
  static bool get handsFree => isPro;
  static bool get voiceModelSelection => isPro;
  static bool get cloudVoices => isPro; // 将来のクラウド音声
}
