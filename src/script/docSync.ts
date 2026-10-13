/**
 * 脚本ビューの PM doc ⇄ Outline（プロット）の相互変換。
 * シーン＝プロットの最上位の箱。柱（シーン見出し）は box.heading と単一ソースで、
 * 脚本側で柱を書き替えればプロットの見出しも追従する。入れ子の子箱（メモ）には触れない。
 */
import type { Node as PMNode } from 'prosemirror-model';
import { schema } from './schema';
import type { ScriptBlockType } from './schema';
import { orderedBoxes, depthOf, uid } from '../lib/hakogaki';
import type { Box, Outline, ScriptLine } from '../lib/hakogaki';

/** Outline → PM doc。最上位の箱を表示順に並べ、各シーン＝柱＋本文行。 */
export function docFromOutline(o: Outline): PMNode {
  const { scene, block } = schema.nodes;
  const tops = orderedBoxes(o.boxes, o.structure).filter((b) => depthOf(b) === 0);
  const sceneNodes = (tops.length > 0 ? tops : [null]).map((b) => {
    const blocks = [
      block.create({ type: 'hashira' }, b?.heading ? schema.text(b.heading) : undefined),
      ...(b?.script ?? []).map((l) =>
        block.create({ type: l.type, speaker: l.speaker ?? null }, l.text ? schema.text(l.text) : undefined),
      ),
    ];
    return scene.create({ sceneId: b?.id ?? null }, blocks);
  });
  return schema.nodes.doc.create({}, sceneNodes);
}

/**
 * PM doc → Outline へ書き戻す。最上位の箱の heading / script だけを更新し、
 * 子箱・幕・打刻時刻・doc に無い箱には触れない（データを失わない）。
 * doc 側にだけあるシーン（sceneId null）は新しい最上位の箱として末尾に足す。
 */
export function applyDocToOutline(doc: PMNode, prev: Outline): Outline {
  const byId = new Map(prev.boxes.map((b) => [b.id, b]));
  const patch = new Map<string, { heading: string; script: ScriptLine[] }>();
  const appended: Box[] = [];

  doc.forEach((sceneNode) => {
    if (sceneNode.type !== schema.nodes.scene) return;
    let heading = '';
    const lines: ScriptLine[] = [];
    let first = true;
    sceneNode.forEach((blockNode) => {
      if (blockNode.type !== schema.nodes.block) return;
      const type = (blockNode.attrs.type as ScriptBlockType) ?? 'togaki';
      const text = blockNode.textContent;
      if (first && type === 'hashira') {
        heading = text; // 柱＝シーン見出し（プロットと単一ソース）
      } else {
        const line: ScriptLine = { type, text };
        if (type === 'serifu' && blockNode.attrs.speaker) line.speaker = String(blockNode.attrs.speaker);
        // 末尾の空行は保存しない（編集途中の Enter を残さない）
        lines.push(line);
      }
      first = false;
    });
    while (lines.length > 0 && lines[lines.length - 1].text === '' ) lines.pop();

    const sceneId = sceneNode.attrs.sceneId as string | null;
    if (sceneId && byId.has(sceneId)) {
      patch.set(sceneId, { heading, script: lines });
    } else if (heading.trim() || lines.length > 0) {
      appended.push({ id: uid(), act: '', heading, body: '', depth: 0, script: lines });
    }
  });

  let changed = appended.length > 0;
  const boxes = prev.boxes.map((b) => {
    const p = patch.get(b.id);
    if (!p) return b;
    const sameScript = JSON.stringify(b.script ?? []) === JSON.stringify(p.script);
    if (b.heading === p.heading && sameScript) return b;
    changed = true;
    return { ...b, heading: p.heading, script: p.script };
  });
  if (!changed) return prev;
  // 幕がある構成なら、新規シーンは最初の幕に入れる
  if (appended.length > 0) {
    const firstAct = prev.boxes.find((b) => depthOf(b) === 0)?.act ?? '';
    appended.forEach((b) => { b.act = firstAct; });
  }
  return { ...prev, boxes: [...boxes, ...appended], updated: Date.now() };
}
