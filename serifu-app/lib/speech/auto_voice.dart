import '../models/script.dart';
import 'speech_engine.dart';

/// 端末ボイスの自動選択（無料で声の質を上げる中核ロジック・純Dart）。
///
/// 「自動（性別から選択）」のとき、これまではOSの既定ボイス（標準音質）で
/// 鳴っていた。端末には無料の高音質ボイス（iOSの「拡張/プレミアム」、
/// Android Google TTS の network 版など）が入っていることが多いので、
/// 性別が合う中で**最も高音質なボイス**を明示的に選ぶ。

/// ボイスIDから音質スコアを推定する。値が大きいほど高音質。
///
/// - iOS: 識別子に premium / enhanced / compact が含まれる
///   （例: com.apple.voice.enhanced.ja-JP.Kyoko）。
/// - Android(Google TTS): `-network` はサーバ級モデル、`-local` は端末内蔵。
int voiceQualityScore(String id) {
  final s = id.toLowerCase();
  var score = 0;
  if (s.contains('premium')) score += 30;
  if (s.contains('enhanced')) score += 20;
  if (s.contains('network')) score += 10;
  if (s.contains('compact')) score -= 10;
  return score;
}

/// flutter_tts の getVoices 結果から日本語（等）のボイス一覧を作る。
/// エンジンと事前合成の両方で同じ解釈を使うため共通化。
List<TtsVoice> parseVoices(dynamic raw, String languageCode) {
  final list = raw as List<dynamic>?;
  if (list == null) return [];
  final lang = languageCode.toLowerCase().split('-').first;
  final result = <TtsVoice>[];
  for (final v in list) {
    final map = Map<String, dynamic>.from(v as Map);
    final locale = (map['locale'] ?? '').toString();
    if (!locale.toLowerCase().startsWith(lang)) continue;
    final name = (map['name'] ?? '').toString();
    result.add(TtsVoice(id: name, name: name, gender: guessVoiceGender(map)));
  }
  return result;
}

/// プラットフォームによっては gender 情報が無いため推測（ヒューリスティック）。
Gender? guessVoiceGender(Map<String, dynamic> map) {
  final g = (map['gender'] ?? '').toString().toLowerCase();
  if (g.contains('male') && !g.contains('female')) return Gender.male;
  if (g.contains('female')) return Gender.female;
  return null;
}

/// 指定の性別に合う中で最も高音質なボイスを選ぶ。無ければ null（OS既定）。
///
/// - 性別が一致するボイスを最優先、gender 不明のボイスも候補に含める
///   （Android は gender 情報が無いことが多い）。
/// - スコアが同じなら性別一致 > 一覧の並び順。
TtsVoice? pickAutoVoice(List<TtsVoice> voices, Gender gender) {
  TtsVoice? best;
  var bestScore = 0;
  var bestGenderMatch = false;
  for (final v in voices) {
    if (v.gender != null && v.gender != gender) continue;
    final score = voiceQualityScore(v.id);
    final genderMatch = v.gender == gender;
    final better = best == null ||
        score > bestScore ||
        (score == bestScore && genderMatch && !bestGenderMatch);
    if (better) {
      best = v;
      bestScore = score;
      bestGenderMatch = genderMatch;
    }
  }
  // 高音質でも性別一致でもない1件だけを選んでも意味が薄いが、
  // 明示指定は無害（OS既定と同等以上）なのでそのまま返す。
  return best;
}
