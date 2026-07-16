import fs from "fs";
import path from "path";
import OpenAI from "openai";
import type { Collector } from "./base";
import type { RawLog } from "@/types";
import crypto from "crypto";

/**
 * 音声ライフログコレクター。
 * tmp/audio/ ディレクトリ内の .m4a / .mp3 / .wav ファイルを Whisper で文字起こしし、
 * RawLog として返す。処理済みファイルは tmp/audio/processed/ へ移動する。
 */
export class VoiceLogCollector implements Collector {
  private readonly audioDir = path.join(process.cwd(), "tmp", "audio");
  private readonly processedDir = path.join(
    process.cwd(),
    "tmp",
    "audio",
    "processed"
  );

  async collect(_since: Date): Promise<RawLog[]> {
    if (!fs.existsSync(this.audioDir)) return [];
    if (!process.env.OPENAI_API_KEY) return [];

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const files = fs
      .readdirSync(this.audioDir)
      .filter((f) => /\.(m4a|mp3|wav|ogg)$/i.test(f));

    if (files.length === 0) return [];

    fs.mkdirSync(this.processedDir, { recursive: true });

    const logs: RawLog[] = [];

    for (const filename of files) {
      const filepath = path.join(this.audioDir, filename);
      try {
        const transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(filepath) as unknown as File,
          model: "whisper-1",
          language: "ja",
        });

        // ファイル名から日時を推測（形式: YYYYMMDD_HHmmss_*.m4a）
        const dateMatch = filename.match(/(\d{8})_(\d{6})/);
        const occurredAt = dateMatch
          ? new Date(
              `${dateMatch[1].slice(0, 4)}-${dateMatch[1].slice(4, 6)}-${dateMatch[1].slice(6, 8)}T${dateMatch[2].slice(0, 2)}:${dateMatch[2].slice(2, 4)}:${dateMatch[2].slice(4, 6)}`
            ).toISOString()
          : new Date().toISOString();

        logs.push({
          id: crypto.randomUUID(),
          source: "voice_log",
          collectedAt: new Date().toISOString(),
          occurredAt,
          content: transcription.text,
          metadata: { filename, durationSec: null },
        });

        // 処理済みに移動
        fs.renameSync(filepath, path.join(this.processedDir, filename));
      } catch {
        // 個別ファイルの失敗はスキップ
      }
    }

    return logs;
  }
}
