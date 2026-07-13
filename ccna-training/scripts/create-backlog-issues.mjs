#!/usr/bin/env node
// Backlog へ CCNA 研修の課題（講義・ラボ・小テスト × 20 日分）を一括投入するスクリプト。
// 種別・カテゴリー・マイルストーンが未作成なら先に作成する。
//
// 使い方:
//   BACKLOG_SPACE_URL=https://your-space.backlog.jp \
//   BACKLOG_API_KEY=xxxxxxxx \
//   node create-backlog-issues.mjs --project CCNA --start 2026-08-03 [--assignee <userId>] [--dry-run]
//
//   --project   Backlog プロジェクトキー（必須）
//   --start     Day 1 の日付 YYYY-MM-DD（必須）。土日はスキップして期限日を採番する
//   --assignee  課題の担当者のユーザー ID（数値、省略可）
//   --dry-run   API を呼ばず作成予定の内容を表示する
//
// 必要権限: API キーのユーザーがプロジェクト管理者であること（種別等の作成に必要）。
// Node.js 18 以上（fetch 内蔵）で動作。依存パッケージなし。

import {
  ISSUE_TYPES, CATEGORIES, MILESTONES, DAYS,
  lectureDescription, labDescription, quizDescription,
} from './curriculum-data.mjs'

// ---------- 引数・環境変数 ----------

