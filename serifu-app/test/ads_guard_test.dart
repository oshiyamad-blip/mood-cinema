// 広告ポリシーの構造ガード：
// 「広告はホーム画面だけ。練習中には絶対に表示しない」をソースレベルで強制する。
// 誰かがうっかり他画面に AdBanner を追加したらこのテストが落ちる。
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final screensDir = Directory('lib/screens');

  test('AdBanner（バナー）を置いてよいのはホームとリザルトだけ（練習中の画面は禁止）', () {
    // バナー広告を表示してよい画面（練習「中」ではない画面のみ）。
    const allowed = {'home_screen.dart', 'result_screen.dart'};
    final violations = <String>[];
    for (final f in screensDir.listSync().whereType<File>()) {
      if (!f.path.endsWith('.dart')) continue;
      final src = f.readAsStringSync();
      // バナーウィジェットの設置のみを禁止対象にする（広告の同意設定など、
      // バナー表示を伴わない広告モジュール参照は設定画面などで許容する）。
      final usesBanner = src.contains('AdBanner');
      final name = f.uri.pathSegments.last;
      if (usesBanner && !allowed.contains(name)) violations.add(f.path);
    }
    expect(violations, isEmpty,
        reason: 'バナー広告はホームとリザルトのみ。練習中の表示は禁止: $violations');
  });

  test('広告モジュールを参照してよい画面を限定する（同意設定は設定画面のみ）', () {
    // ads/ads.dart を import してよいのは、バナー設置画面＋同意設定を置く設定画面のみ。
    const allowed = {
      'home_screen.dart',
      'result_screen.dart',
      'settings_screen.dart',
    };
    final violations = <String>[];
    for (final f in screensDir.listSync().whereType<File>()) {
      if (!f.path.endsWith('.dart')) continue;
      final src = f.readAsStringSync();
      final name = f.uri.pathSegments.last;
      if (src.contains('ads/ads.dart') && !allowed.contains(name)) {
        violations.add(f.path);
      }
    }
    expect(violations, isEmpty,
        reason: '広告モジュールの参照が想定外の画面にあります: $violations');
  });

  test('練習画面（リハーサル）は広告モジュールを一切参照しない', () {
    final src = File('lib/screens/rehearsal_screen.dart').readAsStringSync();
    expect(src.contains("import '../ads/"), isFalse,
        reason: 'リハーサル画面から広告への参照を検出。練習中に広告を出してはいけない。');
    expect(src.contains('AdBanner'), isFalse);
    expect(src.contains('google_mobile_ads'), isFalse);
  });

  test('ホームのバナーはルート監視付き（裏に隠れたら破棄する実装）', () {
    final src = File('lib/ads/ads_mobile.dart').readAsStringSync();
    // 見えないインプレッション防止（AdMobポリシー）の実装が消えていないこと。
    expect(src.contains('RouteAware'), isTrue);
    expect(src.contains('didPushNext'), isTrue);
    expect(src.contains('nonPersonalizedAds: true'), isTrue);
  });

  test('全世界配信の同意管理（UMP）が実装されている', () {
    final src = File('lib/ads/ads_mobile.dart').readAsStringSync();
    // EEA/英国向けの同意取得と、同意前は広告を要求しないゲートが消えていないこと。
    expect(src.contains('requestConsentInfoUpdate'), isTrue);
    expect(src.contains('loadAndShowConsentFormIfRequired'), isTrue);
    expect(src.contains('canRequestAds'), isTrue);
    // 同意が済むまでバナーをロードしないゲート。
    expect(src.contains('adsReady'), isTrue);
  });

  test('Web/モバイルの広告サービスは同じ公開APIを持つ', () {
    final stub = File('lib/ads/ads_stub.dart').readAsStringSync();
    // ホーム/設定が条件付きインポートでどちらの実装でも壊れないよう、
    // スタブ側にも同意関連APIを用意しておくこと。
    for (final api in ['adsReady', 'privacyOptionsRequired', 'showPrivacyOptions']) {
      expect(stub.contains(api), isTrue, reason: 'スタブに $api がありません');
    }
  });
}
