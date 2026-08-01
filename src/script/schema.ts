/**
 * 脚本ビューの ProseMirror スキーマ（hakogaki-app から移植）。
 *   doc → scene+ → block(hashira | togaki | serifu)
 * scene はプロットの最上位の箱に対応し、attrs に sceneId（=box.id）を持つ。
 */
import { Schema } from 'prosemirror-model';

export type ScriptBlockType = 'hashira' | 'togaki' | 'serifu';

export const schema = new Schema({
  nodes: {
    doc: { content: 'scene+' },
    scene: {
      content: 'block+',
      attrs: { sceneId: { default: null } },
      toDOM: (node) => ['section', { class: 'scene', 'data-scene-id': node.attrs.sceneId ?? '' }, 0],
      parseDOM: [{ tag: 'section.scene' }],
    },
    block: {
      content: 'text*',
      group: 'block',
      defining: true,
      attrs: {
        type: { default: 'togaki' as ScriptBlockType },
        speaker: { default: null },
      },
      toDOM: (node) => {
        const type = node.attrs.type as ScriptBlockType;
        const attrs: Record<string, string> = { class: `sblock sblock--${type}`, 'data-type': type };
        if (type === 'serifu' && node.attrs.speaker) attrs['data-speaker'] = String(node.attrs.speaker);
        return ['div', attrs, 0];
      },
      parseDOM: [
        {
          tag: 'div.sblock',
          getAttrs: (dom) => {
            const el = dom as HTMLElement;
            return {
              type: (el.getAttribute('data-type') as ScriptBlockType) ?? 'togaki',
              speaker: el.getAttribute('data-speaker'),
            };
          },
        },
      ],
    },
    text: { group: 'inline' },
  },
});
