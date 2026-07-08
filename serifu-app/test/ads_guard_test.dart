// 広告ポリシーの構造ガード：
// 「広告はホーム画面だけ。練習中には絶対に表示しない」をソースレベルで強制する。
// 誰かがうっかり他画面に AdBanner を追加したらこのテストが落ちる。
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final screensDir = Directory('lib/screens');

  test('AdBanner を使ってよいのはホーム画面だけ（練習画面等は禁止）', () {
    final violations = <String>[];
    for (final f in screensDir.listSync().whereType<File>()) {
      if (!f.path.endsWith('.dart')) continue;
      final src = f.readAsStringSync();
      final usesAds = src.contains('AdBanner') || src.contains("ads/ads.dart");
      final isHome = f.path.endsWith('home_screen.dart');
      if (usesAds && !isHome) violations.add(f.path);
    }
    expect(violations, isEmpty,
        reason: '広告はホーム画面のみ。practice中の表示は禁止: $violations');
  });

  test('練習画面（リハーサル）は広告モジュールを一切参照しない', () {
    final src = File('lib/screens/rehearsal_screen.dart').readAsStringSync();
    expect(src.contains('ads'), isFalse,
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
}
