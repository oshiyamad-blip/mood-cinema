#!/usr/bin/env node
// AI一次採点ツール — 小テスト課題のコメント解答を Claude が採点し、
// 採点案と解説コメントを生成する（記述式にも対応）。
//
// grade-quiz.mjs（選択式の機械採点）との使い分け:
//   - 選択式だけを確実に採点したい → grade-quiz.mjs（AI不要・無料）
//   - 記述式を含めて一次採点し、フィードバック文まで自動生成したい → 本ツール
//   採点結果はあくまで「一次採点案」。講師が確認してから確定すること。
//
// 使い方:
//   cd ccna-training/scripts && npm install   # 初回のみ（@anthropic-ai/sdk）
//
//   BACKLOG_SPACE_URL=https://your-space.backlog.jp \
//   BACKLOG_API_KEY=xxxxxxxx \
//   ANTHROPIC_API_KEY=sk-ant-... \
//   node ai-grade.mjs --issue CCNA-42 --day 3 [--post] [--model claude-opus-4-8]
//
//   --issue  小テスト課題の課題キー
//   --day    出題日（1〜20）。教材 materials/weekN/dayNN-quiz.md を正解として使用
//   --quiz   quiz ファイルのパスを直接指定（--day の代わり）
//   --post   採点結果を Backlog の課題にコメント投稿する（既定は表示のみ）
//   --model  使用モデル（既定: claude-opus-4-8）
//
// Node.js 18 以上。

import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'

// ---------- 引数・環境変数 ----------

