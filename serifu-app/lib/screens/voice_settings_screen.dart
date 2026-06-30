import 'package:flutter/material.dart';

import '../models/script.dart';
import '../speech/device_speech_engine.dart';
import '../speech/speech_engine.dart';

/// 役ごとの声設定（性別・テンポ）。試聴つき。
class VoiceSettingsScreen extends StatefulWidget {
  const VoiceSettingsScreen({super.key, required this.script});
  final Script script;

  @override
  State<VoiceSettingsScreen> createState() => _VoiceSettingsScreenState();
}

class _VoiceSettingsScreenState extends State<VoiceSettingsScreen> {
  final SpeechEngine _engine = DeviceSpeechEngine();

  @override
  void dispose() {
    _engine.dispose();
    super.dispose();
  }

  Future<void> _preview(VoiceProfile p) async {
    await _engine.speak('これはテスト用の試聴です。テンポはこのくらいです。', p);
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.script;
    // 自分の役以外を声設定の対象にする。
    final others = s.characters.where((c) => c != s.myCharacter).toList();

    return Scaffold(
      appBar: AppBar(title: const Text('相手役の声設定')),
      body: others.isEmpty
          ? const Center(child: Text('相手役がいません'))
          : ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: others.length,
              separatorBuilder: (_, __) => const Divider(height: 32),
              itemBuilder: (context, i) {
                final c = others[i];
                final p = s.voiceFor(c);
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
                      onSelectionChanged: (set) =>
                          setState(() => s.voiceByCharacter[c] = p.copyWith(gender: set.first)),
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
                            onChanged: (v) =>
                                setState(() => s.voiceByCharacter[c] = p.copyWith(rate: v)),
                          ),
                        ),
                        SizedBox(width: 40, child: Text('${p.rate.toStringAsFixed(1)}x')),
                      ],
                    ),
                  ],
                );
              },
            ),
    );
  }
}
