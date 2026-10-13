# 調査報告：海外プリプロ5アプリの日本語対応・機能・マネタイズ

作成日 2026-10-12。対象はInstagramリール
<https://www.instagram.com/reel/Dd4IuJnIjV4/>（投稿者 Emma Pascu ＠byemmasvision、映画監督、
2026-09-29投稿、3,317いいね・877コメント）。本書は既存プロダクトとは独立した新規企画の下調べである。

**v0.2（2026-10-12改訂）**：敵対的レビュー（`08`）の事実確認を受けて、国内の競合（脚本パックン・SUKETTO）の追加、規模や黒字に関する根拠のない記述の削除、統計と価格の更新を行った。コメント数は「prepro と書くと DM が届く」仕掛けで増えており、需要の指標にはならない。

## 1. 動画の内容

テーマは「5 apps every filmmaker needs for pre-production（プリプロダクションに全フィルムメーカーが
必要な5アプリ）」。30秒の自撮り解説で、字幕と画面スクショから以下の5本を順に紹介している。
キャプションでは「現在 Scriptation で次の短編のディレクターズ・ブレイクダウンをやっている」と述べ、
「prepro」とコメントすると全リストとリンクをDMで送る、という典型的なリード獲得型の投稿だった。

| # | アプリ | 動画内の説明（要旨） |
|---|---|---|
| 1 | Cadrage | どのレンズ・カメラの画角でも、スマホで構図を試せる（ディレクターズ・ビューファインダー） |
| 2 | Scriptation | 台本のブレイクダウン、注釈、マークアップに最適 |
| 3 | CineFlo | コールシートと現場ロジスティクスを、Excelを開かずに扱える |
| 4 | StudioBinder（Web） | ブレイクダウン、撮影スケジュール、Day out of Days、ショットリストなどの無料テンプレートが揃う |
| 5 | Shot Designer | ブロッキング（人物・カメラ・照明の配置）の計画に最適 |

動画は5本を「構図確認」「台本分析」「現場運用」「全体管理」「配置図」の使い分けとして紹介している。
ただし海外には統合型もすでに多い（StudioBinder・CineFlo・Cadrage Studio、第3章）。投稿者が実際に
使っていると確認できるのは、キャプションにある Scriptation だけである。

## 2. 日本語対応の有無

結論として、5本のうち日本語UIを持つものは一つもない。日本のApp Storeで入手できるものは
あるが、言語欄に日本語はなく、日本語の公式ドキュメントや利用者コミュニティも実質存在しない。

| アプリ | 日本ストア配信 | UI言語 | 日本語情報 | 備考 |
|---|---|---|---|---|
| Cadrage | あり（¥3,000） | 英語・簡体字中国語 | CineD日本語版の翻訳記事程度 | 日本ストア評価4.6（66件）。Android版は機能が古いと公式が明記 |
| Scriptation | あり | 英・西・仏・葡 | なし | 日本ストア評価4.5（6件）、米国は3.5千件。Apple専用（iOS/iPadOS/Mac） |
| CineFlo | あり | 英語（Play日本語説明文あり、UI日本語化は未確認） | なし | iOS/Android/Mac/Web。2025年6月頃公開の新興アプリ |
| StudioBinder | Webのみ | 英語のみ（公式ヘルプが「英語だけ、ブラウザ翻訳を使え」と明記） | Capterra自動翻訳ページ程度 | ネイティブアプリなし |
| Shot Designer | あり（本体無料、Pro は ¥3,000 のアプリ内課金） | 英語のみ | なし | 最終更新2024-10。日本ストア評価3.0（2件）、保存不能の報告あり |

競合では、ビューファインダーの Artemis Director's Viewfinder（Chemical Wedding、8言語、日本語UIあり）だけが日本語化されている。2026年6月に発表された新しい「Artemis Pro」とは別の製品である。

## 3. 各アプリの機能

