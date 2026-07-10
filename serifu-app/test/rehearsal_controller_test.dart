import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:serifu_app/models/script.dart';
import 'package:serifu_app/rehearsal/rehearsal_controller.dart';

/// テスト用の読み上げ器。話した行を記録し、必要なら再生を「詰まらせて」
/// stop() までブロックできる（一時停止のテスト用）。
class FakeSpeaker implements RehearsalLineSpeaker {
  final spokenIds = <String>[];
  bool blockNext = false;
  Completer<void>? _gate;

  @override
  Future<void> speakLine(Line line) async {
    spokenIds.add(line.id);
    if (blockNext) {
      _gate = Completer<void>();
      await _gate!.future;
    }
  }

  @override
  Future<void> stop() async {
    _gate?.complete();
    _gate = null;
  }
}

/// 指定した行の読み上げで例外を投げる読み上げ器（再生失敗の模擬）。
class _ThrowingSpeaker implements RehearsalLineSpeaker {
  _ThrowingSpeaker({required this.throwOnId});
  final String throwOnId;
  final spokenIds = <String>[];

  @override
  Future<void> speakLine(Line line) async {
    spokenIds.add(line.id);
    if (line.id == throwOnId) throw Exception('再生失敗（壊れたファイル等）');
  }

  @override
  Future<void> stop() async {}
}

Line dialogue(String id, String speaker, String text) =>
    Line(id: id, type: LineType.dialogue, speaker: speaker, text: text);
Line direction(String id, String text) =>
    Line(id: id, type: LineType.direction, text: text);
Line meta(String id, String text) =>
    Line(id: id, type: LineType.meta, text: text);

RehearsalController controller(
  List<Line> lines,
  FakeSpeaker speaker, {
  String? myCharacter = '太郎',
  bool readDirections = true,
}) =>
    RehearsalController(
      lines: lines,
      myCharacter: myCharacter,
      readDirections: readDirections,
      speaker: speaker,
      directionPause: Duration.zero, // テストを速くする
    );

