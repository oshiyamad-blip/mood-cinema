import 'script.dart';

/// アプリ全体の既定設定。
class AppSettings {
  AppSettings({
    this.defaultGender = Gender.female,
    // 読み合わせは会話としてやや速めが自然（実機フィードバックにより既定1.7x）。
    this.defaultRate = 1.7,
    this.defaultReadDirections = true,
    this.autoAdvanceSeconds = 0, // 0 = 手動（自分の番で止まる）
    this.replyPauseMillis = 1000, // 自分のセリフ後、相手が返すまでの間（ms・既定1秒）
    this.useCloudVoices = false, // クラウド高品質音声（Pro・要設定）
    this.highAccuracyRecognition = false, // 音声認識にクラウドを許可（精度優先）
  });

  /// 新規台本の相手役に適用する既定の声。
  Gender defaultGender;
  double defaultRate;

  /// 新規台本のト書き読み上げ既定。
  bool defaultReadDirections;

  /// 自分の番の自動進行秒数（0なら手動）。
  int autoAdvanceSeconds;

  /// 自分のセリフを言い終えてから相手が返すまでの間（ミリ秒、0=即レス）。
  /// 芝居の「間」を作るための調整。
  int replyPauseMillis;

  /// クラウド高品質音声を使うか（Pro かつ エンドポイント設定時のみ有効）。
  bool useCloudVoices;

  /// ハンズフリーの音声認識でクラウド（OSの認識サービス）を許可するか。
  /// false（既定）＝可能な限りオンデバイス認識（プライバシー優先）。
  bool highAccuracyRecognition;

  AppSettings copyWith({
    Gender? defaultGender,
    double? defaultRate,
    bool? defaultReadDirections,
    int? autoAdvanceSeconds,
    int? replyPauseMillis,
    bool? useCloudVoices,
    bool? highAccuracyRecognition,
  }) {
    return AppSettings(
      defaultGender: defaultGender ?? this.defaultGender,
      defaultRate: defaultRate ?? this.defaultRate,
      defaultReadDirections: defaultReadDirections ?? this.defaultReadDirections,
      autoAdvanceSeconds: autoAdvanceSeconds ?? this.autoAdvanceSeconds,
      replyPauseMillis: replyPauseMillis ?? this.replyPauseMillis,
      useCloudVoices: useCloudVoices ?? this.useCloudVoices,
      highAccuracyRecognition: highAccuracyRecognition ?? this.highAccuracyRecognition,
    );
  }

  Map<String, dynamic> toJson() => {
        'defaultGender': defaultGender.name,
        'defaultRate': defaultRate,
        'defaultReadDirections': defaultReadDirections,
        'autoAdvanceSeconds': autoAdvanceSeconds,
        'replyPauseMillis': replyPauseMillis,
        'useCloudVoices': useCloudVoices,
        'highAccuracyRecognition': highAccuracyRecognition,
      };

  factory AppSettings.fromJson(Map<String, dynamic> json) => AppSettings(
        defaultGender: Gender.values.byName((json['defaultGender'] as String?) ?? 'female'),
        defaultRate: (json['defaultRate'] as num?)?.toDouble() ?? 1.7,
        defaultReadDirections: (json['defaultReadDirections'] as bool?) ?? true,
        autoAdvanceSeconds: (json['autoAdvanceSeconds'] as num?)?.toInt() ?? 0,
        replyPauseMillis: (json['replyPauseMillis'] as num?)?.toInt() ?? 1000,
        useCloudVoices: (json['useCloudVoices'] as bool?) ?? false,
        highAccuracyRecognition: (json['highAccuracyRecognition'] as bool?) ?? false,
      );
}
