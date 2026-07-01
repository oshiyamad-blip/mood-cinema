import 'script.dart';

/// アプリ全体の既定設定。
class AppSettings {
  AppSettings({
    this.defaultGender = Gender.female,
    this.defaultRate = 1.0,
    this.defaultReadDirections = true,
    this.autoAdvanceSeconds = 0, // 0 = 手動（自分の番で止まる）
    this.useCloudVoices = false, // クラウド高品質音声（Pro・要設定）
  });

  /// 新規台本の相手役に適用する既定の声。
  Gender defaultGender;
  double defaultRate;

  /// 新規台本のト書き読み上げ既定。
  bool defaultReadDirections;

  /// 自分の番の自動進行秒数（0なら手動）。
  int autoAdvanceSeconds;

  /// クラウド高品質音声を使うか（Pro かつ エンドポイント設定時のみ有効）。
  bool useCloudVoices;

  AppSettings copyWith({
    Gender? defaultGender,
    double? defaultRate,
    bool? defaultReadDirections,
    int? autoAdvanceSeconds,
    bool? useCloudVoices,
  }) {
    return AppSettings(
      defaultGender: defaultGender ?? this.defaultGender,
      defaultRate: defaultRate ?? this.defaultRate,
      defaultReadDirections: defaultReadDirections ?? this.defaultReadDirections,
      autoAdvanceSeconds: autoAdvanceSeconds ?? this.autoAdvanceSeconds,
      useCloudVoices: useCloudVoices ?? this.useCloudVoices,
    );
  }

  Map<String, dynamic> toJson() => {
        'defaultGender': defaultGender.name,
        'defaultRate': defaultRate,
        'defaultReadDirections': defaultReadDirections,
        'autoAdvanceSeconds': autoAdvanceSeconds,
        'useCloudVoices': useCloudVoices,
      };

  factory AppSettings.fromJson(Map<String, dynamic> json) => AppSettings(
        defaultGender: Gender.values.byName((json['defaultGender'] as String?) ?? 'female'),
        defaultRate: (json['defaultRate'] as num?)?.toDouble() ?? 1.0,
        defaultReadDirections: (json['defaultReadDirections'] as bool?) ?? true,
        autoAdvanceSeconds: (json['autoAdvanceSeconds'] as num?)?.toInt() ?? 0,
        useCloudVoices: (json['useCloudVoices'] as bool?) ?? false,
      );
}
