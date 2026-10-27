window.__ModuleLoader__.load({
  id: 'hsb-screenshoot',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    let primitives = null;
    try { primitives = require('@deepseek-ai/dsh-client-ui-primitives'); } catch { primitives = null; }
    const ChevronUp = primitives ? primitives.IconChevronUpOutlineRegular : null;
    const ToolIcon = (() => {
      for (const name of ['IconSparkleRegular', 'IconApiOutlineRegular', 'IconCodeOutlineRegular']) {
        const candidate = primitives ? primitives[name] : null;
        if (typeof candidate === 'function') return candidate;
      }
      return null;
    })();
    let createPortal = null;
    try { createPortal = require('react-dom').createPortal; } catch { createPortal = null; }

    // Must match the frame server port in cordis.patch.yml.
    const PORT = 49231;
    const base = `http://127.0.0.1:${PORT}`;

    const TITLES = {
      screen_capture_monitor: 'Screen monitor',
      screen_capture_region: 'Screen region',
      screen_capture_window: 'Screen window',
    };

    // Same shapes the Browser plugin uses: a tool row (leading chevron, "Tool",
    // separator dot, summary) with the shot indented under it as a card.
    const ensureStyles = () => {
      if (typeof document === 'undefined') return;
      if (document.querySelector('style[data-plugin="hb-screenshoot"]') !== null) return;
      const tag = document.createElement('style');
      tag.dataset.plugin = 'hb-screenshoot';
      tag.textContent = `
.bp-tool-row { display: flex; align-items: center; gap: 6px; padding: 2px 0; min-height: 24px; cursor: pointer; }
.bp-tool-leading { display: inline-flex; width: 16px; justify-content: center; align-items: center;
  color: var(--dsw-alias-label-tertiary, #8a8a8a); }
.bp-tool-name { font-size: 13px; line-height: 24px; color: var(--dsw-alias-label-primary, #1b1b1f); }
.bp-tool-sep { width: 2px; height: 2px; border-radius: 1px; background: currentColor; opacity: .35; }
.bp-tool-args { font-size: 13px; line-height: 24px; color: var(--dsw-alias-label-secondary, #5f5f63);
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bp-body-wrap { padding: 4px 0 6px 22px; }
.bp-io-card { border: .5px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12)); border-radius: 10px;
  padding: 8px 10px; background: var(--dsw-specific-input-major, #f7f7f8); display: flex; flex-direction: column; gap: 6px; }
.bp-io-section { display: flex; gap: 8px; align-items: baseline; }
.bp-io-label { font-size: 11px; letter-spacing: .06em; color: var(--dsw-alias-label-tertiary, #8a8a8a); width: 26px; flex: none; }
.bp-io-text { font-size: 12px; line-height: 18px; white-space: pre-wrap; color: var(--dsw-alias-label-secondary, #5f5f63); word-break: break-all; }
.bp-shot-indent { margin-left: 22px; }
.bp-shot-wrap { display: flex; flex-direction: column; gap: 6px; padding: 2px 0 6px; max-width: 440px; }
.bp-shot-box { position: relative; display: inline-block; line-height: 0; }
.bp-shot { display: block; width: auto; height: auto; max-width: 260px; max-height: 162px; box-sizing: border-box;
  border: .5px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12)); border-radius: var(--dsw-radius-lg, 10px);
  background: var(--dsw-specific-input-major, #f3f3f4); cursor: zoom-in; }
.bp-shot-caption { font-size: var(--dsh-content-font-size-secondary, 12px); color: var(--dsw-alias-label-tertiary, #8a8a8a); word-break: break-all; }
.bp-lightbox { position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
  z-index: 4000 !important; display: flex !important; align-items: center !important; justify-content: center !important;
  background: rgba(12,12,14,.78) !important; cursor: zoom-out; }
.bp-lightbox img { max-width: 92vw; max-height: 92vh; border-radius: 12px; background: #fff; box-shadow: 0 24px 64px rgba(0,0,0,.55); }
.bp-lightbox-close { position: absolute; top: 18px; right: 22px; width: 34px; height: 34px; border-radius: 17px;
  border: none; cursor: pointer; font-size: 20px; line-height: 30px; color: #fff; background: rgba(255,255,255,.16); }
`;
      document.head.appendChild(tag);
    };

    const readFrame = (block) => {
      const content = Array.isArray(block?.content) ? block.content : [];
      const text = content.filter((part) => part && part.type === 'text').map((part) => part.text ?? '').join('\n');
      const marker = /\[shot:([^\]|]+)(?:\|([^\]]*))?\]\s*([^\n]*)/.exec(text);
      const plain = text.replace(/\[shot:[^\]]*\]/g, '').trim();
      return { id: marker ? marker[1] : null, caption: marker && marker[3] ? marker[3].trim() : (plain.split('\n')[0] ?? '') };
    };

    function ShotRow(props) {
      ensureStyles();
      const block = props?.block;
      const { id, caption } = readFrame(block);
      const [expanded, setExpanded] = React.useState(false);
      const [open, setOpen] = React.useState(false);

      React.useEffect(() => {
        if (!open) return undefined;
        const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
      }, [open]);

      const name = block?.name ?? 'screen_capture';
      const title = TITLES[name] ?? 'Screen capture';
      const args = block?.args && typeof block.args === 'object' ? block.args : {};
      const fromArgs = name === 'screen_capture_region'
        ? (args.width && args.height ? `${args.width}×${args.height} at ${args.x},${args.y}` : '')
        : name === 'screen_capture_window'
          ? (args.title ?? (args.pid ? `pid ${args.pid}` : ''))
          : '';

      // Header: the "tab" of the row, identical to Browser's tool rows.
      const header = h('div', {
        className: 'bp-tool-row',
        onClick: () => setExpanded((value) => !value),
      },
        h('span', { className: 'bp-tool-leading' },
          expanded && ChevronUp
            ? h(ChevronUp, { size: 14 })
            : ToolIcon
              ? h(ToolIcon, { size: 14 })
              : h('span', null, '>_'),
        ),
        h('span', { className: 'bp-tool-name' }, 'Tool'),
        h('span', { className: 'bp-tool-sep' }),
        h('span', { className: 'bp-tool-args' }, caption || fromArgs || title),
      );

      const inputText = (() => {
        if (!block?.args || typeof block.args !== 'object') return null;
        const clean = {};
        for (const key of ['pid', 'title', 'id', 'x', 'y', 'width', 'height', 'monitor', 'out']) {
          if (block.args[key] !== undefined) clean[key] = block.args[key];
        }
        return Object.keys(clean).length ? JSON.stringify(clean, null, 2) : null;
      })();

      const body = expanded
        ? h('div', { className: 'bp-body-wrap' },
            h('div', { className: 'bp-io-card' },
              inputText
                ? h('div', { className: 'bp-io-section' },
                    h('span', { className: 'bp-io-label' }, 'IN'),
                    h('span', { className: 'bp-io-text' }, inputText))
                : null,
              h('div', { className: 'bp-io-section' },
                h('span', { className: 'bp-io-label' }, 'OUT'),
                h('span', { className: 'bp-io-text' },
                  (Array.isArray(block?.content) ? block.content : [])
                    .filter((part) => part?.type === 'text')
                    .map((part) => String(part.text ?? '').replace(/\[shot:[^\]]*\]/g, '').trim())
                    .join('\n') || '—')),
            ))
        : null;

      if (!id) return h('div', null, header, body);

      const full = `${base}/shot/${id}`;
      const lightbox = open && createPortal
        ? createPortal(
            h('div', { className: 'bp-lightbox', onClick: () => setOpen(false) },
              h('img', { src: full, alt: 'screenshot' }),
              h('button', {
                className: 'bp-lightbox-close',
                onClick: (event) => { event.stopPropagation(); setOpen(false); },
                title: 'close',
              }, '×'),
            ),
            document.body,
          )
        : null;

      return h('div', null,
        header,
        body,
        h('div', { className: 'bp-shot-indent' },
          h('div', { className: 'bp-shot-wrap' },
            h('div', { className: 'bp-shot-box' },
              h('img', {
                className: 'bp-shot',
                src: full,
                alt: caption || title,
                onClick: () => setOpen(true),
              }),
            ),
            caption ? h('span', { className: 'bp-shot-caption' }, caption) : null,
          ),
        ),
        lightbox,
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        for (const key of ['screen_capture_monitor', 'screen_capture_region', 'screen_capture_window']) {
          try {
            ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
              name: 'tool.call.toolview',
              key,
            }, ShotRow));
          } catch (error) {
            console.warn('hsb-screenshoot: toolview registration failed', error);
          }
        }
      },
    };
  },
});
