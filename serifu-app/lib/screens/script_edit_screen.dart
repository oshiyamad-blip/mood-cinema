import 'package:flutter/material.dart';

import '../models/script.dart';

/// 解析結果の確認・修正画面。
///
/// 解析は完璧にならない前提のため、ここで以下をワンタップ修正できる：
///   - 行の種別（セリフ ⇄ ト書き）
///   - 話者（役名）の変更・新規追加
///   - 本文の編集
///   - 行の削除
class ScriptEditScreen extends StatefulWidget {
  const ScriptEditScreen({super.key, required this.script});
  final Script script;

  @override
  State<ScriptEditScreen> createState() => _ScriptEditScreenState();
}

class _ScriptEditScreenState extends State<ScriptEditScreen> {
  Script get s => widget.script;

  void _setType(Line line, LineType type) {
    setState(() {
      line.type = type;
      if (type == LineType.direction) {
        line.speaker = null;
      } else {
        line.speaker ??= s.characters.isNotEmpty ? s.characters.first : '役1';
        _ensureCharacter(line.speaker!);
      }
    });
  }

  void _ensureCharacter(String name) {
    if (name.isNotEmpty && !s.characters.contains(name)) {
      s.characters.add(name);
    }
  }

  Future<void> _editText(Line line) async {
    final controller = TextEditingController(text: line.text);
    final result = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('本文を編集'),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLines: null,
          decoration: const InputDecoration(border: OutlineInputBorder()),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('キャンセル')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, controller.text),
            child: const Text('OK'),
          ),
        ],
      ),
    );
    if (result != null) setState(() => line.text = result);
  }

  Future<void> _addCharacter() async {
    final controller = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('役名を追加'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(hintText: '例：太郎'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('キャンセル')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, controller.text.trim()),
            child: const Text('追加'),
          ),
        ],
      ),
    );
    if (name != null && name.isNotEmpty) {
      setState(() => _ensureCharacter(name));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('解析結果の確認・修正'),
        actions: [
          IconButton(
            icon: const Icon(Icons.person_add_alt),
            tooltip: '役名を追加',
            onPressed: _addCharacter,
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('完了'),
          ),
        ],
      ),
      body: ListView.separated(
        padding: const EdgeInsets.all(12),
        itemCount: s.lines.length,
        separatorBuilder: (_, __) => const Divider(height: 8),
        itemBuilder: (context, i) => _LineEditor(
          key: ValueKey(s.lines[i].id),
          line: s.lines[i],
          characters: s.characters,
          onTypeChanged: (t) => _setType(s.lines[i], t),
          onSpeakerChanged: (sp) => setState(() => s.lines[i].speaker = sp),
          onEditText: () => _editText(s.lines[i]),
          onDelete: () => setState(() => s.lines.removeAt(i)),
        ),
      ),
    );
  }
}

class _LineEditor extends StatelessWidget {
  const _LineEditor({
    super.key,
    required this.line,
    required this.characters,
    required this.onTypeChanged,
    required this.onSpeakerChanged,
    required this.onEditText,
    required this.onDelete,
  });

  final Line line;
  final List<String> characters;
  final ValueChanged<LineType> onTypeChanged;
  final ValueChanged<String> onSpeakerChanged;
  final VoidCallback onEditText;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final isDialogue = line.type == LineType.dialogue;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  // 種別トグル
                  ToggleButtons(
                    isSelected: [isDialogue, !isDialogue],
                    onPressed: (i) => onTypeChanged(i == 0 ? LineType.dialogue : LineType.direction),
                    constraints: const BoxConstraints(minHeight: 32, minWidth: 56),
                    borderRadius: BorderRadius.circular(6),
                    children: const [Text('セリフ'), Text('ト書き')],
                  ),
                  const SizedBox(width: 8),
                  // 話者ドロップダウン（セリフのみ）
                  if (isDialogue)
                    Expanded(
                      child: DropdownButton<String>(
                        isExpanded: true,
                        value: characters.contains(line.speaker) ? line.speaker : null,
                        hint: const Text('役を選択'),
                        items: characters
                            .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                            .toList(),
                        onChanged: (v) {
                          if (v != null) onSpeakerChanged(v);
                        },
                      ),
                    ),
                ],
              ),
              InkWell(
                onTap: onEditText,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Text(
                    line.text.isEmpty ? '（空）タップして編集' : line.text,
                    style: TextStyle(
                      fontStyle: isDialogue ? FontStyle.normal : FontStyle.italic,
                      color: isDialogue ? null : Colors.grey.shade600,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        IconButton(
          icon: const Icon(Icons.close, size: 18),
          tooltip: '行を削除',
          onPressed: onDelete,
        ),
      ],
    );
  }
}
