"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import type { Signal, SignalCategory } from "@/types";

const CATEGORY_LABELS: Record<SignalCategory, string> = {
  hypothesis: "仮説・気づき",
  key_person: "重要人物",
  idea: "アイデア",
  policy: "経営方針",
  market: "市場・競合",
  other: "その他",
};

const CATEGORIES: SignalCategory[] = [
  "hypothesis",
  "key_person",
  "idea",
  "policy",
  "market",
  "other",
];

export default function SignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [filter, setFilter] = useState<SignalCategory | "">("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const query = filter ? `?category=${filter}` : "";
    fetch(`/api/signals${query}`)
      .then((r) => r.json())
      .then(
        (d: { ok: true; data: Signal[] } | { ok: false; error: string }) => {
          if (d.ok) setSignals(d.data);
        }
      )
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <Shell active="/signals">
      <div className="page-header">
        <h1>シグナル一覧</h1>
        <p>収集された言動から抽出した経営重要情報</p>
      </div>

      {/* フィルター */}
      <div className="flex gap-8" style={{ marginBottom: "20px", flexWrap: "wrap" }}>
        <button
          className={filter === "" ? "btn-primary" : "btn-ghost"}
          onClick={() => setFilter("")}
        >
          すべて
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            className={filter === cat ? "btn-primary" : "btn-ghost"}
            onClick={() => setFilter(cat)}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {loading && (
        <p className="text-muted font-sm">読み込み中…</p>
      )}

      {!loading && signals.length === 0 && (
        <p className="text-muted font-sm">
          シグナルがまだありません。データ収集バッチを実行してください。
        </p>
      )}

      {signals.map((s) => (
        <div key={s.id} className="card">
          <div className="flex items-center justify-between">
            <span className={`badge badge-${s.category}`}>
              {CATEGORY_LABELS[s.category]}
            </span>
            <span className="font-sm text-muted">{s.occurredAt.slice(0, 10)}</span>
          </div>
          <p style={{ marginTop: "10px", fontWeight: 600 }}>{s.summary}</p>
          <p className="font-sm text-muted mt-4">{s.extractionReason}</p>
          {s.rawText && (
            <details style={{ marginTop: "10px" }}>
              <summary className="font-sm text-muted" style={{ cursor: "pointer" }}>
                原文を表示
              </summary>
              <p
                className="font-sm"
                style={{
                  marginTop: "6px",
                  padding: "10px",
                  background: "var(--surface2)",
                  borderRadius: "6px",
                  whiteSpace: "pre-wrap",
                  lineHeight: "1.7",
                }}
              >
                {s.rawText}
              </p>
            </details>
          )}
        </div>
      ))}
    </Shell>
  );
}
