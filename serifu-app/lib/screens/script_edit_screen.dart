import 'package:flutter/material.dart';

import '../models/script.dart';
import '../theme/app_theme.dart';
import '../theme/role_colors.dart';

/// 解析結果の確認・修正画面。
///
/// 確認のしやすさを最優先にした構成：
///   - 上部にサマリー（セリフ/ト書き/読まない の行数と役一覧）
///   - フィルタチップで種別の絞り込み（誤判定探しに使う）
///   - 本文はリハーサル画面と同じコンパクト表示でスラスラ読める
///   - 行をタップすると修正シート（種別・話者・本文・削除）
///   - 連続する「読まない」行（表紙・人物表）は折りたたんで邪魔にしない
class ScriptEditScreen extends StatefulWidget {
  const ScriptEditScreen({super.key, required this.script});
  final Script script;

  @override
  State<ScriptEditScreen> createState() => _ScriptEditScreenState();
}

/// 表示リストの1項目：通常行 or 折りたたまれたメタ行グループ。
sealed class _Item {
  const _Item();
}

class _LineItem extends _Item {
  const _LineItem(this.line);
  final Line line;
}

class _MetaGroupItem extends _Item {
  const _MetaGroupItem(this.lines);
  final List<Line> lines;
}

class _ScriptEditScreenState extends State<ScriptEditScreen> {
  Script get s => widget.script;

  /// null = すべて表示。
  LineType? _filter;

  /// 展開中のメタグループ（先頭行のid）。
  final Set<String> _expanded = {};

  /// 連続メタ行がこの数以上なら折りたたむ。
  static const _collapseThreshold = 4;

