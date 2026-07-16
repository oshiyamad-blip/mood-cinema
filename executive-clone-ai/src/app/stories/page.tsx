"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import type { Story } from "@/types";

export default function StoriesPage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stories")
      .then((r) => r.json())
      .then(
        (d: { ok: true; data: Story[] } | { ok: false; error: string }) => {
          if (d.ok) setStories(d.data);
        }
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <Shell active="/stories">
      <div className="page-header">
        <h1>ストーリー</h1>
        <p>過去の意思決定パターンを因果関係で繋いだナラティブ</p>
      </div>

      {loading && <p className="text-muted font-sm">読み込み中…</p>}

      {!loading && stories.length === 0 && (
        <p className="text-muted font-sm">
          ストーリーがまだありません。シグナルが蓄積されると自動生成されます。
        </p>
      )}

      {stories.map((story) => (
        <div key={story.id} className="card">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">{story.title}</h2>
            <span className="font-sm text-muted">
              {story.generatedAt.slice(0, 10)}
            </span>
          </div>

          {story.pattern && (
            <span
              className="badge"
              style={{
                marginTop: "8px",
                background: "var(--surface2)",
                color: "var(--text-muted)",
              }}
            >
              パターン: {story.pattern}
            </span>
          )}

          <p style={{ marginTop: "12px", lineHeight: "1.8" }}>{story.summary}</p>

          <div
            style={{
              marginTop: "14px",
              padding: "12px",
              background: "var(--surface2)",
              borderRadius: "6px",
              borderLeft: "3px solid var(--accent)",
            }}
          >
            <p className="font-sm text-muted" style={{ marginBottom: "4px" }}>
              結果・成果
            </p>
            <p className="font-sm">{story.outcome}</p>
          </div>
        </div>
      ))}
    </Shell>
  );
}
