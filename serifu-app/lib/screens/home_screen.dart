import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';

import '../ads/ads.dart';
import '../audio/read_through_store.dart';
import '../data/sample_script.dart';
import '../data/script_repository.dart';
import '../data/settings_store.dart';
import '../models/script.dart';
import '../parser/rule_based_parser.dart';
import '../services/text_extractor.dart';
import '../speech/speech_recognizer.dart';
import '../theme/app_theme.dart';
import 'script_detail_screen.dart';
import 'script_edit_screen.dart';
import 'settings_screen.dart';

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

  @override
  void initState() {
    super.initState();
    // マイクはこのアプリの中核機能（ハンズフリー・通し録音）。
    // 練習開始の直前に許可ダイアログで流れを止めないよう、起動時に
    // まとめて許可を取っておく（許可済みなら何も表示されない）。
    if (!kIsWeb) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        SpeechRecognizer().init();
      });
    }
  }

  Future<void> _import() async {
    // 完全無料＋広告モデル：台本数の制限なし。
    setState(() => _busy = true);
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: const [
          'pdf',
          'docx',
          'txt',
          'jpg',
          'jpeg',
          'png',
          'heic',
          'heif',
          'webp',
          'bmp',
        ],
        // Webはファイルパスを持たないため bytes で受け取る（モバイルは従来通りパス）。
        withData: kIsWeb,
      );
      final picked = result?.files.single;
      if (picked == null) return;

      final String raw;
      if (kIsWeb) {
        final bytes = picked.bytes;
        if (bytes == null) return;
        raw = await _extractor.extractFromBytes(bytes, picked.name);
      } else {
        final path = picked.path;
        if (path == null) return;
        raw = await _extractor.extract(File(path));
      }
      final parsed = _parser.parse(raw);

      if (parsed.lines.isEmpty) {
        _snack('テキストを抽出できませんでした。画質の良いPDF/画像でお試しください。');
        return;
      }

      final title = picked.name.replaceAll(RegExp(r'\.[^.]+$'), '');
      final settings = SettingsStore.instance.settings;
      final script = Script(
        id: 's${DateTime.now().microsecondsSinceEpoch}',
        title: title,
        characters: parsed.characters,
        lines: parsed.lines,
        importedAt: DateTime.now(),
        readDirections: settings.defaultReadDirections,
        // 既定の声を各役に適用（あとで個別変更可）。
        voiceByCharacter: {
          for (final c in parsed.characters)
            c: VoiceProfile(
                gender: settings.defaultGender, rate: settings.defaultRate),
        },
      );
      _repo.add(script);
      if (mounted) {
        // 取り込み直後に解析結果の確認・修正 → 詳細へ。
        await Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => ScriptEditScreen(script: script)),
        );
        if (mounted) {
          await Navigator.of(context).push(
            MaterialPageRoute(
                builder: (_) => ScriptDetailScreen(script: script)),
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

  /// サンプル台本で練習体験へ（既にあれば同じものを開く）。
  Future<void> _openSample() async {
    final existing =
        _repo.scripts.where((sc) => sc.title == sampleScriptTitle).toList();
    final script = existing.isNotEmpty ? existing.first : buildSampleScript();
    if (existing.isEmpty) _repo.add(script);
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => ScriptDetailScreen(script: script)),
    );
    if (mounted) setState(() {});
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Image.asset('assets/logo/mark.png', width: 26, height: 26),
            const SizedBox(width: AppSpacing.sm),
            const Text('ホンヨミ'),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            tooltip: '設定',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const SettingsScreen()),
            ),
          ),
        ],
      ),
      body: AnimatedBuilder(
        animation: _repo,
        builder: (context, _) {
          final scripts = _repo.scripts;
          // 空でも同じ構造：トップは常に「練習する／台本を取り込む」の2択。
          // 台本が無ければ「練習する」の先でサンプル台本に繋がる。
          if (scripts.isEmpty) {
            return ListView(
              padding: const EdgeInsets.fromLTRB(
                  AppSpacing.lg, AppSpacing.md, AppSpacing.lg, 120),
              children: [
                _quickActions(scripts),
                const SizedBox(height: AppSpacing.lg),
                const _EmptyState(),
              ],
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.md,
              AppSpacing.lg,
              120,
            ),
            itemCount: scripts.length + 1,
            separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.md),
            itemBuilder: (context, i) {
              if (i == 0) {
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _quickActions(scripts),
                    const SizedBox(height: AppSpacing.lg),
                    Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                      child: Text('${scripts.length}件の台本 — 選んで練習',
                          style: AppText.caption),
                    ),
                  ],
                );
              }
              final s = scripts[i - 1];
              return _ScriptCard(
                script: s,
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(
                      builder: (_) => ScriptDetailScreen(script: s)),
                ),
                onDelete: () {
                  _repo.remove(s.id);
                  ReadThroughStore().deleteAll(s.id); // 通し録音も一緒に消す
                },
              );
            },
          );
        },
      ),
      // 広告はホーム下部の小さなバナー1枠のみ（練習画面には出さない）。
      // 未読込・読込失敗時は高さ0でレイアウトに影響しない。
      bottomNavigationBar: const AdBanner(),
      // 「台本を取り込む」は上部の2択カード（空状態はカード内ボタン）に一本化。
    );
  }

  /// ホーム最上部の2択：「練習する」／「台本を取り込む」。
  /// 台本が無いときは「練習する」の先でサンプル台本に繋がる。
  Widget _quickActions(List<Script> scripts) {
    // 直近に触った台本（練習した日時が新しいもの、無ければ取り込みが新しいもの）。
    final recent = scripts.isEmpty
        ? null
        : scripts.reduce((a, b) {
            final at = a.lastPracticedAt ?? a.importedAt;
            final bt = b.lastPracticedAt ?? b.importedAt;
            return at.isAfter(bt) ? a : b;
          });
    // IntrinsicHeight で左右のカードの高さを揃える
    // （ListView内のRowにstretchを直接使うと高さが無限になり描画例外になる）。
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: _actionCard(
              icon: Icons.play_arrow_rounded,
              iconBg: AppColors.primary,
              iconFg: Colors.white,
              title: recent == null ? '練習する' : '練習をつづける',
              subtitle: recent?.title ?? 'サンプル台本で体験',
              onTap: recent == null
                  ? (_busy ? null : _openSample)
                  : () => Navigator.of(context).push(
                        MaterialPageRoute(
                            builder: (_) =>
                                ScriptDetailScreen(script: recent)),
                      ),
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: _actionCard(
              icon: Icons.add,
              iconBg: AppColors.accent050,
              iconFg: AppColors.accent600,
              title: '台本を取り込む',
              subtitle: kIsWeb ? 'PDF / Word / TXT' : 'PDF / Word / 写真',
              onTap: _busy ? null : _import,
            ),
          ),
        ],
      ),
    );
  }

  Widget _actionCard({
    required IconData icon,
    required Color iconBg,
    required Color iconFg,
    required String title,
    required String subtitle,
    bool busy = false,
    VoidCallback? onTap,
  }) {
    return Card(
      clipBehavior: Clip.antiAlias,
      margin: EdgeInsets.zero,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: iconBg,
                  borderRadius: BorderRadius.circular(AppRadius.sm),
                ),
                child: busy
                    ? Padding(
                        padding: const EdgeInsets.all(8),
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: iconFg),
                      )
                    : Icon(icon, color: iconFg, size: 22),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(title,
                  style: AppText.body.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 2),
              Text(subtitle,
                  style: AppText.caption,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis),
            ],
          ),
        ),
      ),
    );
  }
}

