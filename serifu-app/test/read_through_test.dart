import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:serifu_app/audio/read_through.dart';
import 'package:serifu_app/audio/read_through_store.dart';

void main() {
  group('buildSegments（タップ＋音量ログ→区間）', () {
    test('音量ログから言い終わりを精密化し、間が残る', () {
      // 行A: 1000msに開始、2500msまで声。行B: 4000msに開始（間=約1.5秒）。
      final segs = buildSegments(
        taps: [(lineId: 'a', tapMs: 1000), (lineId: 'b', tapMs: 4000)],
        amplitudes: [
          const AmplitudeSample(1200, -20),
          const AmplitudeSample(2000, -18),
          const AmplitudeSample(2500, -22), // 行Aの最後の声
          const AmplitudeSample(3000, -55), // 無音（間）
          const AmplitudeSample(3500, -58),
          const AmplitudeSample(4200, -19), // 行Bの声
          const AmplitudeSample(5000, -21),
        ],
        totalMs: 6000,
      );

      expect(segs, hasLength(2));
      expect(segs[0].lineId, 'a');
      expect(segs[0].startMs, 1000);
      expect(segs[0].endRefined, isTrue);
      // 最後の声(2500) + 余韻(150) = 2650
      expect(segs[0].endMs, 2500 + trailingPadMs);
      expect(segs[1].startMs, 4000);
    });

    test('声を検出できない行は endRefined=false（間の再現に使わない）', () {
      final segs = buildSegments(
        taps: [(lineId: 'a', tapMs: 0), (lineId: 'b', tapMs: 2000)],
        amplitudes: [], // 音量が取れない端末
        totalMs: 4000,
      );
      expect(segs[0].endRefined, isFalse);
      expect(segs[0].endMs, 2000); // 窓の終端を仮の終わりに
      expect(segs[1].endMs, 4000);
    });

    test('余韻は次のタップ（窓の終端）を越えない', () {
      final segs = buildSegments(
        taps: [(lineId: 'a', tapMs: 0), (lineId: 'b', tapMs: 1050)],
        amplitudes: [const AmplitudeSample(1000, -20)],
        totalMs: 3000,
        speechThresholdDb: -38,
      );
      expect(segs[0].endMs, 1050); // 1000+150 は 1050 で打ち切り
    });

    test('しきい値の推定：最大音量から一定幅下、全無音なら検出なし', () {
      expect(
        estimateSpeechThreshold([
          const AmplitudeSample(0, -40),
          const AmplitudeSample(100, -15),
        ]),
        -15 - 18,
      );
      // ずっと無音（マイク不調）→ 0 が返り、何も声と判定されない。
      expect(
        estimateSpeechThreshold([const AmplitudeSample(0, -80)]),
        0,
      );
      expect(estimateSpeechThreshold([]), 0);
    });
  });

  group('ReadThroughData（間の参照とJSON）', () {
    ReadThroughData data() => ReadThroughData(segments: [
          const ReadThroughSegment(
              lineId: 'a', startMs: 0, endMs: 1000, endRefined: true),
          const ReadThroughSegment(
              lineId: 'b', startMs: 1800, endMs: 3000, endRefined: false),
          const ReadThroughSegment(
              lineId: 'c', startMs: 3600, endMs: 5000, endRefined: true),
        ]);

    test('gapBeforeMs は前の行の言い終わりからの間', () {
      expect(data().gapBeforeMs('b'), 800); // 1800 - 1000
    });

    test('先頭行・未知の行・前の行が endRefined=false なら null', () {
      expect(data().gapBeforeMs('a'), isNull);
      expect(data().gapBeforeMs('zzz'), isNull);
      expect(data().gapBeforeMs('c'), isNull); // b の終わりが不確か
    });

    test('異常に長い間は上限で打ち切る', () {
      final d = ReadThroughData(segments: [
        const ReadThroughSegment(
            lineId: 'a', startMs: 0, endMs: 100, endRefined: true),
        const ReadThroughSegment(
            lineId: 'b', startMs: 99999, endMs: 100500, endRefined: true),
      ]);
      expect(d.gapBeforeMs('b'), ReadThroughData.maxGapMs);
    });

    test('hasVoice：極端に短い区間（二度タップの飛ばし）は声なし扱い', () {
      const skip = ReadThroughSegment(
          lineId: 'x', startMs: 100, endMs: 200, endRefined: true);
      const spoken = ReadThroughSegment(
          lineId: 'y', startMs: 100, endMs: 800, endRefined: true);
      const unrefined = ReadThroughSegment(
          lineId: 'z', startMs: 100, endMs: 3000, endRefined: false);
      expect(skip.hasVoice, isFalse);
      expect(spoken.hasVoice, isTrue);
      expect(unrefined.hasVoice, isFalse);
    });

    test('JSONラウンドトリップで内容が保持される', () {
      final restored = ReadThroughData.fromJson(Map<String, dynamic>.from(
          jsonDecode(jsonEncode(data().toJson())) as Map));
      expect(restored.segments, hasLength(3));
      expect(restored.segmentFor('b')?.startMs, 1800);
      expect(restored.segmentFor('b')?.endRefined, isFalse);
      expect(restored.gapBeforeMs('b'), 800);
    });
  });

  group('ReadThroughStore（保存と読み込み）', () {
    late Directory tmp;
    late ReadThroughStore store;

    setUp(() async {
      tmp = await Directory.systemTemp.createTemp('rt_test_');
      store = ReadThroughStore(baseDirProvider: () async => tmp);
    });

    tearDown(() async {
      await tmp.delete(recursive: true);
    });

    ReadThroughData sample() => ReadThroughData(segments: [
          const ReadThroughSegment(
              lineId: 'a', startMs: 0, endMs: 900, endRefined: true),
        ]);

    test('音声と区間が揃っていれば読み込める', () async {
      final audio = await store.audioPath('s1', create: true);
      await File(audio).writeAsBytes([1, 2, 3]); // ダミー音声
      await store.save('s1', sample());

      final rt = await store.load('s1');
      expect(rt, isNotNull);
      expect(rt!.audioPath, endsWith('/recordings/s1/readthrough.m4a'));
      expect(rt.data.segmentFor('a')?.endMs, 900);
    });

    test('音声だけ・区間だけ・未保存では null（練習は既定動作に縮退）', () async {
      expect(await store.load('none'), isNull);

      final audio = await store.audioPath('s2', create: true);
      await File(audio).writeAsBytes([1]);
      expect(await store.load('s2'), isNull); // JSONなし

      await store.save('s3', sample());
      expect(await store.load('s3'), isNull); // 音声なし
    });

    test('壊れたJSONは null 扱い（例外にしない）', () async {
      final audio = await store.audioPath('s4', create: true);
      await File(audio).writeAsBytes([1]);
      await File('${tmp.path}/recordings/s4/readthrough.json')
          .writeAsString('{{{broken');
      expect(await store.load('s4'), isNull);
    });

    test('delete で音声・区間とも消える', () async {
      final audio = await store.audioPath('s5', create: true);
      await File(audio).writeAsBytes([1]);
      await store.save('s5', sample());
      await store.delete('s5');
      expect(await store.load('s5'), isNull);
      expect(await File(audio).exists(), isFalse);
    });

    test('録音パス判定（練習後クリーンアップから保護）', () {
      expect(
        ReadThroughStore.isRecordingPath('/x/recordings/s1/readthrough.m4a'),
        isTrue,
      );
      expect(ReadThroughStore.isRecordingPath('/tmp/prepared/l1.wav'), isFalse);
    });
  });
}
