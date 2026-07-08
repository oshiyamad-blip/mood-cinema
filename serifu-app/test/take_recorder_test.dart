import 'package:flutter_test/flutter_test.dart';
import 'package:serifu_app/models/script.dart';
import 'package:serifu_app/rehearsal/take_recorder.dart';

Line _line(String id, String text) =>
    Line(id: id, type: LineType.dialogue, speaker: '私', text: text);

/// フェイク時計：進めたい分だけ加算する。
class FakeClock {
  DateTime now = DateTime(2026, 1, 1);
  void advanceMs(int ms) => now = now.add(Duration(milliseconds: ms));
}

void main() {
  late FakeClock clock;
  late TakeRecorder rec;

  setUp(() {
    clock = FakeClock();
    rec = TakeRecorder(clock: () => clock.now);
  });

  test('チラ見したセリフは所要時間に関係なく最優先で出る', () {
    rec.onMyTurnStart(_line('a', '短いセリフ'));
    rec.onPeek();
    clock.advanceMs(1000); // 速く言えていてもチラ見は記録される
    rec.onAdvance();

    final stuck = rec.stuckLines();
    expect(stuck, hasLength(1));
    expect(stuck.first.reason, StuckReason.peeked);
  });

  test('ハンズフリーのリトライ2回以上は「言い直し」判定', () {
    rec.onMyTurnStart(_line('a', 'このセリフでつまずいた'));
    rec.onListenRestart();
    rec.onListenRestart();
    clock.advanceMs(3000);
    rec.onAdvance();

    expect(rec.stuckLines().single.reason, StuckReason.manyRetries);
  });

  test('期待時間の2.5倍超＋4秒超で「時間がかかった」判定', () {
    // 10文字 → 期待 1500+1500=3000ms。2.5倍=7500ms。
    rec.onMyTurnStart(_line('a', 'あいうえおかきくけこ'));
    clock.advanceMs(8000);
    rec.onAdvance();

    expect(rec.stuckLines().single.reason, StuckReason.slow);
  });

  test('普通のペース（芝居の間程度）は詰まり扱いしない', () {
    rec.onMyTurnStart(_line('a', 'あいうえおかきくけこ'));
    clock.advanceMs(6000); // 期待3000msの2倍 — 間としてありうる範囲
    rec.onAdvance();

    expect(rec.stuckLines(), isEmpty);
  });

  test('自動進行で進んだ行は時間判定から除外する', () {
    rec.onMyTurnStart(_line('a', '短い'));
    clock.advanceMs(60000); // タイマー任せで放置していただけかもしれない
    rec.onAdvance(auto: true);

    expect(rec.stuckLines(), isEmpty);
  });

  test('同じ行をやり直したら記録は上書き（最後のテイクで判定）', () {
    final line = _line('a', 'あいうえおかきくけこ');
    rec.onMyTurnStart(line);
    clock.advanceMs(9000);
    rec.onAdvance(); // 1回目は遅かった

    rec.onMyTurnStart(line); // 頭出しでやり直し
    clock.advanceMs(2000);
    rec.onAdvance(); // 2回目はスラスラ

    expect(rec.stuckLines(), isEmpty);
  });

  test('確度順（チラ見→言い直し→時間）に並び、maxで件数制限', () {
    rec.onMyTurnStart(_line('slow', 'あいうえおかきくけこ'));
    clock.advanceMs(8000);
    rec.onAdvance();

    rec.onMyTurnStart(_line('peek', 'ぱっと出なかった'));
    rec.onPeek();
    clock.advanceMs(1000);
    rec.onAdvance();

    rec.onMyTurnStart(_line('retry', 'いいなおしたセリフ'));
    rec.onListenRestart();
    rec.onListenRestart();
    clock.advanceMs(2000);
    rec.onAdvance();

    final stuck = rec.stuckLines();
    expect(stuck.map((e) => e.reason).toList(), [
      StuckReason.peeked,
      StuckReason.manyRetries,
      StuckReason.slow,
    ]);
    expect(rec.stuckLines(max: 2), hasLength(2));
  });

  group('buildFocusLines（部分練習の行組み立て）', () {
    Line d(String id, String sp, String text) =>
        Line(id: id, type: LineType.dialogue, speaker: sp, text: text);

    test('つまずいた行の直前の非メタ行をキューとして含める', () {
      final lines = [
        Line(id: 'm0', type: LineType.meta, text: 'タイトル'),
        d('a', '相手', 'こんにちは'),
        d('b', '私', 'どうも'),        // つまずいた
        Line(id: 'dir', type: LineType.direction, text: '間'),
        d('c', '私', 'それでは'),      // つまずいた
      ];
      final stuck = [
        StuckLine(line: lines[2], reason: StuckReason.slow, elapsedMs: 9000),
        StuckLine(line: lines[4], reason: StuckReason.peeked, elapsedMs: 1000),
      ];
      final focus = buildFocusLines(lines, stuck);
      expect(focus.map((l) => l.id).toList(), ['a', 'b', 'dir', 'c']);
    });

    test('連続してつまずいた場合もキューが重複しない', () {
      final lines = [
        d('a', '相手', 'きっかけ'),
        d('b', '私', 'ひとつめ'),
        d('c', '私', 'ふたつめ'),
      ];
      final stuck = [
        StuckLine(line: lines[1], reason: StuckReason.slow, elapsedMs: 9000),
        StuckLine(line: lines[2], reason: StuckReason.slow, elapsedMs: 9000),
      ];
      expect(buildFocusLines(lines, stuck).map((l) => l.id).toList(),
          ['a', 'b', 'c']);
    });

    test('冒頭の行がつまずきでもクラッシュしない（キューなし）', () {
      final lines = [d('a', '私', '一行目')];
      final stuck = [
        StuckLine(line: lines[0], reason: StuckReason.peeked, elapsedMs: 100),
      ];
      expect(buildFocusLines(lines, stuck).map((l) => l.id).toList(), ['a']);
    });
  });
}
