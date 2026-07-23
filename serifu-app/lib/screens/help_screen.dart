import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/app_theme.dart';

/// サポート画面：よくある質問（FAQ）とお問い合わせ窓口。
///
/// 問い合わせはまずFAQで自己解決できるようにし（窓口の負荷分散）、
/// 解決しない場合にメールで連絡してもらう。メール本文の定型文には
/// 調査に必要な情報（端末・OS・症状）をあらかじめ入れておく。
class HelpScreen extends StatelessWidget {
  const HelpScreen({super.key});

  /// サポート窓口のメールアドレス（web/privacy.html・terms.html と同期）。
  static const supportEmail = 'oshiyamad@gmail.com';

  /// アプリのバージョン表記（pubspec.yaml の version と同期させること）。
  static const appVersion = '0.1.0';

  /// 問い合わせメールの定型文。
  static const mailTemplate = '【ホンヨミ お問い合わせ】\n'
      '\n'
      'アプリ: ホンヨミ $appVersion\n'
      'ご利用端末: （例: iPhone 15 / Pixel 8）\n'
      'OSバージョン: （例: iOS 19 / Android 16）\n'
      '\n'
      '■ お困りの内容\n'
      '（どの画面で・何をしたら・どうなったか をお書きください）\n';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('ヘルプ・お問い合わせ')),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          _faqCard(),
          const SizedBox(height: AppSpacing.md),
          _contactCard(context),
        ],
      ),
    );
  }

  Widget _faqCard() {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _heading('よくある質問'),
          const SizedBox(height: AppSpacing.xs),
          for (final f in _faqs)
            ExpansionTile(
              title: Text(f.q, style: AppText.body),
              tilePadding: EdgeInsets.zero,
              childrenPadding:
                  const EdgeInsets.only(bottom: AppSpacing.md),
              expandedCrossAxisAlignment: CrossAxisAlignment.start,
              shape: const Border(),
              collapsedShape: const Border(),
              children: [
                Text(f.a, style: AppText.caption.copyWith(height: 1.7)),
              ],
            ),
        ],
      ),
    );
  }

  Widget _contactCard(BuildContext context) {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _heading('お問い合わせ'),
          const SizedBox(height: AppSpacing.sm),
          Text(
            '上のFAQで解決しない場合は、メールでご連絡ください。'
            '数日以内の返信を心がけていますが、内容によりお時間を'
            'いただくことがあります。',
            style: AppText.caption,
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              const Icon(Icons.mail_outline, size: 18),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: SelectableText(supportEmail, style: AppText.body),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            spacing: AppSpacing.sm,
            children: [
              OutlinedButton.icon(
                onPressed: () => _copy(context, supportEmail, 'メールアドレスをコピーしました'),
                icon: const Icon(Icons.copy, size: 16),
                label: const Text('アドレスをコピー'),
              ),
              OutlinedButton.icon(
                onPressed: () =>
                    _copy(context, mailTemplate, '問い合わせ用の定型文をコピーしました'),
                icon: const Icon(Icons.article_outlined, size: 16),
                label: const Text('定型文をコピー'),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            '※台本の内容を送っていただく必要はありません。うまく取り込めない'
            '台本がある場合は、レイアウトの形式（縦書き/横書き・段組・役名の'
            '書き方など）を教えていただけると対応を検討できます。',
            style: AppText.caption,
          ),
        ],
      ),
    );
  }

  Future<void> _copy(
      BuildContext context, String text, String message) async {
    await Clipboard.setData(ClipboardData(text: text));
    if (!context.mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  Widget _card({required Widget child}) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(AppSpacing.lg),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(AppRadius.md),
          boxShadow: AppShadows.sm,
        ),
        child: child,
      );

  Widget _heading(String text) => Row(
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
          Text(text, style: AppText.h2),
        ],
      );
}

class _Faq {
  const _Faq(this.q, this.a);
  final String q;
  final String a;
}

/// FAQの内容（web/support.html と同期させること）。
const _faqs = [
  _Faq(
    '台本がうまく読み込めない・セリフが崩れる',
    '解析結果は取り込み後の確認画面でいつでも手動修正できます（行の種類の変更・'
        '話者の変更・本文の編集）。PDFは縦書き・横書き・2段組に対応していますが、'
        '特殊なレイアウトでは崩れることがあります。写真から取り込む場合は、'
        '明るい場所で1ページずつ正面から撮影すると精度が上がります。'
        'うまくいかない形式があれば、お問い合わせで形式を教えてください。',
  ),
  _Faq(
    'ハンズフリーで次に進まない・反応が悪い',
    'マイクの使用許可がONになっているか確認してください（端末の設定 → ホンヨミ）。'
        '静かな場所で、セリフの語尾まではっきり話すと検知されやすくなります。'
        '改善しない場合は、設定 → 音声認識の「高精度認識を使う」をONにすると'
        '認識精度が上がります（音声がOSの認識サービスへ送られる場合があります）。'
        'なお、ハンズフリーが使えなくても「言えた・次へ」ボタンで練習できます。',
  ),
  _Faq(
    '相手役の声が機械っぽい',
    '端末に高品質の音声データを追加すると、アプリが自動で最も高音質な声を選びます。'
        'iOS: 設定 → アクセシビリティ → 読み上げコンテンツ → 声 → 日本語 から'
        '拡張版/プレミアムをダウンロード。Android: 設定 → システム → テキスト読み上げ'
        'から音声データをインストールしてください。',
  ),
  _Faq(
    '認識の開始時に効果音（ポン）が鳴る',
    'Androidの一部端末では、OSの音声認識が開始・終了時に通知音を鳴らします。'
        'これはOS側の仕様で、アプリからは消せません。気になる場合はハンズフリーを'
        'OFFにして手動進行をご利用ください。',
  ),
  _Faq(
    '台本や録音のデータはどこに保存される？',
    'すべて端末内にのみ保存され、サーバへ送信されることはありません。'
        'そのためアプリを削除するとデータも消えます。大切な台本は台本画面の'
        '書き出し（.honyomi ファイル）でバックアップしておくと安心です。',
  ),
  _Faq(
    '機種変更でデータを引き継ぎたい',
    '台本ごとに書き出し（共有ボタン → .honyomi ファイル）を行い、新しい端末で'
        'そのファイルを取り込んでください。練習の記録と録音は端末内にのみ'
        '保存されるため引き継がれません。',
  ),
  _Faq(
    '広告を消したい・料金はかかる？',
    '全機能を無料で使えます。無料提供のため、ホームと練習結果の画面にだけ'
        '小さなバナー広告を表示しています（練習中の画面には表示しません）。',
  ),
];
