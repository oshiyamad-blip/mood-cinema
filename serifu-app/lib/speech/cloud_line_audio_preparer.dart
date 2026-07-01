import 'dart:io';

import 'package:path_provider/path_provider.dart';

import '../models/script.dart';
import 'cloud_tts_client.dart';
import 'line_audio_preparer.dart' show PreparedAudio;

/// クラウドTTSで相手役・ト書きの音声を事前合成し、mp3をキャッシュする。
/// [LineAudioPreparer] と同じ入出力なので、リハーサル側で差し替えられる。
///
/// 失敗した行は結果に含めない（再生側が端末TTSへ縮退する）。
class CloudLineAudioPreparer {
  CloudLineAudioPreparer({this.languageCode = 'ja-JP'});
  final String languageCode;

  final CloudTtsClient _client = CloudTtsClient();

  Future<PreparedAudio> prepare(
    List<Line> lines, {
    required String? myCharacter,
    required bool readDirections,
    required VoiceProfile Function(String character) voiceFor,
    required VoiceProfile narrator,
    void Function(int done, int total)? onProgress,
  }) async {
    final targets = lines.where((l) {
      if (l.type == LineType.direction) return readDirections;
      return l.speaker != myCharacter;
    }).where((l) => l.text.trim().isNotEmpty).toList();

    final dir = await getTemporaryDirectory();
    final map = <String, String>{};
    var done = 0;

    for (final line in targets) {
      final profile =
          line.type == LineType.direction ? narrator : voiceFor(line.speaker ?? '');
      final bytes = await _client.synthesize(
        text: line.text,
        voice: CloudVoices.forProfile(profile),
        rate: profile.rate,
      );
      if (bytes != null) {
        final file = File('${dir.path}/cloud_${line.id}.mp3');
        await file.writeAsBytes(bytes, flush: true);
        map[line.id] = file.path;
      }
      done++;
      onProgress?.call(done, targets.length);
    }

    return PreparedAudio(map);
  }

  Future<void> dispose() async => _client.dispose();
}
