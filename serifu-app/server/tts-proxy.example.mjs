// クラウドTTSプロキシ（参照実装 / 未デプロイ）
//
// 目的：TTS提供元のAPIキーをクライアントに埋め込まないため、
// アプリはこのプロキシだけを叩き、鍵はサーバ側の環境変数に保持する。
// Vercel / Netlify / Cloud Functions などの Node ランタイムを想定した
// 単一ハンドラ。アプリからは POST { text, voice, rate, format } を受け、
// 音声(mp3)バイト列を返す。
//
// 環境変数:
//   GOOGLE_TTS_KEY   … Google Cloud Text-to-Speech の APIキー
//   APP_SHARED_TOKEN … アプリ(CLOUD_TTS_TOKEN)と共有する簡易認証トークン
//
// アプリ側:
//   flutter run --dart-define=CLOUD_TTS_ENDPOINT=https://<your-host>/api/tts \
//               --dart-define=CLOUD_TTS_TOKEN=<APP_SHARED_TOKEN>
//
// 注意:
//   - 学習非利用が保証された「API」プランのみ使用（docs/02 §3-8, docs/05）。
//   - 送信は必要最小限（対象のセリフのみ）。可能なら Zero Data Retention を有効化。
//   - レート制限・不正利用対策（トークン検証 + 簡易クォータ）を必ず入れる。

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  // 簡易認証
  const auth = req.headers['authorization'] || '';
  const expected = `Bearer ${process.env.APP_SHARED_TOKEN || ''}`;
  if (!process.env.APP_SHARED_TOKEN || auth !== expected) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const { text, voice = 'ja-JP-Female', rate = 1.0 } = req.body || {};
  if (!text || typeof text !== 'string' || text.length > 2000) {
    res.status(400).json({ error: 'invalid text' });
    return;
  }

  // 声名 → Google のボイス設定へマップ（例）
  const ssmlGender = voice.includes('Male') ? 'MALE' : 'FEMALE';
  const name = voice.includes('Male') ? 'ja-JP-Neural2-C' : 'ja-JP-Neural2-B';

  try {
    const r = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${process.env.GOOGLE_TTS_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: 'ja-JP', name, ssmlGender },
          audioConfig: { audioEncoding: 'MP3', speakingRate: Math.max(0.5, Math.min(2.0, rate)) },
        }),
      }
    );
    if (!r.ok) {
      res.status(502).json({ error: 'tts upstream error' });
      return;
    }
    const data = await r.json();
    const buf = Buffer.from(data.audioContent, 'base64'); // MP3
    res.setHeader('Content-Type', 'audio/mpeg');
    res.status(200).send(buf);
  } catch (e) {
    res.status(500).json({ error: 'proxy failure' });
  }
}

// ElevenLabs を使う場合は上記の fetch 先を ElevenLabs の TTS エンドポイントに置き換え、
// 返却の audio/mpeg をそのまま送る（同様に鍵はサーバ側の環境変数に保持）。
