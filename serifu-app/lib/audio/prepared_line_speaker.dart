import 'dart:async';

import 'package:audioplayers/audioplayers.dart';

import '../models/script.dart';
import '../rehearsal/rehearsal_controller.dart';
import '../speech/line_audio_preparer.dart';
import '../speech/speech_engine.dart';
import '../speech/speech_text.dart';
import 'read_through.dart';

/// 事前合成済みの音声を再生する読み上げ器。
/// 合成が無い行は端末TTSでライブ合成する。
/// 再生完了は audioplayers の状態イベントで待つ（ポーリングしない）。
class PreparedLineSpeaker implements RehearsalLineSpeaker {
  PreparedLineSpeaker({
    required this.player,
    required this.engine,
    required this.narrator,
    required this.voiceFor,
    required this.preparedGetter,
    required this.readThroughGetter,
  });

  final AudioPlayer player;
  final SpeechEngine engine;
  final VoiceProfile narrator;
  final VoiceProfile Function(String character) voiceFor;
  final PreparedAudio? Function() preparedGetter;

  /// 通し本読み（実際の声）。区間のある行はTTSより優先して再生する。
  final ({ReadThroughData data, String audioPath})? Function() readThroughGetter;

  @override
  Future<void> speakLine(Line line) async {
    final rt = readThroughGetter();
    final seg = rt?.data.segmentFor(line.id);
    if (rt != null && seg != null && seg.hasVoice) {
      await _playSegment(rt.audioPath, seg);
      return;
    }
    final path = preparedGetter()?.pathFor(line.id);
    if (path != null) {
      await _playFile(path);
    } else {
      final profile =
          line.type == LineType.direction ? narrator : voiceFor(line.speaker ?? '');
      // （）内は演技指示なので声に出さない。
      await engine.speak(speechText(line.text), profile);
    }
  }

  Future<void> _playFile(String path) async {
    final done = Completer<void>();
    // completed（再生終了）または stopped（stop()による中断）で解決する。
    // 進行は逐次実行なので、前の再生の残留イベントを拾う心配はない。
    final sub = player.onPlayerStateChanged.listen((st) {
      if (st == PlayerState.completed || st == PlayerState.stopped) {
        if (!done.isCompleted) done.complete();
      }
    });
    try {
      await player.play(DeviceFileSource(path));
      // 壊れた/空の録音ファイル等で完了イベントが来ないと永久に待ってしまう。
      // 安全弁として上限時間で必ず解決し、次の行へ進める。
      // このとき再生も止める（鳴らしっぱなしのままマイクと重ならないように）。
      await done.future.timeout(const Duration(seconds: 30), onTimeout: () async {
        await player.stop();
      });
    } finally {
      await sub.cancel();
    }
  }

  /// 通し録音のうち1行分の区間だけを再生する。
  /// 終端は位置イベント（精密）とタイマー（保険）の二重で止める。
  Future<void> _playSegment(String path, ReadThroughSegment seg) async {
    final done = Completer<void>();
    final sub = player.onPlayerStateChanged.listen((st) {
      if (st == PlayerState.completed || st == PlayerState.stopped) {
        if (!done.isCompleted) done.complete();
      }
    });
    final posSub = player.onPositionChanged.listen((p) {
      if (p.inMilliseconds >= seg.endMs) player.stop();
    });
    // シークや再生開始のもたつき分の余裕をみたタイマー保険。
    final guard = Timer(Duration(milliseconds: seg.durationMs + 800), () {
      player.stop();
    });
    try {
      await player.play(
        DeviceFileSource(path),
        position: Duration(milliseconds: seg.startMs),
      );
      await done.future.timeout(
        Duration(milliseconds: seg.durationMs + 5000),
        onTimeout: () async {
          await player.stop();
        },
      );
    } finally {
      guard.cancel();
      await posSub.cancel();
      await sub.cancel();
    }
  }

  @override
  Future<void> stop() async {
    await player.stop(); // stopped イベントで _playFile が解決する
    await engine.stop();
  }
}