### Cadrage（Cadrage GmbH、ウィーン、規模は未公表）
数千のシネカメラ・スチルカメラとレンズ（球面・アナモフィック）の画角を正確に再現し、任意の
アスペクト比のフレームラインを重ねて静止画・動画を記録する。焦点距離・フォーマット・方位・GPSを
写真に付記し、プロジェクトとシーン単位で管理してPDFショットリストに書き出せる。2026年7月には
太陽軌道表示を追加した。同社は姉妹アプリ Cadrage Studio（脚本・ショットリスト・カメラ配置図・ムードボード・LiDARロケ記録を
統合、生成AI不使用、Apple専用）を、2026年6月に試用版、7月に正式版として公開した。台本を読み込むと
シーンと人物を検出してショットリストや配置図に紐づける、統合型の製品である。

### Scriptation（Scriptation LLC、カリフォルニア、創業2013年、Emmy技術賞受賞）
PDF台本への注釈（ペン・ハイライト・写真・音声、Apple Pencil対応）を基盤に、改訂稿へ注釈を
自動転記する Note Transfer が看板機能。会議・リハ・部署別の注釈レイヤー、小道具・衣裳・ロケ等の
タグ付けによるブレイクダウンとPDF/CSV出力、改訂差分比較、抜き台本（サイズ）作成、
スクリプター用ライニング、AI読み上げを備える。Team版は Live Layers でリアルタイム共有できる。
Final Draftからは.fdx直接ではなくPDF経由で取り込む。『Wicked』『Fallout』などの採用実績がある。

### CineFlo（Neon Media LLC、テネシー、規模は未公表）
スケジュールからコールシートを自動生成し、天気・ゴールデンアワー・最寄り病院を自動補完して
メール配信、開封・確認状況をライブ追跡する。ストリップボード型スケジュール、連絡先DB、
台本ブレイクダウン（.fdx/Fountain/PDF取込、15カテゴリ）、予算、ショットリスト、絵コンテ、
ロケハン（ジオタグ・影マップ）、各種レポート、撮影計算機を1本に収め、オフラインファーストで
動く。公称5,000人・140か国だが、Android は1,000ダウンロード程度と規模は小さい。旧名は CineLog Pro。
Pro では Claude や ChatGPT からプロジェクトを参照できる接続機能（Connected Apps）を持つ。

### StudioBinder（StudioBinder Inc.、サンタモニカ、創業2016年）
脚本エディタ（Final Draft取込、改訂色）、ブレイクダウン、ストリップボード型スケジュールと
Day out of Days、ショットリスト、絵コンテ、ムードボード、コールシート（天候・病院自動付与、
開封確認、承認フロー）、連絡先・ロケ管理、タスク・カレンダー、Enterprise向けSSO・ブランディング
まで、プリプロから現場までを網羅するWeb SaaS。公称10万社以上・180か国。

### Shot Designer（Hollywood Camera Work SRL、フィレンツェ、規模は未公表）
俯瞰のカメラ配置図で人物とカメラを動かし（人物を動かすとカメラが追従）、配置図から
ショットリストを自動生成する。人物・カメラのアニメーション、絵コンテ画像のリンク、
セット平面図、ライティング図、小道具ライブラリ、テンプレートを持つ。本体事業は演出教材
「The Master Course」で、アプリは2年更新が止まっている。

## 4. マネタイズ

価格帯は三層に分かれる。単機能の道具は¥3,000の買い切り、個人向けの業務アプリは
月¥1,000〜1,500のサブスク、チーム向けSaaSは月¥5,000〜50,000でコンテンツマーケティングから
無料プランへ流し込む構造だ。収益の重心は「共同作業と配布」に寄っており、支払主体が個人から
制作会社に移る層ほど単価が上がる。

