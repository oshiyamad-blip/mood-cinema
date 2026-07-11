import 'dart:io';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_tts/flutter_tts.dart';
import 'package:path_provider/path_provider.dart';

import '../models/script.dart';
import 'device_speech_engine.dart';
import 'speech_text.dart';

/// 事前合成済み音声の参照（lineId → 音声ファイルパス）。
class PreparedAudio {
  PreparedAudio(this.pathByLineId);
  final Map<String, String> pathByLineId;
  String? pathFor(String lineId) => pathByLineId[lineId];
  bool get isEmpty => pathByLineId.isEmpty;
}

/// 読み込み（練習開始）時に、相手役・ト書きの音声をすべて事前合成しておくサービス。
///
/// 目的：本番中に「自分が言い終わってからAIが返すまで」の処理時間をゼロにする。
/// 合成は重い処理なので開始前に完了させ、本番は再生するだけにする。
///
/// `flutter_tts.synthesizeToFile` が未対応の環境では該当行をスキップし、
/// 再生側がライブ合成（speak）にフォールバックする。
class LineAudioPreparer {
  LineAudioPreparer({this.languageCode = 'ja-JP'});
  final String languageCode;

  final FlutterTts _tts = FlutterTts();

  Future<PreparedAudio> prepare(
    List<Line> lines, {
    required String? myCharacter,
    required bool readDirections,
    required VoiceProfile Function(String character) voiceFor,
    required VoiceProfile narrator,
    void Function(int done, int total)? onProgress,
    void Function(String lineId, String path)? onLineReady,
  }) async {
    // Webは synthesizeToFile / 一時ファイルが使えないため事前合成しない。
    // 再生側が常時ライブ合成（SpeechSynthesis）にフォールバックする。
    if (kIsWeb) return PreparedAudio(const {});
    await _tts.setLanguage(languageCode);
    // 合成完了まで await する（未設定だとファイルが書き終わる前に戻り、
    // 空/不完全ファイルを掴む恐れがある）。
    await _tts.awaitSynthCompletion(true);

    // 合成対象＝自分以外のセリフ ＋（読み上げ設定なら）ト書き。
    // メタ情報（表紙・登場人物表など）は対象外。
    final targets = lines.where((l) {
      if (l.type == LineType.meta) return false;
      if (l.type == LineType.direction) return readDirections;
      return l.speaker != myCharacter;
    }).where((l) => speechText(l.text).isNotEmpty).toList();

    final dir = await getTemporaryDirectory();
    final ext = Platform.isIOS ? 'caf' : 'wav';
    final map = <String, String>{};
    var done = 0;

    for (final line in targets) {
      final profile =
          line.type == LineType.direction ? narrator : voiceFor(line.speaker ?? '');
      await _tts.setSpeechRate(DeviceSpeechEngine.mapRate(profile.rate));
      await _tts.setPitch(profile.pitch.clamp(0.5, 2.0));
      if (profile.voiceId != null && profile.voiceId!.isNotEmpty) {
        await _tts.setVoice({'name': profile.voiceId!, 'locale': languageCode});
      }

      final fullPath = '${dir.path}/line_${line.id}.$ext';
      try {
        // （）内は演技指示なので声に出さない。
        final result =
            await _tts.synthesizeToFile(speechText(line.text), fullPath, true);
        if (result == 1 && await File(fullPath).exists()) {
          map[line.id] = fullPath;
          // 準備完了した行から順次使えるように通知（バックグラウンド準備用）。
          onLineReady?.call(line.id, fullPath);
        }
      } catch (_) {
        // 未対応プラットフォーム → 再生側でライブ合成にフォールバック。
      }

      done++;
      onProgress?.call(done, targets.length);
    }

    return PreparedAudio(map);
  }

  Future<void> dispose() async {
    await _tts.stop();
  }
}
