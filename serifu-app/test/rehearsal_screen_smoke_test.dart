import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serifu_app/data/sample_script.dart';
import 'package:serifu_app/screens/rehearsal_screen.dart';
import 'package:serifu_app/theme/app_theme.dart';

/// 練習画面のスモークテスト。
/// プラグイン（TTS・認識・録音）はテスト環境に無いが、すべての呼び出しが
/// 失敗しても画面が構築でき、進行が固まらないことを保証する。
void main() {
  testWidgets('練習画面が構築でき、表示モードの4段階が出る', (tester) async {
    final script = buildSampleScript()..myCharacter = 'ミナ';
    await tester.pumpWidget(
      MaterialApp(theme: AppTheme.light(), home: RehearsalScreen(script: script)),
    );
    // 自動開始と事前合成のタイマーを少し進める（例外が出ないこと）。
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(seconds: 1));

    expect(find.text('台本'), findsOneWidget);
    expect(find.text('伏せ字'), findsOneWidget);
    expect(find.text('頭文字'), findsOneWidget);
    expect(find.text('暗記'), findsOneWidget);

    // 台本の行が表示されている。
    expect(find.textContaining('ごめん、待った？'), findsWidgets);

    // 画面を破棄してもタイマー等が残らない。
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));
    await tester.pump(const Duration(seconds: 35)); // 残タイマーを消化
  });
}