| アプリ | モデル | 価格 | 無料枠 | 公開指標 |
|---|---|---|---|---|
| Cadrage | 買い切り | US$19.99／¥3,000。IAP・サブスクなし | なし | 10万人以上が利用（公称） |
| Cadrage Studio | サブスク | $19.99/月、$99.99/年、7日試用 | – | 2026-07正式公開 |
| Shot Designer | 無料＋Pro買い切り | Pro $19.99／¥3,000（Mac/PC版も付属） | 一度に1シーンまで無料。ファイル管理・同期・PDF/Excel書き出しは Pro | 評価件数は十数件 |
| Scriptation | フリーミアム＋Team＋Enterprise | Industry Pro $99.99/年・$14.99/月。AI別課金$19.99〜99.99。Team は Starter 10台・Professional 20台・Production 40台で、月払い$19.99〜16.99/台・年払い$16.99〜12.49/台。Industry Pro は $12.99/月・$77.99/年の表示も併存。教育50%オフ | 同時3文書まで、ファイル画面に広告 | 米国3.5千件評価、投資家は俳優・撮影監督 |
| CineFlo | フリーミアム（単一Pro） | $7.99/月、$59.99/年（¥1,070／¥8,000）、14日試用。共同編集の追加席料なし | 1作品、1GB、PDF出力・共同編集不可 | 5,000人・140か国（公称） |
| StudioBinder | フリーミアムSaaS | Starter $29〜42、Indie $49〜85、Professional $99〜127、Agency $199〜229、Studio $299〜340（月額）、追加席$25/人/月、Enterprise見積 | 1作品、連絡先10・ショット10などの上限、コールシートは自分宛てのみ | ブログ月200万読者、YouTube210万人。推定売上約180万ドル/年（未確認）。料金は第三者の集計で、主な出典が競合ベンダー（CineLog）の比較記事のため参考値 |

StudioBinderの集客は、「shot list template」「call sheet template」といった無料テンプレート記事で
検索流入の半分以上を取り、無料プラン登録から有料化へつなぐ導線が中核にある。日本語圏にも
香盤表や撮影スケジュールのテンプレート記事はすでに多数あり（LIG、マネーフォワード、Asana 日本語版など）、
競合の脚本パックンも記事を出している。同じ手法は使えるが、既存記事との順位争いになる。

## 5. 日本に同等のものはあるか

日本語で5本の機能を一つで扱えるアプリはない。ただし、撮影準備の中心である香盤表については、
日本語の製品がすでにある。特に2026年6月に正式リリースされた脚本パックンは、台本から香盤表を
AIで作る直接の競合である。

| 分野 | 日本語の既存 | 状況 |
|---|---|---|
| 台本→香盤表（AI生成） | 脚本パックン（2026-06-01正式リリース。台本PDFをAIで読み込み、キャスト・ロケ地・小道具・D/Nを抽出して香盤表・シーンリスト・撮影スケジュール・PPM資料（.pptx）を作る。スタンダード¥5,000／プロ¥10,000、税別・月・1香盤ボード、スタンダードは30日試用。「AI学習対象外」「データ暗号化」を掲げる） | 直接の競合。スタンダードは「ショートドラマ・CM・短編向け」 |
| 台本→香盤→総スケ→日々スケ | Creators Note（MetaMoJi開発、Film Solutions販売、iPad／Apple シリコン Mac、共同編集あり、¥1,540/月） | 一貫ツール。ただし最終更新は2025-03で止まっている |
| 工程表（制作進行） | SUKETTO（IDENCE。縦型ガントの工程表SaaS。FREE〜BUSINESS ¥12,800／ワークスペース・月） | 香盤表機能を「COMING SOON」と予告 |
| 香盤表（手作業） | Excel・Googleスプレッドシートの自作が依然多数。sixwheel.netの無料Webツール（取材向け）、カットシートメーカー（BOOTH、動画からカットシート生成） | テンプレート記事は多数ある |
| 縦書き台本 | O's Editor3（2026-01）、Scriptia Pro、台本ビューア、Nola（脚本書式非対応） | 執筆・閲覧のみ。ブレイクダウン連携なし |
| 絵コンテ | DROMI（フェンリル、無料）、e-Conte Board、LUMIX Flow（パナソニック、脚本→絵コンテ→ショットリスト、無料。カメラなしのスマホ/タブレットモードもある） | 単機能 |
| ビューファインダー | Artemis Director's Viewfinder（日本語UI）、Cadrage（英語） | 国産のDirector's Finder（AOI）は配信状況未確認 |
| ブロッキング図 | なし | 空白 |
| コールシート配布 | なし（LINE・メール・PDFの手作業） | 空白 |

