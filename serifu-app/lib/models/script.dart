/// 台本データモデル。
///
/// プライバシー要件：台本は端末内のみで扱い、クラウドへは送信しない。
library;

/// 行の種別。
enum LineType {
  dialogue, // セリフ
  direction, // ト書き（場面・動作の説明）
  meta, // メタ情報（表紙・登場人物表など）。読み上げ・進行の対象外。
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

  Map<String, dynamic> toJson() => {
        'gender': gender.name,
        'rate': rate,
        'pitch': pitch,
        'voiceId': voiceId,
      };

  factory VoiceProfile.fromJson(Map<String, dynamic> json) => VoiceProfile(
        gender: Gender.values.byName((json['gender'] as String?) ?? 'female'),
        rate: (json['rate'] as num?)?.toDouble() ?? 1.0,
        pitch: (json['pitch'] as num?)?.toDouble() ?? 1.0,
        voiceId: json['voiceId'] as String?,
      );
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

  Map<String, dynamic> toJson() => {
        'id': id,
        'type': type.name,
        'speaker': speaker,
        'text': text,
      };

  factory Line.fromJson(Map<String, dynamic> json) => Line(
        id: json['id'] as String,
        type: LineType.values.byName((json['type'] as String?) ?? 'dialogue'),
        speaker: json['speaker'] as String?,
        text: (json['text'] as String?) ?? '',
      );
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

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'characters': characters,
        'lines': lines.map((l) => l.toJson()).toList(),
        'importedAt': importedAt.toIso8601String(),
        'lastPracticedAt': lastPracticedAt?.toIso8601String(),
        'voiceByCharacter':
            voiceByCharacter.map((k, v) => MapEntry(k, v.toJson())),
        'myCharacter': myCharacter,
        'readDirections': readDirections,
      };

  factory Script.fromJson(Map<String, dynamic> json) {
    final voices = <String, VoiceProfile>{};
    final rawVoices = (json['voiceByCharacter'] as Map?) ?? {};
    rawVoices.forEach((k, v) {
      voices[k as String] = VoiceProfile.fromJson(Map<String, dynamic>.from(v as Map));
    });
    return Script(
      id: json['id'] as String,
      title: json['title'] as String,
      characters: ((json['characters'] as List?) ?? const [])
          .map((e) => e as String)
          .toList(),
      lines: ((json['lines'] as List?) ?? const [])
          .map((e) => Line.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList(),
      importedAt: DateTime.tryParse((json['importedAt'] as String?) ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      lastPracticedAt: (json['lastPracticedAt'] as String?) != null
          ? DateTime.tryParse(json['lastPracticedAt'] as String)
          : null,
      voiceByCharacter: voices,
      myCharacter: json['myCharacter'] as String?,
      readDirections: (json['readDirections'] as bool?) ?? true,
    );
  }
}
