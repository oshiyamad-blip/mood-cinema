import 'package:flutter/material.dart';

import '../models/script.dart';
import '../theme/app_theme.dart';

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
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          Container(
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(AppRadius.md),
              boxShadow: AppShadows.sm,
            ),
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _SectionHeading('行アイテム'),
                const SizedBox(height: AppSpacing.lg),
                // 行リスト：上下を角丸＋枠線で囲み、各行を区切る。
                Container(
                  clipBehavior: Clip.antiAlias,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(AppRadius.sm),
                    border: Border.all(color: AppColors.line),
                  ),
                  child: Column(
                    children: [
                      for (var i = 0; i < s.lines.length; i++) ...[
                        if (i > 0)
                          const Divider(height: 1, thickness: 1, color: AppColors.line),
                        _LineEditor(
                          key: ValueKey(s.lines[i].id),
                          line: s.lines[i],
                          characters: s.characters,
                          onTypeChanged: (t) => _setType(s.lines[i], t),
                          onSpeakerChanged: (sp) =>
                              setState(() => s.lines[i].speaker = sp),
                          onEditText: () => _editText(s.lines[i]),
                          onDelete: () => setState(() => s.lines.removeAt(i)),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// セクション見出し：左に4pxのインディゴバー＋太字（AppText.h2）。
class _SectionHeading extends StatelessWidget {
  const _SectionHeading(this.label);
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 4,
          height: 16,
          decoration: BoxDecoration(
            color: AppColors.primary,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        Text(label, style: AppText.h2),
      ],
    );
  }
}

/// 話者バッジの配色を役名から決める。
/// 太郎系はインディゴ、その他はピンク系。
({Color bg, Color fg}) _speakerColors(String? speaker) {
  if (speaker != null && speaker.contains('太郎')) {
    return (bg: AppColors.roleTaroBg, fg: AppColors.roleTaroFg);
  }
  return (bg: AppColors.roleHanakoBg, fg: AppColors.roleHanakoFg);
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
    final isHighlight = isDialogue && (line.speaker?.contains('花子') ?? false);

    // 行の背景：ハイライト＝accent050＋左4pxのaccentボーダー、
    // ト書き＝bg、通常セリフ＝surface。
    final Color rowBg = isHighlight
        ? AppColors.accent050
        : (isDialogue ? AppColors.surface : AppColors.bg);

    return Container(
      decoration: BoxDecoration(
        color: rowBg,
        border: isHighlight
            ? const Border(
                left: BorderSide(color: AppColors.accent, width: 4),
              )
            : null,
      ),
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.md,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    // 種別トグル（セリフ ⇄ ト書き）。
                    SegmentedButton<bool>(
                      segments: const [
                        ButtonSegment(value: true, label: Text('セリフ')),
                        ButtonSegment(value: false, label: Text('ト書き')),
                      ],
                      selected: {isDialogue},
                      showSelectedIcon: false,
                      onSelectionChanged: (sel) => onTypeChanged(
                        sel.first ? LineType.dialogue : LineType.direction,
                      ),
                      style: const ButtonStyle(
                        visualDensity: VisualDensity.compact,
                        textStyle: WidgetStatePropertyAll(
                          TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                        ),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    // 話者選択（セリフのみ）。話者バッジ風のpill内にDropdown。
                    if (isDialogue) Expanded(child: _SpeakerSelector(
                      speaker: line.speaker,
                      characters: characters,
                      onSpeakerChanged: onSpeakerChanged,
                    )),
                  ],
                ),
                const SizedBox(height: AppSpacing.sm),
                // 本文（タップで編集）。
                InkWell(
                  onTap: onEditText,
                  borderRadius: BorderRadius.circular(AppRadius.sm),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
                    child: line.text.isEmpty
                        ? Text(
                            '（空）タップして編集',
                            style: AppText.body.copyWith(color: AppColors.ink300),
                          )
                        : Text(
                            line.text,
                            style: isDialogue
                                ? AppText.body.copyWith(
                                    fontWeight: isHighlight
                                        ? FontWeight.w700
                                        : FontWeight.w500,
                                    color: AppColors.ink900,
                                  )
                                : AppText.body.copyWith(
                                    fontStyle: FontStyle.italic,
                                    color: AppColors.ink500,
                                  ),
                          ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.xs),
          // 削除ボタン。
          IconButton(
            icon: const Icon(Icons.close, size: 18),
            color: AppColors.ink500,
            tooltip: '行を削除',
            onPressed: onDelete,
          ),
        ],
      ),
    );
  }
}

/// 話者バッジ風の役選択。ト書きには「ト書き」バッジを表示。
class _SpeakerSelector extends StatelessWidget {
  const _SpeakerSelector({
    required this.speaker,
    required this.characters,
    required this.onSpeakerChanged,
  });

  final String? speaker;
  final List<String> characters;
  final ValueChanged<String> onSpeakerChanged;

  @override
  Widget build(BuildContext context) {
    final colors = _speakerColors(speaker);
    final value = characters.contains(speaker) ? speaker : null;
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.xs,
      ),
      decoration: BoxDecoration(
        color: value == null ? AppColors.line : colors.bg,
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          isExpanded: true,
          isDense: true,
          value: value,
          icon: Icon(
            Icons.expand_more,
            size: 18,
            color: value == null ? AppColors.ink500 : colors.fg,
          ),
          hint: Text(
            '役を選択',
            style: AppText.caption.copyWith(color: AppColors.ink500),
          ),
          style: AppText.caption.copyWith(
            fontWeight: FontWeight.w800,
            color: value == null ? AppColors.ink700 : colors.fg,
          ),
          selectedItemBuilder: (_) => characters
              .map((c) => Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      c,
                      style: AppText.caption.copyWith(
                        fontWeight: FontWeight.w800,
                        color: colors.fg,
                      ),
                    ),
                  ))
              .toList(),
          items: characters
              .map((c) => DropdownMenuItem(value: c, child: Text(c)))
              .toList(),
          onChanged: (v) {
            if (v != null) onSpeakerChanged(v);
          },
        ),
      ),
    );
  }
}
