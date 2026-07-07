import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serifu_app/models/script.dart';
import 'package:serifu_app/screens/script_edit_screen.dart';
import 'package:serifu_app/theme/app_theme.dart';

Script _sampleScript() => Script(
      id: 's1',
      title: 'テスト台本',
      characters: ['太郎', '花子'],
      importedAt: DateTime(2026),
      lines: [
        Line(id: 'm0', type: LineType.meta, text: 'タイトル'),
        Line(id: 'm1', type: LineType.meta, text: '作：山田'),
        Line(id: 'm2', type: LineType.meta, text: '登場人物表'),
        Line(id: 'm3', type: LineType.meta, text: '太郎（２８）'),
        Line(id: 'm4', type: LineType.meta, text: '花子（２６）'),
        Line(id: 'd0', type: LineType.direction, text: '○公園・昼'),
        Line(id: 'l0', type: LineType.dialogue, speaker: '太郎', text: 'やあ'),
        Line(id: 'l1', type: LineType.dialogue, speaker: '花子', text: 'ひさしぶり'),
      ],
    );

Future<void> _pump(WidgetTester tester, Script script) async {
  await tester.pumpWidget(
    MaterialApp(theme: AppTheme.light(), home: ScriptEditScreen(script: script)),
  );
  await tester.pump();
}

void main() {
  testWidgets('サマリーに種別ごとの行数と役が表示される', (tester) async {
    await _pump(tester, _sampleScript());

    expect(find.text('セリフ 2行'), findsOneWidget);
    expect(find.text('ト書き 1行'), findsOneWidget);
    expect(find.text('読まない 5行'), findsOneWidget);
    // 役バッジ（サマリー）と行の話者バッジの両方に出る。
    expect(find.text('太郎'), findsWidgets);
  });

  testWidgets('連続する「読まない」行は折りたたまれ、タップで展開する', (tester) async {
    await _pump(tester, _sampleScript());

    // 5行のメタは折りたたみ表示。
    expect(find.textContaining('読み上げ対象外 5行'), findsOneWidget);
    expect(find.text('作：山田'), findsNothing);

    await tester.tap(find.textContaining('読み上げ対象外 5行'));
    await tester.pump();
    expect(find.text('作：山田'), findsOneWidget);
  });

  testWidgets('フィルタ「セリフ」で絞り込める', (tester) async {
    await _pump(tester, _sampleScript());

    await tester.tap(find.widgetWithText(ChoiceChip, 'セリフ'));
    await tester.pump();

    expect(find.text('やあ'), findsOneWidget);
    expect(find.text('ひさしぶり'), findsOneWidget);
    expect(find.text('○公園・昼'), findsNothing);
  });

  testWidgets('行をタップすると修正シートが開き、種別を変更できる', (tester) async {
    final script = _sampleScript();
    await _pump(tester, script);

    await tester.tap(find.text('○公園・昼'));
    await tester.pumpAndSettle();

    // シート内の3値トグルが表示される。
    expect(find.text('読まない'), findsWidgets);

    // 「セリフ」へ変更 → 話者が自動で割り当てられる。
    // （シート内のトグルのセグメントを直接タップする。）
    await tester.tap(find.descendant(
      of: find.byType(SegmentedButton<LineType>),
      matching: find.text('セリフ'),
    ));
    await tester.pump();
    final line = script.lines.firstWhere((l) => l.id == 'd0');
    expect(line.type, LineType.dialogue);
    expect(line.speaker, '太郎');
  });

  testWidgets('「確認完了」ボタンで true を返して閉じる', (tester) async {
    bool? result;
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Builder(
          builder: (context) => Center(
            child: ElevatedButton(
              onPressed: () async {
                result = await Navigator.of(context).push<bool>(
                  MaterialPageRoute(
                      builder: (_) => ScriptEditScreen(script: _sampleScript())),
                );
              },
              child: const Text('open'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('確認完了 — 役を選んで練習へ'));
    await tester.pumpAndSettle();
    expect(result, isTrue);
  });
}
