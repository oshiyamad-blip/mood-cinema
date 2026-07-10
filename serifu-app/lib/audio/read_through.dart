import 'dart:math' as math;

/// 通し本読み（二人での読み合わせの連続録音）の1行分の音声区間。
class ReadThroughSegment {
  const ReadThroughSegment({
    required this.lineId,
    required this.startMs,
    required this.endMs,
    required this.endRefined,
  });

  final String lineId;

  /// この行を言い始めた時刻（録音開始からの経過ms。タップで記録）。
  final int startMs;

  /// 言い終わった時刻。音量ログから「最後に声があった瞬間」を割り出した値。
  final int endMs;

  /// 音量ログから言い終わりを特定できたか。false のとき [endMs] は
  /// 次のタップ時刻そのままで、「間」の計算には使えない。
  final bool endRefined;

  int get durationMs => math.max(0, endMs - startMs);

  /// 再生に使える区間か。声が検出でき、極端に短くない
  /// （タップの二度押しでスキップした行などを弾く）。
  bool get hasVoice => endRefined && durationMs >= 250;

  Map<String, dynamic> toJson() => {
        'lineId': lineId,
        'startMs': startMs,
        'endMs': endMs,
        'endRefined': endRefined,
      };

  factory ReadThroughSegment.fromJson(Map<String, dynamic> json) =>
      ReadThroughSegment(
        lineId: json['lineId'] as String? ?? '',
        startMs: (json['startMs'] as num?)?.toInt() ?? 0,
        endMs: (json['endMs'] as num?)?.toInt() ?? 0,
        endRefined: json['endRefined'] as bool? ?? false,
      );
}

/// 通し本読み1本分の区間データ。
///
/// 練習では「行の音声」と「行の直前の間（ま）」の両方をここから引く。
/// 間は本人たちの掛け合いのテンポそのものなので、既定の返しの間より優先される。
class ReadThroughData {
  ReadThroughData({
    required List<ReadThroughSegment> segments,
    this.recordedAt,
  })  : segments = List.unmodifiable(segments),
        _indexByLineId = {
          for (var i = 0; i < segments.length; i++) segments[i].lineId: i,
        };

  final List<ReadThroughSegment> segments;
  final DateTime? recordedAt;
  final Map<String, int> _indexByLineId;

  /// 記録された間がどれだけ長くても、練習ではこの長さで打ち切る
  /// （タップミス等で異常に開いた境界がそのまま練習を止めないように）。
  static const maxGapMs = 10000;

  ReadThroughSegment? segmentFor(String lineId) {
    final i = _indexByLineId[lineId];
    return i == null ? null : segments[i];
  }

  /// この行の直前の「間」：前の行の言い終わり→この行の言い始め。
  /// 先頭行、または前の行の言い終わりを特定できなかった場合は null
  /// （呼び出し側で既定の間にフォールバックする）。
  int? gapBeforeMs(String lineId) {
    final i = _indexByLineId[lineId];
    if (i == null || i == 0) return null;
    final prev = segments[i - 1];
    if (!prev.endRefined) return null;
    final gap = segments[i].startMs - prev.endMs;
    return gap.clamp(0, maxGapMs);
  }

  Map<String, dynamic> toJson() => {
        'segments': [for (final s in segments) s.toJson()],
        if (recordedAt != null) 'recordedAt': recordedAt!.toIso8601String(),
      };

  factory ReadThroughData.fromJson(Map<String, dynamic> json) =>
      ReadThroughData(
        segments: [
          for (final s in (json['segments'] as List? ?? const []))
            ReadThroughSegment.fromJson(Map<String, dynamic>.from(s as Map)),
        ],
        recordedAt: DateTime.tryParse(json['recordedAt'] as String? ?? ''),
      );
}

/// 録音中の音量サンプル（経過ms・dBFS）。
class AmplitudeSample {
  const AmplitudeSample(this.ms, this.dbfs);
  final int ms;
  final double dbfs;
}

/// 言い終わりの余韻。語尾の子音や息を切らないよう少しだけ後ろに足す。
const trailingPadMs = 150;

/// 音量ログから「声」とみなすしきい値(dBFS)を推定する。
///
/// 端末ごとにマイク感度が違うため固定値は使えない。録音全体の最大音量から
/// 一定幅（18dB）下までを声とみなす。ログが空・ずっと無音（マイク不調等）の
/// ときは 0 を返し、何も声と判定させない（endRefined が立たず、間の再現は
/// その録音では行われない＝既定動作に安全に縮退する）。
double estimateSpeechThreshold(List<AmplitudeSample> amplitudes) {
  if (amplitudes.isEmpty) return 0;
  var maxDb = -160.0;
  for (final a in amplitudes) {
    if (a.dbfs > maxDb) maxDb = a.dbfs;
  }
  if (maxDb <= -60) return 0;
  return maxDb - 18;
}

/// タップ時刻と音量ログから行ごとの区間を組み立てる（純関数・テスト可能）。
///
/// [taps] は行順で「その行を言い始めた瞬間」のタップ。行の終わりは、
/// 次のタップまでの窓の中で**最後に声があった時刻**＋余韻とする。
/// 声を検出できなかった行は窓の終端を仮の終わりとし [ReadThroughSegment.endRefined]
/// を false にする（その境界では間の再現をしない）。
List<ReadThroughSegment> buildSegments({
  required List<({String lineId, int tapMs})> taps,
  required List<AmplitudeSample> amplitudes,
  required int totalMs,
  double? speechThresholdDb,
}) {
  final thr = speechThresholdDb ?? estimateSpeechThreshold(amplitudes);
  final out = <ReadThroughSegment>[];
  for (var i = 0; i < taps.length; i++) {
    final start = taps[i].tapMs;
    final windowEnd = i + 1 < taps.length ? taps[i + 1].tapMs : totalMs;
    int? lastLoud;
    if (thr != 0) {
      for (final a in amplitudes) {
        if (a.ms < start || a.ms >= windowEnd) continue;
        if (a.dbfs >= thr) lastLoud = a.ms;
      }
    }
    final ll = lastLoud;
    final refined = ll != null;
    final end = refined ? math.min(ll + trailingPadMs, windowEnd) : windowEnd;
    out.add(ReadThroughSegment(
      lineId: taps[i].lineId,
      startMs: start,
      endMs: math.max(end, start),
      endRefined: refined,
    ));
  }
  return out;
}