const args = process.argv.slice(2)
function argValue(name) {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const PROJECT_KEY = argValue('--project')
const START = argValue('--start')
const ASSIGNEE = argValue('--assignee')
const DRY_RUN = args.includes('--dry-run')

const SPACE_URL = (process.env.BACKLOG_SPACE_URL ?? '').replace(/\/$/, '')
const API_KEY = process.env.BACKLOG_API_KEY

if (!PROJECT_KEY || !START || (!DRY_RUN && (!SPACE_URL || !API_KEY))) {
  console.error('必須の指定が不足しています。')
  console.error('  環境変数: BACKLOG_SPACE_URL, BACKLOG_API_KEY（--dry-run 時は不要）')
  console.error('  引数    : --project <KEY> --start <YYYY-MM-DD> [--assignee <userId>] [--dry-run]')
  process.exit(1)
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(START)) {
  console.error(`--start は YYYY-MM-DD 形式で指定してください: ${START}`)
  process.exit(1)
}

// ---------- Backlog API クライアント ----------

async function api(method, path, params = {}) {
  const url = new URL(`${SPACE_URL}/api/v2${path}`)
  url.searchParams.set('apiKey', API_KEY)

  const init = { method }
  if (method === 'GET') {
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x))
      else if (v !== undefined) url.searchParams.set(k, v)
    }
  } else {
    const body = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) v.forEach((x) => body.append(k, x))
      else if (v !== undefined) body.set(k, v)
    }
    init.body = body
  }

  const res = await fetch(url, init)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Backlog API ${method} ${path} failed: ${res.status} ${text}`)
  }
  return res.json()
}

// ---------- 日付ユーティリティ（土日スキップ） ----------

function addBusinessDays(startYmd, n) {
  // startYmd を 0 営業日目として n 営業日後の YYYY-MM-DD を返す
  const [y, m, d] = startYmd.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  // 開始日が土日なら次の月曜へ
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 1)
  let remaining = n
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1)
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) remaining--
  }
  return date.toISOString().slice(0, 10)
}

// ---------- メイン ----------

async function ensureByName(existing, wanted, create, label) {
  // 既存一覧 existing（{id, name}[]）に wanted.name がなければ create() で作成し、
  // name -> id のマップを返す
  const map = new Map(existing.map((e) => [e.name, e.id]))
  for (const item of wanted) {
    if (map.has(item.name)) continue
    if (DRY_RUN) {
      console.log(`[dry-run] ${label} を作成: ${item.name}`)
      map.set(item.name, 0)
      continue
    }
    const created = await create(item)
    map.set(created.name, created.id)
    console.log(`${label} を作成しました: ${created.name} (id=${created.id})`)
  }
  return map
}

async function main() {
  console.log(`プロジェクト: ${PROJECT_KEY} / 開始日: ${START}${DRY_RUN ? ' [dry-run]' : ''}`)

  let issueTypeIds = new Map()
  let categoryIds = new Map()
  let milestoneIds = new Map()
  let priorityId = 3 // 「中」の既定 ID

  if (!DRY_RUN) {
    // 種別
    const types = await api('GET', `/projects/${PROJECT_KEY}/issueTypes`)
    issueTypeIds = await ensureByName(
      types, ISSUE_TYPES,
      (t) => api('POST', `/projects/${PROJECT_KEY}/issueTypes`, { name: t.name, color: t.color }),
      '種別',
    )

    // カテゴリー
    const cats = await api('GET', `/projects/${PROJECT_KEY}/categories`)
    categoryIds = await ensureByName(
      cats, CATEGORIES.map((name) => ({ name })),
      (c) => api('POST', `/projects/${PROJECT_KEY}/categories`, { name: c.name }),
      'カテゴリー',
    )

    // マイルストーン（週ごとに開始日・期限日を付与）
    const versions = await api('GET', `/projects/${PROJECT_KEY}/versions`)
    milestoneIds = await ensureByName(
      versions,
      MILESTONES.map((m) => ({
        ...m,
        startDate: addBusinessDays(START, (m.week - 1) * 5),
        releaseDueDate: addBusinessDays(START, (m.week - 1) * 5 + 4),
      })),
      (m) => api('POST', `/projects/${PROJECT_KEY}/versions`, {
        name: m.name, startDate: m.startDate, releaseDueDate: m.releaseDueDate,
      }),
      'マイルストーン',
    )

    // 優先度「中」の ID を取得
    const priorities = await api('GET', '/priorities')
    priorityId = (priorities.find((p) => p.name === '中') ?? priorities[Math.floor(priorities.length / 2)]).id
  }

  // プロジェクト ID（課題作成に必要）
  const projectId = DRY_RUN ? 0 : (await api('GET', `/projects/${PROJECT_KEY}`)).id

  // 課題の生成
  let created = 0
  for (const d of DAYS) {
    const dd = String(d.day).padStart(2, '0')
    const dueDate = addBusinessDays(START, d.day - 1)
    const quizType = d.weeklyTest ? '週次テスト' : '小テスト'
    const quizTitle = d.finalTest
      ? `[Day${dd}] 修了テスト: 全範囲（60問/120分）`
      : d.weeklyTest
        ? `[Day${dd}] 週次テスト: ${d.quiz}`
        : `[Day${dd}] 小テスト: ${d.quiz}`

    const issues = [
      { type: '講義', summary: `[Day${dd}] 講義: ${d.theme}`, description: lectureDescription(d) },
      { type: 'ラボ', summary: `[Day${dd}] ラボ: ${d.lab}`, description: labDescription(d) },
      { type: quizType, summary: quizTitle, description: quizDescription(d) },
    ]

    for (const issue of issues) {
      if (DRY_RUN) {
        console.log(`[dry-run] 課題: ${issue.summary}  期限=${dueDate} 種別=${issue.type} 週=Week${d.week} カテゴリー=${d.categories.join(',')}`)
        created++
        continue
      }
      await api('POST', '/issues', {
        projectId,
        summary: issue.summary,
        description: issue.description,
        issueTypeId: issueTypeIds.get(issue.type),
        priorityId,
        dueDate,
        'categoryId[]': d.categories.map((c) => categoryIds.get(c)),
        'milestoneId[]': [milestoneIds.get(MILESTONES.find((m) => m.week === d.week).name)],
        ...(ASSIGNEE ? { assigneeId: ASSIGNEE } : {}),
      })
      created++
      console.log(`課題を作成しました: ${issue.summary} (期限 ${dueDate})`)
    }
  }

  console.log(`\n完了: ${created} 件の課題を${DRY_RUN ? '作成予定として表示' : '作成'}しました。`)
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
