import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_tts/flutter_tts.dart';

import '../models/script.dart';
import 'auto_voice.dart';
import 'speech_engine.dart';
import 'tts_lock.dart';

/// 端末内蔵TTS（iOS AVSpeechSynthesizer / Android TextToSpeech）を
/// flutter_tts 経由で使う実装。無料・オフライン・台本データは端末外に出ない。
/// Web版ではブラウザの speechSynthesis を使う。
class DeviceSpeechEngine implements SpeechEngine {
  DeviceSpeechEngine({this.languageCode = 'ja-JP'});

  final String languageCode;
  final FlutterTts _tts = FlutterTts();
  bool _initialized = false;

  /// 性別ごとの自動選択ボイス（毎行 getVoices しないためのキャッシュ）。
  /// 端末のボイス一覧が取れなかったときは記録しない（後で取れたら使う）。
  final Map<Gender, String?> _autoVoiceCache = {};

  /// 再生中の発話の完了待ち。stop() で即座に完了させる。
  ///
  /// flutter_tts は停止しても speak の Future を解決しないことがある
  /// （iOS は didCancel で未解決、Web は "interrupted" エラーで握りつぶす）。
  /// そのままだと進行ループがタイムアウト（最大30秒）まで止まり、
  /// その間に再開すると古い発話の後始末が新しい発話を切ってしまう。
  Completer<void>? _pending;

  /// 発話の通し番号。タイムアウト時の stop が新しい発話を切らないように使う。
  int _speakSeq = 0;

  Future<void> _ensureInit() async {
    if (_initialized) return;
    await _tts.setLanguage(languageCode);
    // speak() が完了するまで await できるようにする。
    await _tts.awaitSpeakCompletion(true);
    // iOS: 再生カテゴリの共有オーディオセッションにする。
    // 聞き流しモードを画面オフ/バックグラウンド（UIBackgroundModes=audio）でも
    // 続けられ、本体横の消音スイッチでも音が出る。
    if (!kIsWeb && Platform.isIOS) {
      try {
        await _tts.setSharedInstance(true);
        await _tts.setIosAudioCategory(
          IosTextToSpeechAudioCategory.playback,
          [IosTextToSpeechAudioCategoryOptions.mixWithOthers],
          IosTextToSpeechAudioMode.spokenAudio,
        );
      } catch (_) {
        // セッション設定に失敗しても読み上げ自体は続行できる。
      }
    }
    _initialized = true;
  }

  @override
  Future<List<TtsVoice>> voices(String languageCode) async {
    await _ensureInit();
    // ブラウザ（特にChrome）はボイス一覧を非同期に読み込むため、
    // ページを開いた直後は空のことがある。少し待って取り直す。
    for (var attempt = 0; attempt < (kIsWeb ? 8 : 1); attempt++) {
      try {
        final list = parseVoices(await _tts.getVoices, languageCode);
        if (list.isNotEmpty) return list;
      } catch (_) {}
      if (kIsWeb) await Future<void>.delayed(const Duration(milliseconds: 250));
    }
    return [];
  }

  /// 「自動（性別から選択）」用：性別に合う最も高音質な端末ボイスを返す。
  /// 無ければ null（OS既定のまま）。
  Future<String?> _autoVoiceIdFor(Gender gender) async {
    if (_autoVoiceCache.containsKey(gender)) return _autoVoiceCache[gender];
    final list = await voices(languageCode);
    final picked = pickAutoVoice(list, gender);
    // 一覧が空（まだ読み込まれていない）なら結果を固定しない。
    if (list.isNotEmpty) _autoVoiceCache[gender] = picked?.id;
    return picked?.id;
  }

  /// 男女で同じ声しか選べない環境（Webや性別情報の無い端末）かどうか。
  /// その場合は声の高さで男女を演じ分ける。
  Future<bool> _gendersShareVoice() async {
    final f = await _autoVoiceIdFor(Gender.female);
    final m = await _autoVoiceIdFor(Gender.male);
    return f == m;
  }

