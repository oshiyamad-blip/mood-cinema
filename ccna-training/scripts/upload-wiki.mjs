#!/usr/bin/env node
// 教材 Markdown（materials/ 以下）を Backlog Wiki へ一括投入するスクリプト。
// 投入後、Backlog の「Wiki → ドキュメント移行機能」でドキュメント化する想定
// （ドキュメント機能の API は未提供のため Wiki を経由する）。
//
// 使い方:
//   BACKLOG_SPACE_URL=https://your-space.backlog.jp \
//   BACKLOG_API_KEY=xxxxxxxx \
//   node upload-wiki.mjs --project CCNA [--include-quiz] [--dry-run]
//
//   --include-quiz  小テストファイル（dayNN-quiz.md）も投入する。
//                   ※ quiz ファイルには解答・解説が含まれるため既定では除外。
//                     受講者が Wiki を閲覧できる場合は絶対に指定しないこと。
//   --dry-run       API を呼ばず投入予定を表示する
//
// 同名の Wiki ページが既にあれば内容を更新する（冪等）。
// Node.js 18 以上、依存パッケージなし。

import { readdir, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
function argValue(name) {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const PROJECT_KEY = argValue('--project')
const INCLUDE_QUIZ = args.includes('--include-quiz')
const DRY_RUN = args.includes('--dry-run')

const SPACE_URL = (process.env.BACKLOG_SPACE_URL ?? '').replace(/\/$/, '')
const API_KEY = process.env.BACKLOG_API_KEY

if (!PROJECT_KEY || (!DRY_RUN && (!SPACE_URL || !API_KEY))) {
  console.error('必須の指定が不足しています。')
  console.error('  環境変数: BACKLOG_SPACE_URL, BACKLOG_API_KEY（--dry-run 時は不要）')
  console.error('  引数    : --project <KEY> [--include-quiz] [--dry-run]')
  process.exit(1)
}

const MATERIALS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'materials')
const GUIDANCE_FILES = [
  { file: join(dirname(fileURLToPath(import.meta.url)), '..', '04-guidance.md'), page: 'CCNA研修/00_ガイダンス/研修の進め方' },
  { file: join(dirname(fileURLToPath(import.meta.url)), '..', 'materials', 'day00-setup.md'), page: 'CCNA研修/00_ガイダンス/Day00 環境構築' },
  { file: join(dirname(fileURLToPath(import.meta.url)), '..', 'materials', 'templates', 'error-log.md'), page: 'CCNA研修/00_ガイダンス/誤答ノートの書き方' },
  { file: join(dirname(fileURLToPath(import.meta.url)), '..', 'materials', 'templates', 'weekly-retro.md'), page: 'CCNA研修/00_ガイダンス/週次振り返りの書き方' },
  { file: join(dirname(fileURLToPath(import.meta.url)), '..', '01-curriculum.md'), page: 'CCNA研修/00_ガイダンス/カリキュラム全体表' },
  { file: join(dirname(fileURLToPath(import.meta.url)), '..', '03-packet-tracer-manual.md'), page: 'CCNA研修/00_ガイダンス/PacketTracer導入マニュアル' },
]

const KIND_LABEL = { lecture: '講義', lab: 'ラボ手順書', quiz: '小テスト' }
const KIND_FOLDER = { lecture: '01_教材', lab: '02_ラボ手順書', quiz: '04_講師用_小テスト原本' }

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

async function collectPages() {
  const pages = []

  // ガイダンス系
  for (const g of GUIDANCE_FILES) {
    try {
      const content = await readFile(g.file, 'utf8')
      pages.push({ name: g.page, content })
    } catch {
      console.warn(`スキップ（読めません）: ${g.file}`)
    }
  }

  // materials/weekN/dayNN-{lecture,lab,quiz}.md
  const weeks = (await readdir(MATERIALS_DIR, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && /^week\d$/.test(e.name))
    .map((e) => e.name)
    .sort()

  for (const week of weeks) {
    const files = (await readdir(join(MATERIALS_DIR, week))).filter((f) => f.endsWith('.md')).sort()
    for (const f of files) {
      const m = f.match(/^day(\d{2})-(lecture|lab|quiz)\.md$/)
      if (!m) continue
      const [, day, kind] = m
      if (kind === 'quiz' && !INCLUDE_QUIZ) continue
      const content = await readFile(join(MATERIALS_DIR, week, f), 'utf8')
      const weekLabel = week.replace('week', 'Week')
      pages.push({
        name: `CCNA研修/${KIND_FOLDER[kind]}/${weekLabel}/Day${day} ${KIND_LABEL[kind]}`,
        content,
      })
    }
  }
  return pages
}

async function main() {
  const pages = await collectPages()
  console.log(`投入対象: ${pages.length} ページ${INCLUDE_QUIZ ? '（小テスト原本を含む — 受講者に Wiki 閲覧権限がないことを確認してください）' : '（小テストは除外。--include-quiz で含められます）'}`)

  if (DRY_RUN) {
    for (const p of pages) console.log(`[dry-run] ${p.name} (${p.content.length} 文字)`)
    return
  }

  const project = await api('GET', `/projects/${PROJECT_KEY}`)
  const existing = await api('GET', '/wikis', { projectIdOrKey: PROJECT_KEY })
  const byName = new Map(existing.map((w) => [w.name, w.id]))

  let created = 0
  let updated = 0
  for (const p of pages) {
    if (byName.has(p.name)) {
      await api('PATCH', `/wikis/${byName.get(p.name)}`, { name: p.name, content: p.content, mailNotify: 'false' })
      updated++
      console.log(`更新: ${p.name}`)
    } else {
      await api('POST', '/wikis', { projectId: project.id, name: p.name, content: p.content, mailNotify: 'false' })
      created++
      console.log(`作成: ${p.name}`)
    }
  }
  console.log(`\n完了: 作成 ${created} / 更新 ${updated}`)
  console.log('次の手順: Backlog の「Wiki → ドキュメント移行機能」で各ページをドキュメントへ変換し、フォルダと権限（講師用は受講者非公開）を整えてください。')
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