日本の制作慣行はハリウッドと文書の切り方が異なる。ハリウッドが Breakdown Sheet・Stripboard・
Day out of Days・Call Sheet に分業するところを、日本では助監督が「香盤表」（シーン×出演者・
場所・衣裳・小道具のマトリクス）に集約し、そこから「総スケ」（全日程）と「日々スケ」（当日の
香盤。実質コールシート）へ展開する。台本は縦書きで、柱に○、ト書きは字下げ、セリフは「」で
書く。この香盤表が、海外5本の機能をつなぐ自然なハブになる。

## 6. 日本で作成・リリースできるか

できる。固有の許認可や業法はなく、必要なのは一般的な要件だけである。特定商取引法に基づく
表記（事業者情報、価格、解約条件、継続課金の最終確認画面）、個人情報保護法への対応
（クルー連絡先を扱うため個人情報取扱事業者に該当し、利用目的の公表・安全管理措置・海外リージョン
利用時の第三者提供整理が要る）、App Store／Google Play の規約に沿ったプライバシーポリシーが
主なもので、スマホソフトウェア競争促進法はプラットフォーム側の規制なので開発者側に追加義務はない。
ただし同法の施行に合わせ、日本の App Store の手数料は2025-12から「10%＋決済処理5%」の構成に変わり、
外部決済などの選択肢も増えた。電気通信事業法の外部送信規律（エラー監視などの SDK）への該当と、
特定商取引法の事業者情報の公開は、公開前に確認が要る。

技術面でも実現可能である。5本はいずれも大企業の製品ではなく、最大の StudioBinder でも推定数十名規模で、
CineFlo のように小さな体制で StudioBinder に近い機能を iOS/Android/Web に展開している例もある。唯一の難所はビューファインダーの
レンズ・カメラデータベースで、Cadrageはこれを10年以上かけて蓄積している。ここは初期には
簡易版（アスペクト比フレームと画角換算）に留め、写真の取り込み連携で代替する判断が妥当だ。

需要を示す数字は、使い方に注意が要る。2025年の邦画公開本数は694本（前年685本）で横ばいであり、
しかも劇場公開の商業映画の数字である。PFFアワードの応募は2025年795本、2026年834本と増えているが、
伸びは鈍っている。縦型ショートドラマは、2026年の国内市場を1,530億円とする予測（YHリサーチ）があるが、
2024年の「話売り型」は70〜80億円という別の定義の数字もあり、どちらも視聴の市場で、制作ツールへの
支出ではない。主要プレイヤー74社（AdLink のカオスマップ2025）には、プラットフォームや広告会社も含まれる。
映像制作会社の8割が従業者19人以下という数字は2014年の経産省調査で古い。2024年度の倒産58件（TSR）は
映像制作関連業の全体で、映画・ビデオ制作に限ると34件である。いずれも、予算が細り内製化が進む中で、
道具には低価格と分かりやすい費用対効果が求められることを示している。想定顧客の数は、制作会社と
助監督・制作部の人数から積み上げて検証する（`03` 第14章）。

## 出典

