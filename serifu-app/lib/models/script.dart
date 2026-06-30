/// 台本データモデル。
///
/// プライバシー要件：台本は端末内のみで扱い、クラウドへは送信しない。
library;

/// 行の種別。
enum LineType {
  dialogue, // セリフ
  direction, // ト書き（場面・動作の説明）
}

/// 声の性別。内蔵TTSのボイス選択にマップする。
enum Gender { male, female }

/// 役ごとの声設定。
class VoiceProfile {
  VoiceProfile({
    this.gender = Gender.female,
    this.rate = 1.0,
    this.pitch = 1.0,
    this.voiceId,
  });

  Gender gender;

  /// 読み上げ速度（0.5〜2.0、既定1.0）。テンポ調整に使用。
  double rate;

  /// ピッチ（既定1.0）。
  double pitch;

  /// 内蔵TTSの具体的なボイスID（任意）。未指定なら gender から自動選択。
  String? voiceId;

  VoiceProfile copyWith({Gender? gender, double? rate, double? pitch, String? voiceId}) {
    return VoiceProfile(
      gender: gender ?? this.gender,
      rate: rate ?? this.rate,
      pitch: pitch ?? this.pitch,
      voiceId: voiceId ?? this.voiceId,
    );
  }
}

/// 台本の1行。
class Line {
  Line({
    required this.id,
    required this.type,
    required this.text,
    this.speaker,
  });

  final String id;
  LineType type;

  /// 話者（役名）。ト書きは null。
  String? speaker;
  String text;
}

/// 台本。
class Script {
  Script({
    required this.id,
    required this.title,
    required this.characters,
    required this.lines,
    required this.importedAt,
    this.lastPracticedAt,
    Map<String, VoiceProfile>? voiceByCharacter,
    this.myCharacter,
    this.readDirections = true,
  }) : voiceByCharacter = voiceByCharacter ?? {};

  final String id;
  String title;

  /// 登場人物（役名）一覧。
  final List<String> characters;
  final List<Line> lines;
  final DateTime importedAt;
  DateTime? lastPracticedAt;

  /// 役名 → 声設定。
  final Map<String, VoiceProfile> voiceByCharacter;

  /// 自分の役。
  String? myCharacter;

  /// ト書きを読み上げるか。
  bool readDirections;

  /// 指定役の声設定を取得（無ければ既定を作成）。
  VoiceProfile voiceFor(String character) {
    return voiceByCharacter.putIfAbsent(character, VoiceProfile.new);
  }
}