  void _ensureCharacter(String name) {
    if (name.isNotEmpty && !s.characters.contains(name)) {
      s.characters.add(name);
    }
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

  /// 行タップ → 修正シート。
  Future<void> _editLine(Line line) async {
    final textController = TextEditingController(text: line.text);
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.lg)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => Padding(
          padding: EdgeInsets.only(
            left: AppSpacing.lg,
            right: AppSpacing.lg,
            top: AppSpacing.lg,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + AppSpacing.lg,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 種別トグル。
              SegmentedButton<LineType>(
                segments: const [
                  ButtonSegment(value: LineType.dialogue, label: Text('セリフ')),
                  ButtonSegment(value: LineType.direction, label: Text('ト書き')),
                  ButtonSegment(value: LineType.meta, label: Text('読まない')),
                ],
                selected: {line.type},
                showSelectedIcon: false,
                onSelectionChanged: (sel) => setSheet(() {
                  line.type = sel.first;
                  if (line.type == LineType.dialogue) {
                    line.speaker ??=
                        s.characters.isNotEmpty ? s.characters.first : '役1';
                    _ensureCharacter(line.speaker!);
                  } else {
                    line.speaker = null;
                  }
                }),
              ),
              const SizedBox(height: AppSpacing.md),
              // 話者（セリフのみ）。
              if (line.type == LineType.dialogue)
                Wrap(
                  spacing: AppSpacing.sm,
                  runSpacing: AppSpacing.sm,
                  children: [
                    for (final c in s.characters)
                      ChoiceChip(
                        label: Text(c),
                        selected: line.speaker == c,
                        onSelected: (_) => setSheet(() => line.speaker = c),
                      ),
                  ],
                ),
              if (line.type == LineType.dialogue)
                const SizedBox(height: AppSpacing.md),
              // 本文。
              TextField(
                controller: textController,
                maxLines: null,
                decoration: const InputDecoration(
                  labelText: '本文',
                  border: OutlineInputBorder(),
                ),
                onChanged: (v) => line.text = v,
              ),
              const SizedBox(height: AppSpacing.md),
              Row(
                children: [
                  TextButton.icon(
                    onPressed: () {
                      Navigator.pop(ctx);
                      setState(() => s.lines.remove(line));
                    },
                    style: TextButton.styleFrom(foregroundColor: AppColors.danger),
                    icon: const Icon(Icons.delete_outline, size: 18),
                    label: const Text('この行を削除'),
                  ),
                  const Spacer(),
                  FilledButton(
                    onPressed: () => Navigator.pop(ctx),
                    child: const Text('閉じる'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
    setState(() {}); // シートでの変更を一覧へ反映
  }

  /// フィルタ適用＋メタ行グループ化した表示リストを作る。
  List<_Item> _buildItems() {
    if (_filter != null) {
      return [
        for (final l in s.lines)
          if (l.type == _filter) _LineItem(l),
      ];
    }
    final items = <_Item>[];
    var i = 0;
    while (i < s.lines.length) {
      final line = s.lines[i];
      if (line.type == LineType.meta) {
        var j = i;
        while (j < s.lines.length && s.lines[j].type == LineType.meta) {
          j++;
        }
        final run = s.lines.sublist(i, j);
        if (run.length >= _collapseThreshold &&
            !_expanded.contains(run.first.id)) {
          items.add(_MetaGroupItem(run));
        } else {
          items.addAll(run.map(_LineItem.new));
        }
        i = j;
      } else {
        items.add(_LineItem(line));
        i++;
      }
    }
    return items;
  }

  @override
  Widget build(BuildContext context) {
    final dialogueCount =
        s.lines.where((l) => l.type == LineType.dialogue).length;
    final directionCount =
        s.lines.where((l) => l.type == LineType.direction).length;
    final metaCount = s.lines.where((l) => l.type == LineType.meta).length;
    final items = _buildItems();

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
      body: Column(
        children: [
          // ---- サマリー ----
          Container(
            margin: const EdgeInsets.fromLTRB(
                AppSpacing.lg, AppSpacing.md, AppSpacing.lg, 0),
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(AppRadius.md),
              boxShadow: AppShadows.sm,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: AppSpacing.md,
                  runSpacing: AppSpacing.xs,
                  children: [
                    _CountBadge(
                        label: 'セリフ', count: dialogueCount, color: AppColors.primary),
                    _CountBadge(
                        label: 'ト書き', count: directionCount, color: AppColors.ink500),
                    _CountBadge(
                        label: '読まない', count: metaCount, color: AppColors.ink300),
                  ],
                ),
                if (s.characters.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.sm),
                  Wrap(
                    spacing: AppSpacing.xs,
                    runSpacing: AppSpacing.xs,
                    children: [
                      for (var i = 0; i < s.characters.length; i++)
                        _roleBadge(s.characters[i], i),
                    ],
                  ),
                ],
                const SizedBox(height: AppSpacing.xs),
                Text('行をタップすると修正できます',
                    style: AppText.caption.copyWith(color: AppColors.ink300)),
              ],
            ),
          ),
          // ---- フィルタ ----
          Padding(
            padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.lg, vertical: AppSpacing.sm),
            child: Row(
              children: [
                for (final (label, type) in [
                  ('すべて', null),
                  ('セリフ', LineType.dialogue),
                  ('ト書き', LineType.direction),
                  ('読まない', LineType.meta),
                ]) ...[
                  ChoiceChip(
                    label: Text(label),
                    selected: _filter == type,
                    labelStyle: TextStyle(
                      fontFamily: AppText.family,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: _filter == type ? Colors.white : AppColors.ink700,
                    ),
                    visualDensity: VisualDensity.compact,
                    onSelected: (_) => setState(() => _filter = type),
                  ),
                  const SizedBox(width: AppSpacing.xs),
                ],
              ],
            ),
          ),
          // ---- 行リスト ----
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.fromLTRB(
                  AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.xl),
              itemCount: items.length,
              itemBuilder: (context, i) => switch (items[i]) {
                _MetaGroupItem(:final lines) => _metaGroupTile(lines),
                _LineItem(:final line) => _lineTile(line),
              },
            ),
          ),
        ],
      ),
      // 確認が済んだら次のステップ（役選択・練習開始）へ進む大きな導線。
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg, AppSpacing.sm, AppSpacing.lg, AppSpacing.md),
          child: FilledButton.icon(
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(52),
            ),
            onPressed: () => Navigator.pop(context, true),
            icon: const Icon(Icons.arrow_forward),
            label: const Text('確認完了 — 役を選んで練習へ'),
          ),
        ),
      ),
    );
  }

  Widget _roleBadge(String name, int index) {
    final colors = roleColors(index);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(
        color: colors.bg,
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Text(name,
          style: TextStyle(
              fontSize: 12, fontWeight: FontWeight.w800, color: colors.fg)),
    );
  }

  /// 折りたたまれたメタ行グループ（表紙・人物表など）。
  Widget _metaGroupTile(List<Line> lines) {
    final preview = lines.first.text;
    return InkWell(
      onTap: () => setState(() => _expanded.add(lines.first.id)),
      borderRadius: BorderRadius.circular(AppRadius.sm),
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: AppColors.bg,
          borderRadius: BorderRadius.circular(AppRadius.sm),
          border: Border.all(color: AppColors.line),
        ),
        child: Row(
          children: [
            const Icon(Icons.description_outlined,
                size: 18, color: AppColors.ink300),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                '読み上げ対象外 ${lines.length}行（$preview …）',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppText.caption.copyWith(color: AppColors.ink500),
              ),
            ),
            const Icon(Icons.expand_more, size: 18, color: AppColors.ink300),
          ],
        ),
      ),
    );
  }

  /// 1行のコンパクト表示（タップで修正シート）。
  Widget _lineTile(Line line) {
    final isDialogue = line.type == LineType.dialogue;
    final isMeta = line.type == LineType.meta;
    final roleIndex = line.speaker == null ? 0 : s.characters.indexOf(line.speaker!);
    final colors = roleColors(roleIndex);

    return InkWell(
      onTap: () => _editLine(line),
      borderRadius: BorderRadius.circular(AppRadius.sm),
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 3),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: isDialogue ? AppColors.surface : Colors.transparent,
          borderRadius: BorderRadius.circular(AppRadius.sm),
          border: isDialogue ? Border.all(color: AppColors.line) : null,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (isDialogue)
              Padding(
                padding: const EdgeInsets.only(bottom: 2),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: colors.bg,
                    borderRadius: BorderRadius.circular(AppRadius.pill),
                  ),
                  child: Text(
                    line.speaker ?? '（役を選択）',
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        color: colors.fg),
                  ),
                ),
              ),
            Text(
              line.text.isEmpty ? '（空）' : line.text,
              style: isMeta
                  ? AppText.caption.copyWith(color: AppColors.ink300)
                  : isDialogue
                      ? AppText.body
                      : AppText.body.copyWith(
                          fontStyle: FontStyle.italic,
                          color: AppColors.ink500,
                          fontSize: 14,
                        ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CountBadge extends StatelessWidget {
  const _CountBadge(
      {required this.label, required this.count, required this.color});
  final String label;
  final int count;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 4),
        Text('$label $count行',
            style: AppText.caption.copyWith(color: AppColors.ink700)),
      ],
    );
  }
}