/// 台本一覧の1枚のカード。タイトル・メタ情報・役バッジ・最終練習を表示。
class _ScriptCard extends StatelessWidget {
  const _ScriptCard({
    required this.script,
    required this.onTap,
    required this.onDelete,
  });

  final Script script;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: Container(
          decoration: const BoxDecoration(
            // 左の縦アクセントバー（インディゴ）。
            border: Border(
              left: BorderSide(color: AppColors.primary, width: 5),
            ),
          ),
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.lg,
            AppSpacing.sm,
            AppSpacing.lg,
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      script.title,
                      style: AppText.h2.copyWith(color: AppColors.ink900),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    Wrap(
                      spacing: AppSpacing.sm,
                      runSpacing: AppSpacing.xs,
                      children: [
                        _MetaPill(text: '登場人物 ${script.characters.length}名'),
                        _MetaPill(text: '全${script.lines.length}行'),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.md),
                    Row(
                      children: [
                        _RoleAvatars(characters: script.characters),
                        const Spacer(),
                        Text(
                          _lastLabel(script),
                          style: AppText.caption,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: const Icon(Icons.delete_outline, color: AppColors.ink300),
                onPressed: onDelete,
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _lastLabel(Script s) {
    final dt = s.lastPracticedAt;
    if (dt == null) return '未練習';
    return '最終練習 ${dt.month}/${dt.day}';
  }
}

/// メタ情報の pill（インディゴ淡色）。
class _MetaPill extends StatelessWidget {
  const _MetaPill({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.xs,
      ),
      decoration: BoxDecoration(
        color: AppColors.primary050,
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Text(
        text,
        style: AppText.caption.copyWith(
          color: AppColors.primary700,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

/// 役名の頭文字を丸バッジで重ねて表示。
class _RoleAvatars extends StatelessWidget {
  const _RoleAvatars({required this.characters});

  final List<String> characters;

  static const _palette = [
    (AppColors.roleTaroBg, AppColors.roleTaroFg),
    (AppColors.roleHanakoBg, AppColors.roleHanakoFg),
    (AppColors.primary100, AppColors.primary700),
    (AppColors.accent050, AppColors.accent600),
  ];

  @override
  Widget build(BuildContext context) {
    final shown = characters.take(4).toList();
    // 重なり幅：先頭28 + (枚数-1)×20。0枚なら0。
    final width = shown.isEmpty ? 0.0 : 28.0 + (shown.length - 1) * 20.0;
    return SizedBox(
      height: 28,
      width: width,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          for (var i = 0; i < shown.length; i++)
            Positioned(
              left: i * 20.0,
              child: _Avatar(
                label: shown[i].characters.isEmpty
                    ? '?'
                    : shown[i].characters.first,
                colors: _palette[i % _palette.length],
              ),
            ),
        ],
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.label, required this.colors});

  final String label;
  final (Color, Color) colors;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 28,
      height: 28,
      decoration: BoxDecoration(
        color: colors.$1,
        shape: BoxShape.circle,
        border: Border.all(color: AppColors.surface, width: 2),
      ),
      alignment: Alignment.center,
      child: Text(
        label,
        style: AppText.caption.copyWith(
          color: colors.$2,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

/// 台本が無いときの説明カード（操作は上の2択カードに集約済み）。
class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.xl,
            vertical: AppSpacing.xxl,
          ),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [AppColors.surface, AppColors.primary050],
            ),
            borderRadius: BorderRadius.circular(AppRadius.lg),
            border: Border.all(color: AppColors.primary400, width: 1.5),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.theater_comedy_outlined,
                size: 64,
                color: AppColors.primary,
              ),
              const SizedBox(height: AppSpacing.lg),
              Text(
                '台本はまだありません',
                style: AppText.h2.copyWith(color: AppColors.ink900),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                '上の「練習する」でサンプル台本をすぐ体験できます。\n'
                '自分の台本で練習するときは「台本を取り込む」から。',
                style: AppText.body,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                kIsWeb
                    ? 'Web版：PDF（テキスト埋込）/ Word(docx) / TXT に対応\n台本はこのブラウザに保存されます（写真のOCRはモバイル版のみ）'
                    : 'PDF / Word(docx) / 画像・写真 / TXT に対応\n（台本は端末内でのみ処理されます）',
                style: AppText.caption,
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
