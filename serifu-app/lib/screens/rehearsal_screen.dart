import 'package:flutter/material.dart';

import '../models/script.dart';
import '../speech/device_speech_engine.dart';
import '../speech/speech_engine.dart';

/// リハーサル（再生）画面。
///
/// - 相手役のセリフ：設定した声・テンポでTTS再生（自動で次へ）。
/// - 自分のセリフ：読み上げず一時停止し「あなたの番」を表示。手動で次へ。
/// - ト書き：ONなら中立の声で読み上げ、OFFなら表示のみ。
class RehearsalScreen extends StatefulWidget {
  const RehearsalScreen({super.key, required this.script});
  final Script script;

  @override
  State<RehearsalScreen> createState() => _RehearsalScreenState();
}

class _RehearsalScreenState extends State<RehearsalScreen> {
  final SpeechEngine _engine = DeviceSpeechEngine();
  final _narrator = VoiceProfile(gender: Gender.female, rate: 1.0);

  int _index = 0;
  bool _running = false;
  bool _waitingForUser = false;

  Script get s => widget.script;
  List<Line> get lines => s.lines;

  @override
  void dispose() {
    _running = false;
    _engine.dispose();
    super.dispose();
  }

  bool _isMine(Line l) => l.type == LineType.dialogue && l.speaker == s.myCharacter;

  Future<void> _run() async {
    if (_running) return;
    _running = true;
    setState(() => _waitingForUser = false);

    while (_running && _index < lines.length) {
      final line = lines[_index];
      setState(() {});

      if (_isMine(line)) {
        // 自分の番：停止してユーザーの「次へ」を待つ。
        _running = false;
        setState(() => _waitingForUser = true);
        return;
      }

      if (line.type == LineType.direction && !s.readDirections) {
        await Future.delayed(const Duration(milliseconds: 700));
      } else {
        final profile =
            line.type == LineType.direction ? _narrator : s.voiceFor(line.speaker ?? '');
        await _engine.speak(line.text, profile);
      }

      if (!_running) return; // 途中で一時停止された
      _index++;
    }
    _running = false;
    setState(() {});
  }

  Future<void> _pause() async {
    _running = false;
    await _engine.stop();
    setState(() => _waitingForUser = false);
  }

  void _advanceMine() {
    if (_index < lines.length) _index++;
    _run();
  }

  Future<void> _jump(int delta) async {
    await _pause();
    setState(() {
      _index = (_index + delta).clamp(0, lines.length - 1);
    });
  }

  Future<void> _restart() async {
    await _pause();
    setState(() => _index = 0);
  }

  @override
  Widget build(BuildContext context) {
    final atEnd = _index >= lines.length;
    return Scaffold(
      appBar: AppBar(
        title: Text(s.title),
        actions: [
          IconButton(icon: const Icon(Icons.replay), onPressed: _restart, tooltip: '頭出し'),
        ],
      ),
      body: Column(
        children: [
          LinearProgressIndicator(
            value: lines.isEmpty ? 0 : (_index.clamp(0, lines.length)) / lines.length,
          ),
          Expanded(child: _buildScriptView()),
          if (_waitingForUser) _buildYourTurnBanner(),
          if (atEnd) _buildEndBanner(),
          _buildControls(atEnd),
        ],
      ),
    );
  }

  Widget _buildScriptView() {
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: lines.length,
      itemBuilder: (context, i) {
        final l = lines[i];
        final current = i == _index;
        final mine = _isMine(l);
        final isDirection = l.type == LineType.direction;

        return Container(
          margin: const EdgeInsets.symmetric(vertical: 4),
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: current
                ? (mine ? Colors.amber.withOpacity(0.25) : Colors.indigo.withOpacity(0.12))
                : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (!isDirection)
                Text(
                  '${l.speaker ?? ''}${mine ? '（あなた）' : ''}',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: mine ? Colors.amber.shade900 : Colors.indigo,
                  ),
                ),
              Text(
                l.text,
                style: TextStyle(
                  fontSize: current ? 18 : 15,
                  fontStyle: isDirection ? FontStyle.italic : FontStyle.normal,
                  color: isDirection ? Colors.grey.shade600 : null,
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildYourTurnBanner() {
    final line = (_index < lines.length) ? lines[_index] : null;
    return Container(
      width: double.infinity,
      color: Colors.amber.withOpacity(0.2),
      padding: const EdgeInsets.all(12),
      child: Column(
        children: [
          const Text('あなたの番です', style: TextStyle(fontWeight: FontWeight.bold)),
          if (line != null) ...[
            const SizedBox(height: 4),
            Text(line.text, textAlign: TextAlign.center),
          ],
          const SizedBox(height: 8),
          FilledButton.icon(
            onPressed: _advanceMine,
            icon: const Icon(Icons.skip_next),
            label: const Text('言えた・次へ'),
          ),
        ],
      ),
    );
  }

  Widget _buildEndBanner() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      color: Colors.green.withOpacity(0.15),
      child: const Text('お疲れさまでした（最後まで到達）', textAlign: TextAlign.center),
    );
  }

  Widget _buildControls(bool atEnd) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: [
            IconButton(
              icon: const Icon(Icons.skip_previous),
              onPressed: () => _jump(-1),
            ),
            if (_running)
              FilledButton.icon(
                onPressed: _pause,
                icon: const Icon(Icons.pause),
                label: const Text('一時停止'),
              )
            else
              FilledButton.icon(
                onPressed: atEnd ? null : _run,
                icon: const Icon(Icons.play_arrow),
                label: const Text('再生'),
              ),
            IconButton(
              icon: const Icon(Icons.skip_next),
              onPressed: () => _jump(1),
            ),
          ],
        ),
      ),
    );
  }
}
