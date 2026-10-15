// "내 게임" 창: 저장된 게임 목록(열기·복제·내보내기·삭제)과 예제로 새 게임 만들기.

import { ko } from '../i18n/ko';
import { TEMPLATES, type TemplateKey } from '../templates';
import { el } from './dom';
import { deleteGame, listGames, newId, putGame, type StoredGame } from './library';

export interface LibraryHooks {
  currentId: string | null;
  open(g: StoredGame): void;
  /** 예제(없으면 빈 게임)로 새 게임을 만들어 연다 */
  create(from: TemplateKey | null): void;
  importFile(f: File): void;
  exportGame(g: StoredGame): void;
}

export async function openLibraryDialog(dialog: HTMLDialogElement, hooks: LibraryHooks): Promise<void> {
  const t = ko.library;
  const fmt = new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const render = async () => {
    const games = await listGames();
    const cards = games.map((g) => {
      const current = g.id === hooks.currentId;
      const thumb = g.thumb ? el('img', { src: g.thumb, alt: '' }) : el('div', { className: 'lib-ph', textContent: ko.templateIcons[g.from ?? ''] ?? '🎮' });
      const btn = (label: string, cls: string, fn: () => void, disabled = false) => {
        const b = el('button', { className: `lib-btn ${cls}`, textContent: label, disabled });
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          fn();
        });
        return b;
      };
      const card = el(
        'div',
        { className: `lib-card${current ? ' on' : ''}` },
        el('div', { className: 'lib-thumb' }, thumb),
        el('div', { className: 'lib-name', textContent: g.name, title: g.name }),
        el(
          'div',
          { className: 'lib-meta' },
          `${ko.templateIcons[g.from ?? ''] ?? ''} ${t.edited(fmt.format(g.updated))}`,
          ...(g.project.model ? [el('span', { className: 'lib-badge', textContent: t.trained })] : []),
        ),
        el(
          'div',
          { className: 'lib-actions' },
          current ? el('span', { className: 'lib-cur', textContent: t.current }) : btn(t.openBtn, 'primary', () => (dialog.close(), hooks.open(g))),
          btn(t.copy, '', async () => {
            await putGame({ ...structuredClone(g), id: newId(), name: t.copyName(g.name), created: Date.now(), updated: Date.now() });
            render();
          }),
          btn('⬇', '', () => hooks.exportGame(g)),
          btn('🗑', 'danger', async () => {
            if (!confirm(t.confirmDel(g.name))) return;
            await deleteGame(g.id);
            render();
          }, current),
        ),
      );
      if (!current) card.addEventListener('dblclick', () => (dialog.close(), hooks.open(g)));
      return card;
    });

    const tpl = (key: TemplateKey | null) => {
      const card = el(
        'button',
        { className: 'tpl-card' },
        el('span', { className: 'tpl-icon', textContent: key ? ko.templateIcons[key] : '✨' }),
        el('b', { textContent: key ? ko.templates[key] : t.blank }),
        el('span', { textContent: key ? ko.templateDesc[key] : t.blankDesc }),
      );
      card.addEventListener('click', () => {
        dialog.close();
        hooks.create(key);
      });
      return card;
    };

    const file = el('input', { type: 'file', accept: '.json,application/json' });
    file.style.display = 'none';
    file.addEventListener('change', () => {
      const f = file.files?.[0];
      if (f) {
        dialog.close();
        hooks.importFile(f);
      }
    });
    const imp = el('button', { className: 'btn ghost', textContent: t.import });
    imp.addEventListener('click', () => file.click());
    const close = el('button', { className: 'btn play', textContent: ko.paint.close });
    close.addEventListener('click', () => dialog.close());

    dialog.replaceChildren(
      el('h2', { textContent: t.title }),
      el('h3', { className: 'dz-h', textContent: t.mine }),
      games.length ? el('div', { className: 'lib-grid' }, ...cards) : el('div', { className: 'empty', textContent: t.none }),
      el('h3', { className: 'dz-h', textContent: t.fromTemplate }),
      el('div', { className: 'tpl-grid' }, tpl(null), ...(Object.keys(TEMPLATES) as TemplateKey[]).map(tpl)),
      el('div', { className: 'km-foot' }, el('span', {}, imp, file), close),
    );
  };

  dialog.classList.add('lib-dialog');
  dialog.addEventListener('close', () => dialog.classList.remove('lib-dialog'), { once: true });
  await render();
  dialog.showModal();
}
