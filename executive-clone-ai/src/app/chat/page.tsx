"use client";

import { useState, useRef, useEffect } from "react";
import Shell from "@/components/Shell";
import type { ChatMessage } from "@/types";

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = (await res.json()) as
        | { ok: true; data: { reply: string } }
        | { ok: false; error: string };

      if (data.ok) {
        setMessages([...next, { role: "assistant", content: data.data.reply }]);
      } else {
        setMessages([
          ...next,
          { role: "assistant", content: `エラー: ${data.error}` },
        ]);
      }
    } catch {
      setMessages([
        ...next,
        { role: "assistant", content: "通信エラーが発生しました。" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
  }

  return (
    <Shell active="/chat">
      <div className="page-header">
        <h1>壁打ち対話</h1>
        <p>経営者の分身に事業課題や方針を相談する。Cmd/Ctrl + Enter で送信。</p>
      </div>

      <div className="chat-wrap">
        <div className="chat-messages">
          {messages.length === 0 && (
            <p className="text-muted font-sm" style={{ textAlign: "center", marginTop: "60px" }}>
              経営判断について自由に相談してください。
            </p>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`msg ${msg.role}`}>
              <div className="msg-bubble">{msg.content}</div>
            </div>
          ))}
          {loading && (
            <div className="msg assistant">
              <div className="msg-bubble text-muted">考えています…</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="chat-input-area">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="例: 新規事業の撤退タイミングをどう判断すべきか？"
            disabled={loading}
          />
          <button
            className="btn-primary"
            onClick={send}
            disabled={loading || !input.trim()}
            style={{ whiteSpace: "nowrap", minWidth: "72px" }}
          >
            送信
          </button>
        </div>
      </div>
    </Shell>
  );
}
