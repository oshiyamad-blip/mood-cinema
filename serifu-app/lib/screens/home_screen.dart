import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../data/script_repository.dart';
import '../models/script.dart';
import '../parser/rule_based_parser.dart';
import '../services/text_extractor.dart';
import 'script_detail_screen.dart';
import 'script_edit_screen.dart';

/// ホーム：取り込み済み台本の一覧と取り込み導線。
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _repo = ScriptRepository.instance;
  final _extractor = TextExtractor();
  final _parser = RuleBasedParser();
  bool _busy = false;

  Future<void> _import() async {
    setState(() => _busy = true);
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: const [
          'pdf', 'docx', 'txt', 'jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'bmp',
        ],
      );
      final path = result?.files.single.path;
      if (path == null) return;

      final raw = await _extractor.extract(File(path));
      final parsed = _parser.parse(raw);

      if (parsed.lines.isEmpty) {
        _snack('テキストを抽出できませんでした。画質の良いPDF/画像でお試しください。');
        return;
      }

      final title = result!.files.single.name.replaceAll(RegExp(r'\.[^.]+$'), '');
      final script = Script(
        id: 's${DateTime.now().microsecondsSinceEpoch}',
        title: title,
        characters: parsed.characters,
        lines: parsed.lines,
        importedAt: DateTime.now(),
      );
      _repo.add(script);
      if (mounted) {
        // 取り込み直後に解析結果の確認・修正 → 詳細へ。
        await Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => ScriptEditScreen(script: script)),
        );
        if (mounted) {
          await Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => ScriptDetailScreen(script: script)),
          );
        }
      }
    } on UnsupportedError catch (e) {
      _snack(e.message ?? '未対応の形式です。');
    } catch (e) {
      _snack('取り込みに失敗しました: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('セリフ稽古')),
      body: AnimatedBuilder(
        animation: _repo,
        builder: (context, _) {
          final scripts = _repo.scripts;
          if (scripts.isEmpty) {
            return const _EmptyState();
          }
          return ListView.separated(
            padding: const EdgeInsets.all(12),
            itemCount: scripts.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (context, i) {
              final s = scripts[i];
              return Card(
                child: ListTile(
                  title: Text(s.title),
                  subtitle: Text('登場人物 ${s.characters.length}人 ・ ${s.lines.length}行'),
                  trailing: IconButton(
                    icon: const Icon(Icons.delete_outline),
                    onPressed: () => _repo.remove(s.id),
                  ),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => ScriptDetailScreen(script: s)),
                  ),
                ),
              );
            },
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _busy ? null : _import,
        icon: _busy
            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
            : const Icon(Icons.add),
        label: const Text('台本を取り込む'),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: const [
            Icon(Icons.theater_comedy_outlined, size: 64),
            SizedBox(height: 16),
            Text(
              '台本を取り込んで練習を始めましょう',
              style: TextStyle(fontSize: 16),
              textAlign: TextAlign.center,
            ),
            SizedBox(height: 8),
            Text(
              'PDF / Word(docx) / 画像・写真 / TXT に対応\n（台本は端末内でのみ処理されます）',
              style: TextStyle(fontSize: 12, color: Colors.grey),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