  /// 論理速度（0.5〜2.0、1.0＝等速）を各プラットフォームの値へ変換する。
  ///
  /// - iOS/Android の flutter_tts は 0.0〜1.0 で 0.5 が等速 → 半分にする。
  /// - Web はブラウザの SpeechSynthesisUtterance.rate（1.0＝等速）へ
  ///   そのまま渡される → 変換しない（半分にすると既定1.7倍が0.85倍になる）。
  static double platformRate(double rate, {required bool web}) =>
      web ? rate.clamp(0.5, 2.0) : (rate * 0.5).clamp(0.0, 1.0);

  /// 互換用（モバイルの変換）。
  static double mapRate(double rate) => platformRate(rate, web: false);

  /// 声の高さ。明示設定（1.0以外）があればそれを使い、男女で同じ声しか
  /// 無い環境では既定の高さを男女で変えて演じ分ける。
  static double effectivePitch(VoiceProfile profile, {required bool shared}) {
    final p = profile.pitch;
    if (!shared || (p - 1.0).abs() > 0.001) return p.clamp(0.5, 2.0);
    return profile.gender == Gender.male ? 0.8 : 1.15;
  }

  @override
  Future<void> speak(String text, VoiceProfile profile) async {
    if (text.trim().isEmpty) return;
    await _ensureInit();
    final seq = ++_speakSeq;
    // 事前合成と設定・発話が混ざらないよう直列化する。
    await TtsLock.run(() => _speakLocked(text, profile, seq));
  }

  Future<void> _speakLocked(String text, VoiceProfile profile, int seq) async {
    if (seq != _speakSeq) return; // 待っている間に停止された

    // 声：明示指定があればそれを、無ければ性別に合う高音質ボイスを自動選択
    //（端末の拡張/プレミアム音声を無料で活かす）。
    final explicit = profile.voiceId != null && profile.voiceId!.isNotEmpty;
    final voiceId = explicit ? profile.voiceId : await _autoVoiceIdFor(profile.gender);
    final shared = !explicit && await _gendersShareVoice();
    if (seq != _speakSeq) return; // 準備中に停止・次の発話が来た

    // Webはボイス一覧の読込後でないと言語が反映されないため毎回設定する。
    if (kIsWeb) await _tts.setLanguage(languageCode);
    await _tts.setSpeechRate(platformRate(profile.rate, web: kIsWeb));
    await _tts.setPitch(effectivePitch(profile, shared: shared));
    if (voiceId != null && voiceId.isNotEmpty) {
      await _tts.setVoice({'name': voiceId, 'locale': languageCode});
    }
    if (seq != _speakSeq) return;

    // 一部のAndroid OEM TTSでは完了コールバックが発火しないことがあり、
    // await _tts.speak(...) が永久に返らない → 進行が固まる。
    // 発話長と速度から妥当な上限時間を見積もり、超えたら打ち切って先へ進む。
    final slow = profile.rate < 1.0 ? (1.0 / profile.rate) : 1.0;
    final budget = Duration(
        milliseconds:
            ((3000 + text.length * 220) * slow).round().clamp(3000, 45000));
    final done = Completer<void>();
    _pending = done;
    void finish() {
      if (!done.isCompleted) done.complete();
    }

    _tts.speak(text).then((_) => finish(), onError: (_) => finish());
    try {
      await done.future.timeout(budget);
    } on TimeoutException {
      // まだ自分が最新の発話のときだけ止める（新しい発話を切らない）。
      if (seq == _speakSeq) await _tts.stop();
    } finally {
      if (identical(_pending, done)) _pending = null;
    }
  }

  @override
  Future<void> stop() async {
    _speakSeq++; // 準備中・再生中の発話を無効化
    final pending = _pending;
    _pending = null;
    try {
      await _tts.stop();
    } finally {
      if (pending != null && !pending.isCompleted) pending.complete();
    }
  }

  @override
  Future<void> dispose() => stop();
}