void main() {
  test('メタ情報（表紙・登場人物表）は読み上げずに飛ばす', () async {
    final sp = FakeSpeaker();
    final c = controller([
      meta('m0', 'タイトル'),
      meta('m1', '登場人物表'),
      dialogue('l0', '花子', 'おはよう'),
      dialogue('l1', '太郎', 'おはよう、花子'),
    ], sp);

    await c.run();

    expect(sp.spokenIds, ['l0']); // メタは speakLine されない
    expect(c.phase, RehearsalPhase.waitingForUser);
    expect(c.index, 3);
  });

  test('聞き流しモード：自分のセリフも読み上げ、止まらず最後まで進む', () async {
    final sp = FakeSpeaker();
    final c = RehearsalController(
      lines: [
        dialogue('l0', '花子', 'おはよう'),
        dialogue('l1', '太郎', 'おはよう、花子'),
        direction('l2', '二人、歩き出す。'),
        dialogue('l3', '花子', '今日は早いね'),
      ],
      myCharacter: '太郎',
      readDirections: true,
      speaker: sp,
      listenMode: true,
      directionPause: Duration.zero,
    );

    await c.run();

    expect(sp.spokenIds, ['l0', 'l1', 'l2', 'l3']); // 自分のl1も読まれる
    expect(c.phase, RehearsalPhase.finished);
  });

  test('聞き流しモードを途中でOFFにすると次の自分の番で止まる', () async {
    final sp = FakeSpeaker();
    final c = RehearsalController(
      lines: [
        dialogue('l0', '太郎', 'A'),
        dialogue('l1', '花子', 'B'),
        dialogue('l2', '太郎', 'C'),
      ],
      myCharacter: '太郎',
      readDirections: true,
      speaker: sp,
      listenMode: true,
      directionPause: Duration.zero,
    );

    // l0（自分）を読んだ直後にOFFへ切り替わるケースを模す。
    c.listenMode = false;
    await c.run();

    expect(sp.spokenIds, isEmpty); // l0は自分の番として停止
    expect(c.phase, RehearsalPhase.waitingForUser);
  });

  test('相手のセリフを読み、自分の番で waitingForUser になる', () async {
    final sp = FakeSpeaker();
    final c = controller([
      dialogue('l0', '花子', 'おはよう'),
      dialogue('l1', '太郎', 'おはよう、花子'),
      dialogue('l2', '花子', '今日は早いね'),
    ], sp);

    await c.run();

    expect(sp.spokenIds, ['l0']);
    expect(c.phase, RehearsalPhase.waitingForUser);
    expect(c.index, 1);
    expect(c.isMine(c.currentLine!), isTrue);
  });

  test('advanceMine で次の相手セリフへ進み、最後まで行くと finished', () async {
    final sp = FakeSpeaker();
    final c = controller([
      dialogue('l0', '花子', 'A'),
      dialogue('l1', '太郎', 'B'),
      dialogue('l2', '花子', 'C'),
    ], sp);

    await c.run(); // l0 → 自分の番(l1)
    await c.advanceMine(); // l1を言えた → l2 → 終端

    expect(sp.spokenIds, ['l0', 'l2']);
    expect(c.phase, RehearsalPhase.finished);
    expect(c.atEnd, isTrue);
  });

  test('ト書き: readDirections=false なら読み上げず間だけ置く', () async {
    final sp = FakeSpeaker();
    final c = controller([
      direction('d0', '朝、駅のホーム'),
      dialogue('l1', '花子', 'おはよう'),
    ], sp, readDirections: false);

    await c.run();

    expect(sp.spokenIds, ['l1']); // ト書きは話されない
    expect(c.phase, RehearsalPhase.finished);
  });

  test('ト書き: readDirections=true なら読み上げる', () async {
    final sp = FakeSpeaker();
    final c = controller([
      direction('d0', '朝、駅のホーム'),
      dialogue('l1', '花子', 'おはよう'),
    ], sp);

    await c.run();

    expect(sp.spokenIds, ['d0', 'l1']);
  });

  test('pause で読み上げ中に中断でき、位置は進まない', () async {
    final sp = FakeSpeaker()..blockNext = true;
    final c = controller([
      dialogue('l0', '花子', '長いセリフ…'),
      dialogue('l1', '花子', '次のセリフ'),
    ], sp);

    final running = c.run(); // l0 の再生でブロックされる
    await Future<void>.delayed(Duration.zero);
    expect(c.running, isTrue);

    await c.pause(); // stop() がブロックを解く
    await running;

    expect(sp.spokenIds, ['l0']); // l1 には進んでいない
    expect(c.index, 0);
    expect(c.phase, RehearsalPhase.idle);
    expect(c.running, isFalse);
  });

  test('pause 後に run で同じ行から再開できる', () async {
    final sp = FakeSpeaker()..blockNext = true;
    final c = controller([
      dialogue('l0', '花子', 'A'),
      dialogue('l1', '太郎', 'B'),
    ], sp);

    final first = c.run();
    await Future<void>.delayed(Duration.zero);
    await c.pause();
    await first;

    sp.blockNext = false;
    await c.run(); // l0 を再度読み → 自分の番

    expect(sp.spokenIds, ['l0', 'l0']);
    expect(c.phase, RehearsalPhase.waitingForUser);
    expect(c.index, 1);
  });

  test('jump は範囲内にクランプされ、空台本では何もしない', () async {
    final sp = FakeSpeaker();
    final c = controller([
      dialogue('l0', '花子', 'A'),
      dialogue('l1', '花子', 'B'),
      dialogue('l2', '花子', 'C'),
    ], sp);

    await c.jump(5);
    expect(c.index, 2); // 上限にクランプ
    await c.jump(-10);
    expect(c.index, 0); // 下限にクランプ

    final empty = controller(<Line>[], sp);
    await empty.jump(1); // クラッシュしない（過去の clamp(0,-1) バグの回帰テスト）
    expect(empty.index, 0);
  });

  test('restart で先頭に戻る', () async {
    final sp = FakeSpeaker();
    final c = controller([
      dialogue('l0', '花子', 'A'),
      dialogue('l1', '花子', 'B'),
    ], sp);

    await c.run();
    expect(c.phase, RehearsalPhase.finished);

    await c.restart();
    expect(c.index, 0);
    expect(c.phase, RehearsalPhase.idle);

    await c.run();
    expect(sp.spokenIds, ['l0', 'l1', 'l0', 'l1']);
  });

  test('自分の役が未設定(null)なら全行を読み上げて finished', () async {
    final sp = FakeSpeaker();
    final c = controller([
      dialogue('l0', '花子', 'A'),
      dialogue('l1', '太郎', 'B'),
    ], sp, myCharacter: null);

    await c.run();

    expect(sp.spokenIds, ['l0', 'l1']);
    expect(c.phase, RehearsalPhase.finished);
  });

  test('連続する自分のセリフでも1行ずつ止まる', () async {
    final sp = FakeSpeaker();
    final c = controller([
      dialogue('l0', '太郎', 'A'),
      dialogue('l1', '太郎', 'B'),
      dialogue('l2', '花子', 'C'),
    ], sp);

    await c.run();
    expect(c.phase, RehearsalPhase.waitingForUser);
    expect(c.index, 0);

    await c.advanceMine();
    expect(c.phase, RehearsalPhase.waitingForUser);
    expect(c.index, 1);

    await c.advanceMine();
    expect(sp.spokenIds, ['l2']);
    expect(c.phase, RehearsalPhase.finished);
  });

  group('返しの間（replyPause）', () {
    test('advanceMine の後、間を置いてから相手が返す', () async {
      final sp = FakeSpeaker();
      final c = RehearsalController(
        lines: [
          dialogue('l0', '太郎', 'A'), // 自分
          dialogue('l1', '花子', 'B'), // 相手
        ],
        myCharacter: '太郎',
        readDirections: true,
        speaker: sp,
        directionPause: Duration.zero,
        replyPauseProvider: () => const Duration(milliseconds: 40),
      );

      await c.run(); // 自分の番で停止
      final sw = Stopwatch()..start();
      await c.advanceMine(); // 間(40ms) → l1 を読む
      sw.stop();

      expect(sp.spokenIds, ['l1']);
      expect(sw.elapsedMilliseconds, greaterThanOrEqualTo(35));
      expect(c.phase, RehearsalPhase.finished);
    });

    test('間の途中で pause すると相手は話さない（中断可能）', () async {
      final sp = FakeSpeaker();
      final c = RehearsalController(
        lines: [
          dialogue('l0', '太郎', 'A'),
          dialogue('l1', '花子', 'B'),
        ],
        myCharacter: '太郎',
        readDirections: true,
        speaker: sp,
        directionPause: Duration.zero,
        replyPauseProvider: () => const Duration(milliseconds: 200),
      );

      await c.run();
      final advancing = c.advanceMine(); // 200ms の間に入る
      await Future<void>.delayed(const Duration(milliseconds: 20));
      await c.pause(); // 間の途中で停止
      await advancing;

      expect(sp.spokenIds, isEmpty); // l1 は話されていない
      expect(c.phase, RehearsalPhase.idle);
      expect(c.index, 1); // 位置は相手の行のまま（再開すれば l1 から）
    });

    test('プロバイダ未指定なら従来どおり即レス', () async {
      final sp = FakeSpeaker();
      final c = controller([
        dialogue('l0', '太郎', 'A'),
        dialogue('l1', '花子', 'B'),
      ], sp);

      await c.run();
      await c.advanceMine();
      expect(sp.spokenIds, ['l1']);
    });
  });

  group('読み上げ失敗でも進行が固まらない（返ってこないバグ対策）', () {
    test('相手のセリフの読み上げが例外を投げても次の行へ進む', () async {
      // 壊れた録音ファイルやTTS失敗を模して speakLine が投げる状況。
      final sp = _ThrowingSpeaker(throwOnId: 'l1');
      final c = RehearsalController(
        lines: [
          dialogue('l0', '花子', 'A'), // 相手（正常）
          dialogue('l1', '花子', 'B'), // 相手（再生失敗）
          dialogue('l2', '花子', 'C'), // 相手（正常）
          dialogue('l3', '太郎', 'D'), // 自分
        ],
        myCharacter: '太郎',
        readDirections: true,
        speaker: sp,
        directionPause: Duration.zero,
      );

      await c.run(); // l0,l1(失敗),l2 を経て自分の番(l3)で停止
      expect(c.phase, RehearsalPhase.waitingForUser);
      expect(c.index, 3); // 失敗した l1 で止まらず l3 まで到達
      expect(sp.spokenIds, ['l0', 'l1', 'l2']); // l1 も試行はした
    });
  });

  test('phase の変化が通知される（UI副作用のフック地点）', () async {
    final sp = FakeSpeaker();
    final c = controller([
      dialogue('l0', '花子', 'A'),
      dialogue('l1', '太郎', 'B'),
    ], sp);

    final phases = <RehearsalPhase>[];
    var last = c.phase;
    c.addListener(() {
      if (c.phase != last) {
        phases.add(c.phase);
        last = c.phase;
      }
    });

    await c.run();
    expect(phases, [RehearsalPhase.playing, RehearsalPhase.waitingForUser]);
  });
}
