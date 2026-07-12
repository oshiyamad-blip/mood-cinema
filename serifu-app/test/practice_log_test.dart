import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:serifu_app/data/practice_log.dart';

void main() {
  late Directory tmp;
  late PracticeLog log;

  PracticeRecord rec(int stuck,
          {int my = 10, bool listen = false, bool focus = false, int? h}) =>
      PracticeRecord(
        at: DateTime(2026, 7, 12, h ?? 10),
        durationSec: 120,
        stuckCount: stuck,
        myLineCount: my,
        listenMode: listen,
        focus: focus,
      );

  setUp(() async {
    tmp = await Directory.systemTemp.createTemp('plog_test_');
    log = PracticeLog(baseDirProvider: () async => tmp);
  });

  tearDown(() async {
    await tmp.delete(recursive: true);
  });

  test('追記→読み出しで内容が保持される（台本ごとに独立）', () async {
    await log.add('s1', rec(3));
    await log.add('s1', rec(1, h: 11));
    await log.add('s2', rec(5));
    final s1 = await log.forScript('s1');
    expect(s1, hasLength(2));
    expect(s1.last.stuckCount, 1);
    expect(await log.forScript('s2'), hasLength(1));
    expect(await log.forScript('none'), isEmpty);
  });

  test('上限を超えると古い記録から間引かれる', () async {
    for (var i = 0; i < PracticeLog.maxPerScript + 5; i++) {
      await log.add('s1', rec(i % 4));
    }
    final list = await log.forScript('s1');
    expect(list, hasLength(PracticeLog.maxPerScript));
  });

  test('remove で台本の記録が消える', () async {
    await log.add('s1', rec(3));
    await log.remove('s1');
    expect(await log.forScript('s1'), isEmpty);
  });

  test('仕上がり度: 詰まらなかった自分のセリフの割合', () {
    expect(rec(0).score, 100);
    expect(rec(3).score, 70);
    expect(rec(99).score, 0); // 分母超えは0で頭打ち
    expect(rec(0, my: 0).score, 100); // 自分のセリフ0行でも安全
  });

  test('latestFullRuns は通し稽古だけを比較対象にする', () {
    // 聞き流し・部分練習は飛ばして直近2つの通しを返す。
    final runs = latestFullRuns([
      rec(5),
      rec(9, listen: true),
      rec(2, h: 11),
      rec(8, focus: true),
    ]);
    expect(runs?.latest.stuckCount, 2);
    expect(runs?.previous?.stuckCount, 5);

    expect(latestFullRuns([rec(9, listen: true)]), isNull);
    expect(latestFullRuns([rec(1)])?.previous, isNull);
  });
}
