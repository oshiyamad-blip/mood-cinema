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

    // AppBar タイトルとアップグレード導線、空状態メッセージが描画される。
    expect(find.text('セリフ稽古'), findsOneWidget);
    expect(find.text('台本を取り込んで練習を始めましょう'), findsOneWidget);
    expect(find.byIcon(Icons.workspace_premium_outlined), findsOneWidget);
  });
}
