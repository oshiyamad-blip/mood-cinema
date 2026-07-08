import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serifu_app/models/script.dart';
import 'package:serifu_app/rehearsal/take_recorder.dart';
import 'package:serifu_app/screens/result_screen.dart';
import 'package:serifu_app/theme/app_theme.dart';

Script _script() => Script(
      id: 's1',
      title: 'テスト台本',
      characters: ['太郎', '花子'],
      myCharacter: '太郎',
      importedAt: DateTime(2026),
      lines: [
        Line(id: 'l0', type: LineType.dialogue, speaker: '太郎', text: 'やあ'),
        Line(id: 'l1', type: LineType.dialogue, speaker: '花子', text: 'ひさしぶり'),
        Line(id: 'l2', type: LineType.dialogue, speaker: '太郎', text: '元気？'),
        Line(id: 'd0', type: LineType.direction, text: '二人、笑う'),
      ],
    );

void main() {
  testWidgets('稽古モード：タイトル・所要時間・自分のセリフ数・導線が表示される', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.light(),
      home: ResultScreen(
        script: _script(),
        duration: const Duration(minutes: 3, seconds: 24),
        listenMode: false,
      ),
    ));
    await tester.pump();

    expect(find.text('テスト台本'), findsOneWidget);
    expect(find.text('最後まで通せました'), findsOneWidget);
    expect(find.text('3分24秒'), findsOneWidget);
    expect(find.text('自分のセリフ'), findsOneWidget);
    expect(find.text('2行'), findsOneWidget); // 太郎のセリフは2行
    expect(find.text('もう一度練習する'), findsOneWidget);
    expect(find.text('台本に戻る'), findsOneWidget);
  });

  testWidgets('聞き流しモード：全セリフ数の表記に切り替わる', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.light(),
      home: ResultScreen(
        script: _script(),
        duration: const Duration(seconds: 45),
        listenMode: true,
      ),
    ));
    await tester.pump();

    expect(find.text('聞き流しモードで通し終えました'), findsOneWidget);
    expect(find.text('45秒'), findsOneWidget);
    expect(find.text('セリフ数'), findsOneWidget);
    expect(find.text('3行'), findsOneWidget); // 全セリフ3行
  });

  testWidgets('「台本に戻る」で前の画面へ戻れる', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.light(),
      home: Builder(
        builder: (context) => Center(
          child: ElevatedButton(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => ResultScreen(
                  script: _script(),
                  duration: Duration.zero,
                  listenMode: false,
                ),
              ),
            ),
            child: const Text('open'),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(find.text('練習おつかれさまでした'), findsOneWidget);

    await tester.tap(find.text('台本に戻る'));
    await tester.pumpAndSettle();
    expect(find.text('open'), findsOneWidget);
  });

  testWidgets('「つまずいたかも？」セクションに理由バッジ付きでセリフが出る', (tester) async {
    final script = _script();
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.light(),
      home: ResultScreen(
        script: script,
        duration: const Duration(minutes: 1),
        listenMode: false,
        stuck: [
          StuckLine(
              line: script.lines[0], reason: StuckReason.peeked, elapsedMs: 1000),
          StuckLine(
              line: script.lines[2], reason: StuckReason.slow, elapsedMs: 9000),
        ],
      ),
    ));
    await tester.pump();

    expect(find.text('つまずいたかも？'), findsOneWidget);
    expect(find.text('チラ見'), findsOneWidget);
    expect(find.text('時間がかかった'), findsOneWidget);
    expect(find.text('「やあ」'), findsOneWidget);
    expect(find.text('「元気？」'), findsOneWidget);
  });
}
