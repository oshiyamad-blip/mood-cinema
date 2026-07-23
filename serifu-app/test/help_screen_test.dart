import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serifu_app/screens/help_screen.dart';
import 'package:serifu_app/theme/app_theme.dart';

void main() {
  Future<void> pump(WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(theme: AppTheme.light(), home: const HelpScreen()),
    );
    await tester.pump();
  }

  testWidgets('FAQと問い合わせ窓口が表示される', (tester) async {
    await pump(tester);

    expect(find.text('よくある質問'), findsOneWidget);
    expect(find.text('お問い合わせ'), findsOneWidget);
    // 代表的なFAQ項目。
    expect(find.text('台本がうまく読み込めない・セリフが崩れる'), findsOneWidget);
    expect(find.text('台本や録音のデータはどこに保存される？'), findsOneWidget);
    // 窓口メールアドレスが見える。
    expect(find.text(HelpScreen.supportEmail), findsOneWidget);
  });

  testWidgets('FAQをタップすると回答が開く', (tester) async {
    await pump(tester);

    await tester.tap(find.text('広告を消したい・料金はかかる？'));
    await tester.pumpAndSettle();
    expect(find.textContaining('全機能を無料で使えます'), findsOneWidget);
  });

  testWidgets('アドレスのコピーで窓口メールがクリップボードに入り、スナックバーが出る',
      (tester) async {
    final copied = <String?>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') {
        copied.add((call.arguments as Map)['text'] as String?);
      }
      return null;
    });
    await pump(tester);

    await tester.ensureVisible(find.text('アドレスをコピー'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('アドレスをコピー'));
    await tester.pump();
    expect(copied, [HelpScreen.supportEmail]);
    expect(find.text('メールアドレスをコピーしました'), findsOneWidget);
  });

  test('定型文に調査に必要な項目が含まれる', () {
    expect(HelpScreen.mailTemplate, contains('ホンヨミ'));
    expect(HelpScreen.mailTemplate, contains('ご利用端末'));
    expect(HelpScreen.mailTemplate, contains('OSバージョン'));
    expect(HelpScreen.mailTemplate, contains('お困りの内容'));
  });
}
