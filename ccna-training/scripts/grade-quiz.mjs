#!/usr/bin/env node
// 小テスト課題のコメント解答を採点する支援スクリプト。
// 課題の最新の解答コメント（「Q1: A」形式）を取得し、正答と突き合わせて採点する。
// 記述式（A〜D 以外の解答）は自動採点せず「要手動採点」として表示する。
//
// 使い方:
//   BACKLOG_SPACE_URL=https://your-space.backlog.jp \
//   BACKLOG_API_KEY=xxxxxxxx \
//   node grade-quiz.mjs --issue CCNA-42 --answers "B,C,C,B,C,C,C,B,C" [--points 10] [--post]
//
//   --issue    小テスト課題の課題キー
//   --answers  正答をカンマ区切りで（Q1 から順に。記述問題は含めない = 末尾の設問が自動的に手動採点扱い）
//   --points   1 問の配点（既定 10。週次テストは 4 を指定）
//   --post     採点結果を課題にコメント投稿する（指定しなければ表示のみ）
//
// Node.js 18 以上、依存パッケージなし。

const args = process.argv.slice(2)
function argValue(name) {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const ISSUE = argValue('--issue')
const ANSWERS = (argValue('--answers') ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
const POINTS = Number(argValue('--points') ?? 10)
const POST = args.includes('--post')

const SPACE_URL = (process.env.BACKLOG_SPACE_URL ?? '').replace(/\/$/, '')
const API_KEY = process.env.BACKLOG_API_KEY

if (!ISSUE || ANSWERS.length === 0 || !SPACE_URL || !API_KEY) {
  console.error('必須の指定が不足しています。')
  console.error('  環境変数: BACKLOG_SPACE_URL, BACKLOG_API_KEY')
  console.error('  引数    : --issue <課題キー> --answers "B,C,..." [--points 10] [--post]')
  process.exit(1)
}
if (ANSWERS.some((a) => !/^[A-D]$/.test(a))) {
  console.error('--answers には A〜D のみをカンマ区切りで指定してください（記述問題は含めない）。')
  process.exit(1)
}

async function api(method, path, params = {}) {
  const url = new URL(`${SPACE_URL}/api/v2${path}`)
  url.searchParams.set('apiKey', API_KEY)
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

// コメント本文から「Q1: A」形式の解答を抽出する。全角コロン・小文字にも対応
function parseAnswers(text) {
  const map = new Map()
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*Q\s*(\d+)\s*[:：]\s*(.+?)\s*$/i)
    if (m) map.set(Number(m[1]), m[2].trim())
  }
  return map
}

async function main() {
  // 最新 100 件から、解答形式を含む最後のコメントを探す
  const comments = await api('GET', `/issues/${ISSUE}/comments`, { count: 100, order: 'asc' })
  let submission = null
  for (const c of comments) {
    if (c.content && parseAnswers(c.content).size >= Math.min(3, ANSWERS.length)) submission = c
  }
  if (!submission) {
    console.error(`課題 ${ISSUE} に「Q1: A」形式の解答コメントが見つかりません。`)
    process.exit(1)
  }

  const given = parseAnswers(submission.content)
  console.log(`採点対象: ${ISSUE} / コメント #${submission.id}（${submission.createdUser?.name ?? '不明'} / ${submission.created}）\n`)

  let correct = 0
  const lines = []
  for (let i = 0; i < ANSWERS.length; i++) {
    const q = i + 1
    const ans = (given.get(q) ?? '').toUpperCase()
    const ok = ans === ANSWERS[i]
    if (ok) correct++
    lines.push(`Q${q}: 提出=${given.get(q) ?? '（未解答）'} 正答=${ANSWERS[i]} ${ok ? '○' : '×'}`)
  }

  // 正答リストより後の設問（記述式）は手動採点
  const manual = [...given.keys()].filter((q) => q > ANSWERS.length).sort((a, b) => a - b)
  const autoScore = correct * POINTS

  console.log(lines.join('\n'))
  for (const q of manual) console.log(`Q${q}: 【要手動採点】提出内容: ${given.get(q)}`)
  console.log(`\n自動採点: ${correct}/${ANSWERS.length} 問正解 = ${autoScore} 点（+ 記述 ${manual.length} 問は手動加点）`)

  if (POST) {
    const body = [
      '## 採点結果（自動採点）',
      `選択式: ${correct}/${ANSWERS.length} 問正解 = ${autoScore} 点`,
      manual.length ? `記述式（Q${manual.join(', Q')}）: 講師が確認して加点します` : '',
      '',
      ...lines.map((l) => `- ${l}`),
      '',
      '解説は明朝公開の「解答解説」ドキュメントを確認してください。',
    ].filter((l) => l !== undefined).join('\n')
    await api('POST', `/issues/${ISSUE}/comments`, { content: body })
    console.log('\n採点結果を課題にコメントしました。')
  } else {
    console.log('\n（--post を付けると課題にコメント投稿します）')
  }
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