- リール本体: https://www.instagram.com/reel/Dd4IuJnIjV4/ （字幕・画面スクショから内容を起こした）
- Cadrage: https://cadrage.app/ ／ https://apps.apple.com/jp/app/id793232740 ／ https://www.newsshooter.com/2026/07/24/cadrage-directors-viewfinder-app-now-includes-sun-tracking/ ／ https://www.cined.com/jp/cadrage-studio-launches-in-early-access-pre-production-suite-from-the-directors-viewfinder-team/ ／ https://theasc.com/article/cadrage-launches-cadrage-studio/
- Shot Designer: https://www.hollywoodcamerawork.com/shot-designer.html ／ https://apps.apple.com/jp/app/id556342711 ／ https://www.cgchannel.com/2012/10/hollywood-camera-work-releases-shot-designer-app/
- Scriptation: https://scriptation.com/pricing/ ／ https://help.scriptation.com/en/article/how-much-does-scriptation-cost-1qpv7p8/ ／ https://help.scriptation.com/en/article/is-scriptation-available-for-windows-or-android-u9478l/ ／ https://apps.apple.com/jp/app/id1094587086 ／ https://nofilmschool.com/Scriptation-Team
- CineFlo: https://cineflo.com ／ https://www.cineflo.com/pricing ／ https://apps.apple.com/jp/app/id6746819363 ／ https://play.google.com/store/apps/details?id=com.cinelogapp.cinelog&hl=ja
- StudioBinder: https://www.studiobinder.com/press ／ https://support.studiobinder.com/en/articles/1531807-how-to-change-studiobinder-s-language ／ https://support.studiobinder.com/en/articles/10106468-choosing-the-right-studiobinder-plan ／ https://cinelog.com/articles/cinelog-vs-studiobinder-vs-yamdu-vs-celtx-2026/ ／ https://cw.semrush.com/website/studiobinder.com/overview
- 競合価格: https://apps.apple.com/us/app/artemis-pro/id1164523253 ／ https://www.yamdu.com/en/pricing/ ／ https://help.sethero.com/en/articles/1513627-how-do-the-pricing-plans-work ／ https://www.ep.com/ep-store/movie-magic-scheduling-annual/ ／ https://filmustage.com/pricing/ ／ https://boords.com/pricing
- 日本市場: https://product.metamoji.com/manual/creatorsnote_b6/ios/ja/script_kouban.php ／ https://direct.script-fs.com/ ／ https://www.generalasahi.co.jp/cd/movie/topics/call-sheet/ ／ https://sixwheel.net/kobanhyo-detail/ ／ https://booth.pm/ja/items/8111900 ／ https://art-science.org/journal/v14n5/v14n5pp229/artsci-v14n5pp229.pdf ／ https://forest.watch.impress.co.jp/docs/news/2076593.html ／ https://panasonic.jp/dc/lumix-flow.html ／ https://apps.apple.com/jp/app/id1631945583
- 市場規模: http://www.eiren.org/toukei/index.html ／ https://corporate.pia.jp/news/files/PFFaward2025_ver3_20250731.pdf ／ https://www.meti.go.jp/statistics/tyo/tokusabizi/result-2/h26/pdf/h26outline04.pdf ／ https://www.tsr-net.co.jp/data/detail/1201236_1527.html ／ https://gamebiz.jp/news/393048 ／ https://dime.jp/genre/1944607/
- 国内の競合（v0.2で追加）: https://service.kyakuhon-pakkun.com/ ／ https://service.kyakuhon-pakkun.com/pricing ／ https://suketto.io/ ／ https://apps.apple.com/jp/app/creators-note/id1635489825
- テンプレート記事（v0.2で追加）: https://liginc.co.jp/574620 ／ https://biz.moneyforward.com/work-efficiency/basic/10557/ ／ https://asana.com/ja/templates/shooting-schedule
- 統計・その他（v0.2で追加）: https://www.sakigake.jp/news/article/20260928OR0214/ ／ https://koubo.jp/article/117893 ／ https://www.newsshooter.com/2026/07/13/cadrage-studio-is-now-available-to-purchase/ ／ https://www.newsshooter.com/2026/06/10/artemis-pro-directors-viewfinder/ ／ https://macrumors.com/2025/12/17/japan-app-store-feature-updates
- 法務: https://www.no-trouble.caa.go.jp/what/mailorder/ ／ https://keiyaku-watch.jp/media/hourei/kojinjoho-toriatukai/
