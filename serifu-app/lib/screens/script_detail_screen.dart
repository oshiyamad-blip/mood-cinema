import 'package:flutter/material.dart';

import '../data/script_repository.dart';
import '../models/script.dart';
import 'rehearsal_screen.dart';
import 'voice_settings_screen.dart';

/// 台本詳細：自分の役の選択、ト書きON/OFF、声設定、練習開始。
class ScriptDetailScreen extends StatefulWidget {
  const ScriptDetailScreen({super.key, required this.script});
  final Script script;

  @override
  State<ScriptDetailScreen> createState() => _ScriptDetailScreenState();
}

class _ScriptDetailScreenState extends State<ScriptDetailScreen> {
  Script get s => widget.script;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(s.title)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('あなたの役', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: s.characters.map((c) {
              final selected = s.myCharacter == c;
              return ChoiceChip(
                label: Text(c),
                selected: selected,
                onSelected: (_) => setState(() => s.myCharacter = c),
              );
            }).toList(),
          ),
          const Divider(height: 32),
          SwitchListTile(
            title: const Text('ト書きを読み上げる'),
            subtitle: const Text('OFFにすると画面表示のみ'),
            value: s.readDirections,
            contentPadding: EdgeInsets.zero,
            onChanged: (v) => setState(() => s.readDirections = v),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.record_voice_over_outlined),
            title: const Text('相手役の声設定'),
            subtitle: const Text('役ごとに 男性/女性・テンポ'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => VoiceSettingsScreen(script: s)),
            ),
          ),
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: s.myCharacter == null
                ? null
                : () {
                    s.lastPracticedAt = DateTime.now();
                    ScriptRepository.instance.touch();
                    Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => RehearsalScreen(script: s)),
                    );
                  },
            icon: const Icon(Icons.play_arrow),
            label: Text(s.myCharacter == null ? 'まず自分の役を選んでください' : '練習開始'),
          ),
        ],
      ),
    );
  }
}