const args = process.argv.slice(2)
function argValue(name) {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const ISSUE = argValue('--issue')
const DAY = argValue('--day')
const QUIZ_PATH = argValue('--quiz')
const POST = args.includes('--post')
const MODEL = argValue('--model') ?? 'claude-opus-4-8'

const SPACE_URL = (process.env.BACKLOG_SPACE_URL ?? '').replace(/\/$/, '')
const BACKLOG_KEY = process.env.BACKLOG_API_KEY

if (!ISSUE || (!DAY && !QUIZ_PATH) || !SPACE_URL || !BACKLOG_KEY || !process.env.ANTHROPIC_API_KEY) {
  console.error('必須の指定が不足しています。')
  console.error('  環境変数: BACKLOG_SPACE_URL, BACKLOG_API_KEY, ANTHROPIC_API_KEY')
  console.error('  引数    : --issue <課題キー> --day <1-20>（または --quiz <path>） [--post] [--model <id>]')
  process.exit(1)
}

// ---------- Backlog API ----------

async function backlog(method, path, params = {}) {
  const url = new URL(`${SPACE_URL}/api/v2${path}`)
  url.searchParams.set('apiKey', BACKLOG_KEY)
  const init = { method }
  if (method === 'GET') {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  } else {
    const body = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) body.set(k, v)
    init.body = body
  }
  const res = await fetch(url, init)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Backlog API ${method} ${path} failed: ${res.status} ${text}`)
  }
  return res.json()
}

// コメントから「Q1: ...」形式の解答を含む最後のコメントを探す
function findSubmission(comments) {
  const hasAnswers = (text) => {
    let n = 0
    for (const line of (text ?? '').split(/\r?\n/)) {
      if (/^\s*Q\s*\d+\s*[:：]/i.test(line)) n++
    }
    return n >= 3
  }
  let found = null
  for (const c of comments) {
    if (hasAnswers(c.content)) found = c
  }
  return found
}

// ---------- 採点スキーマ ----------

const GRADE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['results', 'autoScore', 'maxScore', 'needsInstructorReview', 'feedback'],
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['question', 'given', 'expected', 'verdict', 'points', 'note'],
        properties: {
          question: { type: 'integer', description: '設問番号' },
          given: { type: 'string', description: '受講者の解答（未解答なら「未解答」）' },
          expected: { type: 'string', description: '正答（記述式は模範解答の要点）' },
          verdict: { type: 'string', enum: ['correct', 'partial', 'incorrect', 'unanswered'] },
          points: { type: 'integer', description: 'この設問の獲得点' },
          note: { type: 'string', description: '1文の判定理由。記述式は特に根拠を明確に' },
        },
      },
    },
    autoScore: { type: 'integer', description: '合計点（AI一次採点）' },
    maxScore: { type: 'integer', description: '満点' },
    needsInstructorReview: {
      type: 'array',
      items: { type: 'integer' },
      description: '判定に自信がなく講師の確認が必要な設問番号',
    },
    feedback: { type: 'string', description: '受講者向けフィードバック（3〜5文。良かった点→弱点→次のアクションの順、です・ます調）' },
  },
}

// ---------- メイン ----------

async function main() {
  // 1. 教材（正解）を読む
  const base = join(dirname(fileURLToPath(import.meta.url)), '..')
  const quizFile = QUIZ_PATH ?? join(base, 'materials', `week${Math.ceil(Number(DAY) / 5)}`, `day${String(DAY).padStart(2, '0')}-quiz.md`)
  const quizMd = await readFile(quizFile, 'utf8')

  // 2. 受講者の解答コメントを取得
  const comments = await backlog('GET', `/issues/${ISSUE}/comments`, { count: 100, order: 'asc' })
  const submission = findSubmission(comments)
  if (!submission) {
    console.error(`課題 ${ISSUE} に「Q1: A」形式の解答コメントが見つかりません。`)
    process.exit(1)
  }
  console.log(`採点対象: ${ISSUE} / コメント #${submission.id}（${submission.createdUser?.name ?? '不明'}）/ モデル: ${MODEL}\n`)

  // 3. Claude に採点させる（構造化出力）
  const client = new Anthropic()
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: [
      'あなたはCCNA 200-301の内容を熟知したネットワーク研修の採点者です。',
      '与えられた教材（設問・解答・解説・採点基準を含む）を唯一の正解基準として、受講者の解答を採点してください。',
      '採点ルール:',
      '- 教材の「採点基準」セクションに配点・合格基準が書かれていればそれに厳密に従う',
      '- 選択式: 教材の解答表と一致すれば correct、不一致は incorrect。表記ゆれ（小文字・全角）は正答扱い',
      '- 記述式: 教材の解説にある要点を満たせば correct、一部なら partial（配点の半分）、的外れなら incorrect',
      '- 記述式や曖昧な解答で判定に自信が持てない場合は needsInstructorReview に設問番号を入れる',
      '- feedback は受講者本人に向けた日本語（です・ます調）で、責めずに次の学習アクションを示す',
    ].join('\n'),
    messages: [
      {
        role: 'user',
        content: [
          '## 教材（設問・解答・解説・採点基準）',
          '```markdown',
          quizMd,
          '```',
          '',
          '## 受講者の解答コメント',
          '```',
          submission.content,
          '```',
          '',
          'この解答を採点してください。',
        ].join('\n'),
      },
    ],
    output_config: {
      format: { type: 'json_schema', schema: GRADE_SCHEMA },
    },
  })

  const grade = response.parsed_output
  if (!grade) {
    console.error('採点結果の解析に失敗しました。もう一度実行してください。')
    process.exit(1)
  }

  // 4. 結果表示
  for (const r of grade.results) {
    const mark = { correct: '○', partial: '△', incorrect: '×', unanswered: '－' }[r.verdict]
    console.log(`Q${r.question}: ${mark} ${r.points}点  提出=${r.given} / 正答=${r.expected}`)
    if (r.verdict !== 'correct') console.log(`      ${r.note}`)
  }
  console.log(`\n合計（AI一次採点）: ${grade.autoScore} / ${grade.maxScore} 点`)
  if (grade.needsInstructorReview.length) {
    console.log(`要講師確認: Q${grade.needsInstructorReview.join(', Q')}`)
  }
  console.log(`\n--- フィードバック案 ---\n${grade.feedback}`)

  // 5. 投稿
  if (POST) {
    const lines = [
      '## 採点結果（AI一次採点・講師確認前）',
      `**${grade.autoScore} / ${grade.maxScore} 点**`,
      grade.needsInstructorReview.length
        ? `※ Q${grade.needsInstructorReview.join(', Q')} は講師が確認のうえ最終確定します`
        : '※ 最終確定は講師の確認後です',
      '',
      ...grade.results.map((r) => {
        const mark = { correct: '○', partial: '△', incorrect: '×', unanswered: '－' }[r.verdict]
        return `- Q${r.question}: ${mark}（${r.points}点）${r.verdict === 'correct' ? '' : ` — ${r.note}`}`
      }),
      '',
      grade.feedback,
      '',
      '詳しい解説は明朝公開の「解答解説」を確認してください。',
    ].join('\n')
    await backlog('POST', `/issues/${ISSUE}/comments`, { content: lines })
    console.log('\n採点結果を課題にコメントしました（講師は内容を確認して状態を「完了」にしてください）。')
  } else {
    console.log('\n（--post を付けると課題にコメント投稿します）')
  }
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
