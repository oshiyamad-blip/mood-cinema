import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// 法的情報（プライバシーポリシー・利用規約）。
/// 正本は legal/*.md（公開URL）にあり、ここには同内容を表示する。
class LegalScreen extends StatelessWidget {
  const LegalScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('法的情報'),
          bottom: const TabBar(
            labelColor: AppColors.primary700,
            indicatorColor: AppColors.primary,
            tabs: [
              Tab(text: 'プライバシーポリシー'),
              Tab(text: '利用規約'),
            ],
          ),
        ),
        body: const TabBarView(
          children: [
            _LegalText(_privacyPolicy),
            _LegalText(_terms),
          ],
        ),
      ),
    );
  }
}

class _LegalText extends StatelessWidget {
  const _LegalText(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(AppSpacing.lg),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(AppRadius.md),
          boxShadow: AppShadows.sm,
        ),
        child: Text(text, style: AppText.body.copyWith(height: 1.7)),
      ),
    );
  }
}

const _privacyPolicy = '''
プライバシーポリシー（最終更新日: 2026年7月7日）

「ホンヨミ」はプライバシーファーストで設計されており、台本などのユーザーデータを原則として端末の外に送信しません。

1. 収集しない情報
・台本データ（取り込んだファイル、解析結果、練習履歴）は、すべて端末内でのみ処理・保存されます。開発者のサーバへ送信されることはなく、AIの学習に使用されることもありません。
・アカウント登録は不要で、氏名・メールアドレス等の個人情報を収集しません。
・現在、アクセス解析・広告SDKは組み込んでいません。

2. 端末の権限
・マイク／音声認識：ハンズフリー機能を使用する場合のみ利用します。既定では可能な限り端末内で音声認識を行います。設定で「高精度認識」を有効にした場合のみ、OSの音声認識サービスへ音声が送信されることがあります。マイクを使わなくても手動操作で全機能を利用できます。

3. オプトイン機能によるデータ送信（既定で無効）
・高精度認識：発話音声がOSの音声認識サービスで処理される場合があります。
・クラウド高品質音声（プロ）：相手役のセリフ本文が、音声合成のために開発者の管理するプロキシ経由で音声合成サービスへ送信されます。学習にデータを使用しない契約形態のサービスのみを使用します。

4. 購入情報
アプリ内課金は App Store / Google Play を通じて処理されます。課金状態の管理に RevenueCat を使用しており、購入履歴・匿名の端末識別子が送信されます（個人情報は含みません）。

5. データの保存と削除
台本・設定はすべて端末内に保存されます。アプリを削除すると全データが消去されます。

6. お問い合わせ
oshiyamad@gmail.com
''';

const _terms = '''
利用規約（最終更新日: 2026年7月7日）

本アプリをインストール・利用した時点で、本規約に同意したものとみなします。

1. 提供内容
本アプリは、台本の取り込み・解析・読み上げ等によりセリフ練習を支援するツールです。読み上げ音声・解析結果の正確性を保証するものではありません。

2. ユーザーコンテンツ（台本）と著作権
・取り込んだ台本の権利はユーザーまたは元の権利者に帰属します。
・ユーザーは、自身が著作権を有するか、練習目的での利用について適法な権限を持つ台本のみを取り込むものとします。
・台本は端末内でのみ処理され、開発者がその内容にアクセスすることはありません。

3. 禁止事項
法令違反、リバースエンジニアリング、不正な複製・再配布、課金の不正取得・回避。

4. 有料プラン（プロ）
・ストアのアプリ内課金（サブスクリプション）で提供され、期間終了の24時間前までに解約されない限り自動更新されます。
・購入・解約・返金はストアの規定に従います。

5. 免責事項
本アプリは現状有姿で提供されます。端末環境による音声品質・認識精度の差異、データの消失について、開発者は重大な過失がある場合を除き責任を負いません。

6. 準拠法
本規約は日本法に準拠します。

7. お問い合わせ
oshiyamad@gmail.com
''';
