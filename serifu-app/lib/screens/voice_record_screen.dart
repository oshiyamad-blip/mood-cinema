import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:record/record.dart';

import '../audio/recording_store.dart';
import '../models/script.dart';
import '../theme/app_theme.dart';
import '../theme/role_colors.dart';

/// 本読み録音：相手役のセリフ（やト書き）に実際の声を吹き込む。
///
/// 録音した行は練習時にTTSより優先して再生される。
/// 稽古場で共演者に読んでもらって録る／自分で相手役を吹き込む、の両方に使える。
class VoiceRecordScreen extends StatefulWidget {
  const VoiceRecordScreen({super.key, required this.script});

  final Script script;

  @override
  State<VoiceRecordScreen> createState() => _VoiceRecordScreenState();
}

class _VoiceRecordScreenState extends State<VoiceRecordScreen> {
  final _store = RecordingStore();
  final _recorder = AudioRecorder();
  final _player = AudioPlayer();

  Map<String, String> _recorded = {}; // lineId → path
  String? _recordingLineId; // 録音中の行
  String? _playingLineId;
  bool _partnerOnly = false; // 既定はすべての行（自分のセリフも録音できる）

  Script get s => widget.script;

  List<Line> get _visibleLines => s.lines.where((l) {
        if (l.type == LineType.meta) return false;
        if (!_partnerOnly) return true;
        if (l.type == LineType.direction) return true;
        return l.speaker != s.myCharacter;
      }).toList();

  @override
  void initState() {
    super.initState();
    _load();
    _player.onPlayerComplete.listen((_) {
      if (mounted) setState(() => _playingLineId = null);
    });
  }

  Future<void> _load() async {
    final map = await _store.loadAll(s.id);
    if (mounted) setState(() => _recorded = map);
  }

  @override
  void dispose() {
    _recorder.dispose();
    _player.dispose();
    super.dispose();
  }

  Future<void> _toggleRecord(Line line) async {
    if (_recordingLineId == line.id) {
      // 停止して保存。
      try {
        await _recorder.stop();
      } catch (_) {}
      if (mounted) {
        setState(() => _recordingLineId = null);
        await _load();
      }
      return;
    }
    // 別の行を録音中なら止める。
    if (_recordingLineId != null) {
      try {
        await _recorder.stop();
      } catch (_) {}
    }
    await _player.stop();
    try {
      if (!await _recorder.hasPermission()) {
        _snack('マイクの使用を許可してください。');
        return;
      }
      final path = await _store.pathFor(s.id, line.id);
      await _recorder.start(
        const RecordConfig(encoder: AudioEncoder.aacLc),
        path: path,
      );
      if (mounted) setState(() => _recordingLineId = line.id);
    } catch (_) {
      _snack('録音を開始できませんでした。');
    }
  }

  Future<void> _play(Line line) async {
    final path = _recorded[line.id];
    if (path == null) return;
    await _player.stop();
    setState(() => _playingLineId = line.id);
    try {
      await _player.play(DeviceFileSource(path));
    } catch (_) {
      setState(() => _playingLineId = null);
    }
  }

  Future<void> _delete(Line line) async {
    await _store.delete(s.id, line.id);
    await _load();
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    final lines = _visibleLines;
    return Scaffold(
      appBar: AppBar(title: const Text('本読み録音')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg, AppSpacing.md, AppSpacing.lg, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '吹き込んだ行は、合成音声のかわりにその録音で再生されます。'
                  '相手役は共演者に読んでもらって録るのがおすすめ。'
                  '自分のセリフを録っておくと、聞き流しが自分の演技の声になります'
                  '（録音は端末内にのみ保存）。',
                  style: AppText.caption,
                ),
                const SizedBox(height: AppSpacing.sm),
                Row(
                  children: [
                    ChoiceChip(
                      label: const Text('相手役・ト書き'),
                      selected: _partnerOnly,
                      onSelected: (_) => setState(() => _partnerOnly = true),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    ChoiceChip(
                      label: const Text('すべての行'),
                      selected: !_partnerOnly,
                      onSelected: (_) => setState(() => _partnerOnly = false),
                    ),
                    const Spacer(),
                    Text('${_recorded.length}件録音済み', style: AppText.caption),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Expanded(
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(
                  AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.xl),
              itemCount: lines.length,
              separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.sm),
              itemBuilder: (context, i) => _lineTile(lines[i]),
            ),
          ),
        ],
      ),
    );
  }

  Widget _lineTile(Line line) {
    final recorded = _recorded.containsKey(line.id);
    final recording = _recordingLineId == line.id;
    final playing = _playingLineId == line.id;
    final isDirection = line.type == LineType.direction;

    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: recording ? AppColors.danger.withValues(alpha: 0.06) : AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(
          color: recording
              ? AppColors.danger
              : recorded
                  ? AppColors.accent600.withValues(alpha: 0.5)
                  : AppColors.line,
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (!isDirection && line.speaker != null)
                  _speakerBadge(line.speaker!),
                if (!isDirection && line.speaker != null)
                  const SizedBox(height: 4),
                Text(
                  line.text,
                  style: isDirection
                      ? AppText.body.copyWith(
                          fontStyle: FontStyle.italic, color: AppColors.ink500)
                      : AppText.body,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          if (recorded && !recording) ...[
            IconButton(
              icon: Icon(playing ? Icons.stop : Icons.play_arrow,
                  color: AppColors.primary600),
              tooltip: '再生',
              onPressed: playing ? () => _player.stop() : () => _play(line),
            ),
            IconButton(
              icon: const Icon(Icons.delete_outline, color: AppColors.ink500),
              tooltip: '削除',
              onPressed: () => _delete(line),
            ),
          ],
          IconButton(
            icon: Icon(
              recording ? Icons.stop_circle : Icons.mic,
              color: recording ? AppColors.danger : AppColors.accent600,
              size: 30,
            ),
            tooltip: recording ? '録音停止' : 'この行を録音',
            onPressed: () => _toggleRecord(line),
          ),
        ],
      ),
    );
  }

  Widget _speakerBadge(String speaker) {
    final c = roleColors(s.characters.indexOf(speaker));
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: c.bg,
        borderRadius: BorderRadius.circular(AppRadius.sm),
      ),
      child: Text(speaker,
          style: AppText.caption
              .copyWith(color: c.fg, fontWeight: FontWeight.w800)),
    );
  }
}
