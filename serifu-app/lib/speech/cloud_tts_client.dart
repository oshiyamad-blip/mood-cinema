import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import '../models/script.dart';

/// クラウド高品質TTSの設定。
///
/// セキュリティ：TTS提供元のAPIキーはクライアントに埋め込まない。
/// アプリは自前の「TTSプロキシ」エンドポイントだけを呼び、鍵はサーバ側に保持する。
/// エンドポイントは `--dart-define=CLOUD_TTS_ENDPOINT=https://...` で注入。
/// 未設定ならクラウド音声は無効（端末TTSへ縮退）。
class CloudTtsConfig {
  CloudTtsConfig._();
  static const endpoint = String.fromEnvironment('CLOUD_TTS_ENDPOINT');
  static const appToken = String.fromEnvironment('CLOUD_TTS_TOKEN');
  static bool get configured => endpoint.isNotEmpty;
}

/// 声プロファイル → クラウド音声名の対応。
///
/// 注意: [VoiceProfile.voiceId] は**端末TTSのボイス名**でありクラウドでは無意味
/// なため使わない。クラウド側の具体的なボイス選択はプロキシがこの論理名から行う。
class CloudVoices {
  CloudVoices._();
  static String forProfile(VoiceProfile p) =>
      p.gender == Gender.male ? 'ja-JP-Male' : 'ja-JP-Female';
}

/// TTSプロキシへ合成を依頼し、音声(mp3)バイト列を得るクライアント。
class CloudTtsClient {
  final http.Client _http = http.Client();

  /// 合成。失敗・未設定なら null（呼び出し側は端末TTSへ縮退）。
  Future<Uint8List?> synthesize({
    required String text,
    required String voice,
    required double rate,
  }) async {
    if (!CloudTtsConfig.configured || text.trim().isEmpty) return null;
    try {
      final res = await _http.post(
        Uri.parse(CloudTtsConfig.endpoint),
        headers: {
          'Content-Type': 'application/json',
          if (CloudTtsConfig.appToken.isNotEmpty)
            'Authorization': 'Bearer ${CloudTtsConfig.appToken}',
        },
        body: jsonEncode({'text': text, 'voice': voice, 'rate': rate, 'format': 'mp3'}),
      );
      if (res.statusCode == 200 && res.bodyBytes.isNotEmpty) {
        return res.bodyBytes;
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  void dispose() => _http.close();
}
