import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serifu_app/screens/home_screen.dart';
import 'package:serifu_app/theme/app_theme.dart';

void main() {
  testWidgets('HomeScreen がテーマ適用で構築できる（空状態）', (tester) async {
    await tester.pumpWidget(
      MaterialApp(theme: AppTheme.light(), home: const HomeScreen()),
    );
    await tester.pump();

    // AppBar タイトルと空状態メッセージが描画される。
    // （完全無料＋広告モデルのためアップグレード導線は無い。）
    expect(find.text('ホンヨミ'), findsOneWidget);
    expect(find.text('練習する台本を用意しましょう'), findsOneWidget);
    // 2択：取り込み or サンプルで試す
    expect(find.text('台本を取り込む'), findsWidgets);
    expect(find.text('サンプル台本で試す'), findsOneWidget);
    expect(find.byIcon(Icons.workspace_premium_outlined), findsNothing);
    expect(find.byIcon(Icons.settings_outlined), findsOneWidget);
  });
}
