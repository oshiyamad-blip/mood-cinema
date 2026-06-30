import 'package:flutter/material.dart';

import '../data/script_repository.dart';
import '../models/script.dart';
import '../speech/device_speech_engine.dart';
import '../speech/speech_engine.dart';

/// 役ごとの声設定（声モデル・性別・テンポ）。試聴つき。
///
/// 端末に搭載されている日本語ボイス（声モデル）を一覧し、役ごとに選べる。
/// 利用可能なボイス数は端末・OS・追加ダウンロード状況で変わる。
class VoiceSettingsScreen extends StatefulWidget {
  const VoiceSettingsScreen({super.key, required this.script});
  final Script script;

  @override
  State<VoiceSettingsScreen> createState() => _VoiceSettingsScreenState();
}

class _VoiceSettingsScreenState extends State<VoiceSettingsScreen> {
  final SpeechEngine _engine = DeviceSpeechEngine();
  List<TtsVoice> _voices = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadVoices();
  }

  Future<void> _loadVoices() async {
    try {
      final v = await _engine.voices('ja-JP');
      if (!mounted) return;
      setState(() {
        _voices = v;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _engine.dispose();
    ScriptRepository.instance.touch(); // 声設定を保存
    super.dispose();
  }

  Future<void> _preview(VoiceProfile p) async {
    await _engine.speak('これはテスト用の試聴です。テンポはこのくらいです。', p);
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.script;
    final others = s.characters.where((c) => c != s.myCharacter).toList();

    return Scaffold(
      appBar: AppBar(title: const Text('相手役の声設定')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : others.isEmpty
              ? const Center(child: Text('相手役がいません'))
              : Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        children: [
                          const Icon(Icons.graphic_eq, size: 18),
                          const SizedBox(width: 8),
                          Text('この端末で使える声モデル：${_voices.length}個',
                              style: const TextStyle(fontSize: 13, color: Colors.grey)),
                        ],
                      ),
                    ),
                    Expanded(
                      child: ListView.separated(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        itemCount: others.length,
                        separatorBuilder: (_, __) => const Divider(height: 32),
                        itemBuilder: (context, i) => _buildCharacter(s, others[i]),
                      ),
                    ),
                  ],
                ),
    );
  }

  Widget _buildCharacter(Script s, String c) {
    final p = s.voiceFor(c);
    // 性別で絞った候補（gender情報が無い声は常に候補に含める）。
    final candidates =
        _voices.where((v) => v.gender == null || v.gender == p.gender).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(c, style: Theme.of(context).textTheme.titleMedium),
            const Spacer(),
            IconButton(
              icon: const Icon(Icons.volume_up_outlined),
              tooltip: '試聴',
              onPressed: () => _preview(p),
            ),
          ],
        ),
        const SizedBox(height: 4),
        SegmentedButton<Gender>(
          segments: const [
            ButtonSegment(value: Gender.female, label: Text('女性')),
            ButtonSegment(value: Gender.male, label: Text('男性')),
          ],
          selected: {p.gender},
          onSelectionChanged: (set) => setState(() {
            // 性別を変えたら、その性別の声モデル選択はリセット。
            s.voiceByCharacter[c] = p.copyWith(gender: set.first, voiceId: '');
          }),
        ),
        const SizedBox(height: 12),
        // 声モデル選択（任意。未選択なら性別から自動）。
        if (_voices.isNotEmpty)
          Row(
            children: [
              const Text('声モデル'),
              const SizedBox(width: 12),
              Expanded(
                child: DropdownButton<String>(
                  isExpanded: true,
                  value: (p.voiceId != null && candidates.any((v) => v.id == p.voiceId))
                      ? p.voiceId
                      : '',
                  items: [
                    const DropdownMenuItem(value: '', child: Text('自動（性別から選択）')),
                    ...candidates.map(
                      (v) => DropdownMenuItem(value: v.id, child: Text(v.name, overflow: TextOverflow.ellipsis)),
                    ),
                  ],
                  onChanged: (v) => setState(() {
                    s.voiceByCharacter[c] = p.copyWith(voiceId: v ?? '');
                  }),
                ),
              ),
            ],
          ),
        const SizedBox(height: 12),
        Row(
          children: [
            const Text('テンポ'),
            Expanded(
              child: Slider(
                min: 0.5,
                max: 2.0,
                divisions: 15,
                label: '${p.rate.toStringAsFixed(1)}x',
                value: p.rate,
                onChanged: (v) => setState(() => s.voiceByCharacter[c] = p.copyWith(rate: v)),
              ),
            ),
            SizedBox(width: 40, child: Text('${p.rate.toStringAsFixed(1)}x')),
          ],
        ),
      ],
    );
  }
}
