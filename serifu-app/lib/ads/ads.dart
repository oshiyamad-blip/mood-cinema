/// 広告モジュールの入口。
///
/// 完全無料＋広告モデル（Features.freeWithAds）で使用する。
/// - モバイル（iOS/Android）: AdMob のバナー広告
/// - Web: 広告なし（何も描画しないスタブ）
///
/// 方針：広告は**ホーム画面下部の小さなバナー1枠のみ**。
/// 練習画面（リハーサル）には出さない（稽古の邪魔をしない）。
/// 読み込みに失敗した場合は何も表示しない（レイアウトを崩さない）。
library;

export 'ads_stub.dart' if (dart.library.io) 'ads_mobile.dart';
