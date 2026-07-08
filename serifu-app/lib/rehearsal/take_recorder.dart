import '../models/script.dart';

/// 「詰まったかも」の理由。確度の高い順。
enum StuckReason {
  /// 暗記モードでチラ見した（覚えていなかった＝ほぼ確実）。
  peeked,

  /// ハンズフリーで聞き取りのリトライが多発した（言い直し・詰まりの可能性大）。
  manyRetries,

  /// セリフの長さから見て所要時間が長かった（芝居の間の可能性もある）。
  slow,
}

/// リザルトに出す1件分。
class StuckLine {
  const StuckLine({
    required this.line,
    required this.reason,
    required this.elapsedMs,
  });

  final Line line;
  final StuckReason reason;
  final int elapsedMs;
}

/// 練習中の「自分の番」ごとの様子を記録し、詰まった可能性の高いセリフを推定する。
///
/// 芝居の「間」と本当に詰まったのは完全には区別できないため、
/// - チラ見・リトライ多発という**行動ベースの強いシグナル**を優先し、
/// - 時間だけによる判定は「期待時間の2.5倍超かつ4秒以上」と保守的にする。
/// - 自動進行（タイマー）で進んだ行は所要時間の意味が違うので判定から除外する。
///
/// 純Dart・時計注入式でテスト可能（lib/screens には依存しない）。
class TakeRecorder {
  TakeRecorder({DateTime Function()? clock}) : _clock = clock ?? DateTime.now;

  final DateTime Function() _clock;

  final Map<String, _Take> _takes = {};
  _Take? _current;

  /// 自分の番が始まった。
  void onMyTurnStart(Line line) {
    // 同じ行に戻ってきた場合は取り直し＝前の記録を上書きする。
    _current = _Take(line: line, startedAt: _clock());
    _takes[line.id] = _current!;
  }

  /// 暗記モードでチラ見した。
  void onPeek() => _current?.peeked = true;

  /// ハンズフリーの聞き取りをリトライした。
  void onListenRestart() => _current?.restarts++;

  /// 自分の番が終わった。[auto] は自動進行タイマーによる進行。
  void onAdvance({bool auto = false}) {
    final t = _current;
    if (t == null) return;
    t.elapsedMs = _clock().difference(t.startedAt).inMilliseconds;
    t.autoAdvanced = auto;
    _current = null;
  }

  /// セリフの長さに応じた期待所要時間（読み上げ＋ひと呼吸）。
  /// 日本語の発話はおよそ6〜7字/秒 → 150ms/字 + 固定1.5秒。
  static int expectedMs(Line line) => 1500 + line.text.length * 150;

  /// 詰まった可能性の高い順に返す（チラ見 → リトライ多 → 時間超過）。
  List<StuckLine> stuckLines({int max = 5}) {
    final result = <StuckLine>[];
    for (final t in _takes.values) {
      if (t.elapsedMs == null) continue;
      if (t.peeked) {
        result.add(StuckLine(
            line: t.line, reason: StuckReason.peeked, elapsedMs: t.elapsedMs!));
      } else if (t.restarts >= 2) {
        result.add(StuckLine(
            line: t.line,
            reason: StuckReason.manyRetries,
            elapsedMs: t.elapsedMs!));
      } else if (!t.autoAdvanced &&
          t.elapsedMs! > 4000 &&
          t.elapsedMs! > expectedMs(t.line) * 2.5) {
        result.add(StuckLine(
            line: t.line, reason: StuckReason.slow, elapsedMs: t.elapsedMs!));
      }
    }
    result.sort((a, b) {
      final byReason = a.reason.index.compareTo(b.reason.index);
      if (byReason != 0) return byReason;
      return b.elapsedMs.compareTo(a.elapsedMs);
    });
    return result.take(max).toList();
  }
}

class _Take {
  _Take({required this.line, required this.startedAt});
  final Line line;
  final DateTime startedAt;
  bool peeked = false;
  int restarts = 0;
  bool autoAdvanced = false;
  int? elapsedMs;
}
