import Link from "next/link";
import Shell from "@/components/Shell";

export default function DashboardPage() {
  return (
    <Shell active="/">
      <div className="page-header">
        <h1>ダッシュボード</h1>
        <p>経営者クローン AI — 意思決定支援システム</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="value">—</div>
          <div className="label">累計シグナル</div>
        </div>
        <div className="stat-card">
          <div className="value">—</div>
          <div className="label">ストーリー数</div>
        </div>
        <div className="stat-card">
          <div className="value">—</div>
          <div className="label">意思決定ルール</div>
        </div>
        <div className="stat-card">
          <div className="value">—</div>
          <div className="label">対話セッション</div>
        </div>
      </div>

      <div className="card">
        <h2 className="font-bold" style={{ marginBottom: "16px" }}>
          クイックアクション
        </h2>
        <div className="flex gap-12">
          <Link href="/chat">
            <button className="btn-primary">経営者と壁打ちする</button>
          </Link>
          <Link href="/signals">
            <button className="btn-ghost">シグナルを確認する</button>
          </Link>
          <Link href="/stories">
            <button className="btn-ghost">ストーリーを読む</button>
          </Link>
        </div>
      </div>

      <div className="card mt-16">
        <h2 className="font-bold" style={{ marginBottom: "12px" }}>
          システム概要
        </h2>
        <p className="font-sm text-muted" style={{ lineHeight: "1.8" }}>
          このシステムは経営者の日常的な言動（チャット・メール・会議・音声）を自動収集し、
          経営に重要な情報をシグナルとして抽出します。
          蓄積されたシグナルと意思決定パターンを基に、
          経営者の分身として対話を通じた意思決定支援を行います。
          事前の壁打ちにより会議回数を削減し、意思決定速度を高めることを目的とします。
        </p>
      </div>
    </Shell>
  );
}
