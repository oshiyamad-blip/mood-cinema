import 'package:flutter/foundation.dart';

import '../models/script.dart';

/// リハーサルの進行フェーズ。
enum RehearsalPhase {
  idle, // 停止中（開始前・一時停止後）
  playing, // 相手役/ト書きを再生中
  waitingForUser, // 自分の番（ユーザーの発話/操作待ち）
  finished, // 最後まで到達
}

/// 行の読み上げ器の抽象。
///
/// 実機では「事前合成音声の再生（無ければ端末TTS）」、テストではフェイクを渡す。
/// [speakLine] は**その行の再生が完了するまで**待つこと。
/// [stop] は進行の中断時に呼ばれ、進行中の [speakLine] を速やかに解決させること。
abstract class RehearsalLineSpeaker {
  Future<void> speakLine(Line line);
  Future<void> stop();
}

/// リハーサルの進行ロジック（UIから分離した純粋なステートマシン）。
///
/// - 相手役・ト書き：[RehearsalLineSpeaker] で読み上げて次へ。
/// - ト書きは [readDirections] が false のとき読み上げず [directionPause] だけ置く。
/// - 自分のセリフ：[RehearsalPhase.waitingForUser] で停止し、[advanceMine] を待つ。
/// - [listenMode]（聞き流し）では自分のセリフでも止まらず全て読み上げる
///   （耳で覚える用途。ト書きを含めるかは [readDirections] に従う）。
///
/// UI（ハンズフリー・自動進行タイマー・スクロール）は phase/index の変化を
/// listen して側で行う。ロジック自体はここで単体テストできる。
class RehearsalController extends ChangeNotifier {
  RehearsalController({
    required List<Line> lines,
    required this.myCharacter,
    required this.readDirections,
    required RehearsalLineSpeaker speaker,
    this.listenMode = false,
    this.directionPause = const Duration(milliseconds: 500),
    Duration Function()? replyPauseProvider,
  })  : _lines = lines,
        _speaker = speaker,
        _replyPauseProvider = replyPauseProvider;

  final List<Line> _lines;
  final String? myCharacter;
  final bool readDirections;

  /// 聞き流しモード：自分のセリフも読み上げ、ユーザー待ちにしない。
  /// 練習中に切り替えられるよう可変（次の判定から反映される）。
  bool listenMode;

  final RehearsalLineSpeaker _speaker;

  /// ト書きを読まない設定のときに置く間。
  final Duration directionPause;

  /// 自分のセリフの後、相手が返すまでの「間」を返すプロバイダ
  /// （設定変更を即時反映できるよう毎回読む）。null なら間なし。
  final Duration Function()? _replyPauseProvider;

  int _index = 0;
  RehearsalPhase _phase = RehearsalPhase.idle;
  bool _running = false;
  bool _disposed = false;

  /// advanceMine 直後の再開時に「返しの間」を置くためのフラグ。
  bool _pendingReplyPause = false;

  List<Line> get lines => List.unmodifiable(_lines);
  int get index => _index;
  RehearsalPhase get phase => _phase;
  bool get running => _running;
  bool get atEnd => _index >= _lines.length;
  Line? get currentLine => _index < _lines.length ? _lines[_index] : null;

  bool isMine(Line l) => l.type == LineType.dialogue && l.speaker == myCharacter;

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  void _setPhase(RehearsalPhase p) {
    if (_phase == p) return;
    _phase = p;
    _notify();
  }

  /// 現在位置から進行を開始（または再開）する。
  Future<void> run() async {
    if (_running) return;
    _running = true;
    _setPhase(RehearsalPhase.playing);

    while (_running && _index < _lines.length) {
      final line = _lines[_index];
      _notify(); // 現在行の更新をUIへ

      // メタ情報（表紙・登場人物表など）は読まずに飛ばす。
      if (line.type == LineType.meta) {
        _index++;
        continue;
      }

      if (!listenMode && isMine(line)) {
        // 自分の番：停止してユーザーを待つ。
        _running = false;
        _pendingReplyPause = false;
        _setPhase(RehearsalPhase.waitingForUser);
        return;
      }

      // 自分のセリフ直後の相手の行には「返しの間」を置く（0なら即レス）。
      if (_pendingReplyPause) {
        _pendingReplyPause = false;
        final pause = _replyPauseProvider?.call() ?? Duration.zero;
        if (pause > Duration.zero) {
          await Future<void>.delayed(pause);
        }
        if (!_running) {
          _setPhase(RehearsalPhase.idle); // 間の途中で一時停止された
          return;
        }
      }

      if (line.type == LineType.direction && !readDirections) {
        await Future<void>.delayed(directionPause);
      } else {
        await _speaker.speakLine(line);
      }

      if (!_running) {
        _setPhase(RehearsalPhase.idle); // 途中で一時停止された
        return;
      }
      _index++;
    }

    _running = false;
    _setPhase(atEnd ? RehearsalPhase.finished : RehearsalPhase.idle);
    _notify();
  }

  /// 一時停止。進行中の読み上げも止める。
  Future<void> pause() async {
    _running = false;
    _pendingReplyPause = false;
    await _speaker.stop();
    if (_phase != RehearsalPhase.finished) {
      _setPhase(RehearsalPhase.idle);
    }
    _notify();
  }

  /// 自分のセリフを言い終えた（またはスキップ）→「返しの間」を置いて次の行から再開。
  Future<void> advanceMine() async {
    if (_index < _lines.length) _index++;
    _pendingReplyPause = true;
    _notify();
    await run();
  }

  /// 前後の行へ移動（停止してから）。空台本では何もしない。
  Future<void> jump(int delta) async {
    await pause();
    if (_lines.isEmpty) return;
    _index = (_index + delta).clamp(0, _lines.length - 1);
    _setPhase(RehearsalPhase.idle);
    _notify();
  }

  /// 頭出し。
  Future<void> restart() async {
    await pause();
    _index = 0;
    _setPhase(RehearsalPhase.idle);
    _notify();
  }

  @override
  void dispose() {
    _disposed = true;
    _running = false;
    super.dispose();
  }
}
