window.__ModuleLoader__.load({
  id: '@machine202502/dsh-screenshoot',
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

    /** Language choices offered by the settings form; `auto` follows the app locale. */
    const LANGUAGES = ['ru', 'en', 'zh', 'auto'];
    const DEFAULT_LANGUAGE = 'ru';

    const STRINGS = {
      ru: {
        tool: 'Инструмент',
        in: 'ВХОД',
        out: 'ВЫХОД',
        close: 'Закрыть',
        screenshot: 'Снимок экрана',
        regionAt: '{width}×{height} в {x},{y}',
        pid: 'pid {pid}',
        settingsTitle: 'Язык',
        settingsHint: 'Авто — по языку приложения',
        save: 'Сохранить',
        saved: 'Сохранено',
        saveFailed: 'Не удалось сохранить',
        loading: 'Загрузка…',
        auto: 'Авто',
        tools: {
          screen_capture_monitor: 'Монитор',
          screen_capture_region: 'Область экрана',
          screen_capture_window: 'Окно',
          capture: 'Снимок экрана',
        },
      },
      en: {
        tool: 'Tool',
        in: 'IN',
        out: 'OUT',
        close: 'Close',
        screenshot: 'Screenshot',
        regionAt: '{width}×{height} at {x},{y}',
        pid: 'pid {pid}',
        settingsTitle: 'Language',
        settingsHint: 'Auto follows the application language',
        save: 'Save',
        saved: 'Saved',
        saveFailed: 'Could not save',
        loading: 'Loading…',
        auto: 'Auto',
        tools: {
          screen_capture_monitor: 'Screen monitor',
          screen_capture_region: 'Screen region',
          screen_capture_window: 'Screen window',
          capture: 'Screen capture',
        },
      },
      zh: {
        tool: '工具',
        in: '输入',
        out: '输出',
        close: '关闭',
        screenshot: '截图',
        regionAt: '{width}×{height}，位于 {x},{y}',
        pid: '进程 {pid}',
        settingsTitle: '语言',
        settingsHint: '自动 — 跟随应用程序语言',
        save: '保存',
        saved: '已保存',
        saveFailed: '保存失败',
        loading: '加载中…',
        auto: '自动',
        tools: {
          screen_capture_monitor: '显示器',
          screen_capture_region: '屏幕区域',
          screen_capture_window: '窗口',
          capture: '屏幕截图',
        },
      },
    };

    /** Replace `{name}` placeholders in a localized template. */
    const fill = (template, values) => String(template)
      .replace(/\{(\w+)\}/g, (match, key) => (values[key] === undefined ? match : String(values[key])));

    /** The language an unset preference follows: the application's own locale. */
    const detectLanguage = () => {
      const raw = String(
        (typeof document === 'undefined' ? '' : document.documentElement?.lang)
        || (typeof navigator === 'undefined' ? '' : navigator.language)
        || 'en',
      ).toLowerCase();
      if (raw.startsWith('ru')) return 'ru';
      if (raw.startsWith('zh')) return 'zh';
      return 'en';
    };

    /**
     * Saved `language` wins when it is a concrete language; `auto` follows the
     * application locale; no setting at all falls back to the plugin default.
     */
    const resolveLanguage = (settings) => {
      const preference = settings?.language;
      if (preference === 'ru' || preference === 'en' || preference === 'zh') return preference;
      if (preference === 'auto') return detectLanguage();
      return DEFAULT_LANGUAGE;
    };

    /** The current interface language; rows and the settings form share it. */
    let uiLanguage = DEFAULT_LANGUAGE;
    const languageListeners = new Set();
    const getLanguage = () => uiLanguage;
    const setLanguage = (language) => {
      if (!STRINGS[language] || language === uiLanguage) return;
      uiLanguage = language;
      for (const listener of languageListeners) listener();
    };
    const subscribeLanguage = (listener) => {
      languageListeners.add(listener);
      return () => languageListeners.delete(listener);
    };
    const useLanguage = () => React.useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage);

    /** Read the stored preference from the plugin bridge; ru until it answers. */
    const loadLanguage = async () => {
      try {
        const response = await fetch(`${base}/state`, { cache: 'no-store' });
        if (!response.ok) return uiLanguage;
        const body = await response.json();
        const language = resolveLanguage(body?.settings);
        setLanguage(language);
        return language;
      } catch {
        return uiLanguage;
      }
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
.ss-set { display: flex; flex-direction: column; gap: 14px; max-width: 520px; padding: 4px 0 8px; font-size: 13px; }
.ss-set-row { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
.ss-set-hint { margin-top: 2px; font-size: 12px; color: var(--dsw-alias-label-tertiary, #8a8a8a); }
.ss-set-select { height: 32px; padding: 0 10px; border: 1px solid var(--dsw-alias-border-l1, #dcdcdc); border-radius: 10px;
  background: var(--dsw-alias-bg-base, #fff); color: inherit; font: inherit; outline: none; }
.ss-set-actions { display: flex; align-items: center; gap: 12px; }
.ss-set-save { height: 34px; padding: 0 16px; border: none; border-radius: 10px;
  background: var(--dsw-alias-label-primary, #1f1f1f); color: var(--dsw-alias-bg-base, #fff); font: inherit; cursor: pointer; }
.ss-set-save:disabled { opacity: .45; cursor: default; }
.ss-set-status { font-size: 12px; color: var(--dsw-alias-label-tertiary, #8a8a8a); }
.ss-set-status--error { color: #c0392b; }
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
      const language = useLanguage();
      const strings = STRINGS[language];
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
      const title = strings.tools[name] ?? strings.tools.capture;
      const args = block?.args && typeof block.args === 'object' ? block.args : {};
      const fromArgs = name === 'screen_capture_region'
        ? (args.width && args.height
            ? fill(strings.regionAt, { width: args.width, height: args.height, x: args.x, y: args.y })
            : '')
        : name === 'screen_capture_window'
          ? (args.title ?? (args.pid ? fill(strings.pid, { pid: args.pid }) : ''))
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
        h('span', { className: 'bp-tool-name' }, strings.tool),
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
                    h('span', { className: 'bp-io-label' }, strings.in),
                    h('span', { className: 'bp-io-text' }, inputText))
                : null,
              h('div', { className: 'bp-io-section' },
                h('span', { className: 'bp-io-label' }, strings.out),
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
              h('img', { src: full, alt: strings.screenshot }),
              h('button', {
                className: 'bp-lightbox-close',
                onClick: (event) => { event.stopPropagation(); setOpen(false); },
                title: strings.close,
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

    /** The `plugins.row.config` form: one language select and a save action. */
    function ScreenshootSettings() {
      ensureStyles();
      const ui = useLanguage();
      const strings = STRINGS[ui];
      const [state, setState] = React.useState({ status: 'loading', values: {}, defaults: {} });
      const [saving, setSaving] = React.useState(false);
      const [notice, setNotice] = React.useState({ text: '', error: false });

      React.useEffect(() => {
        let alive = true;
        fetch(`${base}/settings`, { cache: 'no-store' })
          .then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
          })
          .then((body) => {
            if (!alive) return;
            setState({ status: 'ready', values: body.values ?? {}, defaults: body.defaults ?? {} });
            setLanguage(resolveLanguage(body.values));
          })
          .catch(() => {
            if (alive) setState({ status: 'error', values: {}, defaults: {} });
          });
        return () => {
          alive = false;
        };
      }, []);

      const stored = state.values.language ?? state.defaults.language ?? DEFAULT_LANGUAGE;
      const preference = LANGUAGES.includes(stored) ? stored : DEFAULT_LANGUAGE;

      const save = async () => {
        setSaving(true);
        setNotice({ text: '', error: false });
        try {
          const response = await fetch(`${base}/settings`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ language: preference }),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const body = await response.json();
          const values = body.values ?? {};
          const next = resolveLanguage(values);
          setState({ status: 'ready', values, defaults: body.defaults ?? {} });
          setLanguage(next);
          setNotice({ text: STRINGS[next].saved, error: false });
        } catch {
          setNotice({ text: strings.saveFailed, error: true });
        } finally {
          setSaving(false);
        }
      };

      if (state.status === 'loading') {
        return h('div', { className: 'ss-set' }, h('span', { className: 'ss-set-hint' }, strings.loading));
      }

      const options = [
        ['ru', 'Русский'],
        ['en', 'English'],
        ['zh', '中文'],
        ['auto', strings.auto],
      ];

      return h('div', { className: 'ss-set' },
        h('div', { className: 'ss-set-row' },
          h('div', null,
            h('div', null, strings.settingsTitle),
            h('div', { className: 'ss-set-hint' }, strings.settingsHint),
          ),
          h('select', {
            className: 'ss-set-select',
            value: preference,
            onChange: (event) => setState((previous) => ({
              ...previous,
              values: { ...previous.values, language: event.target.value },
            })),
          }, options.map(([value, text]) => h('option', { key: value, value }, text))),
        ),
        h('div', { className: 'ss-set-actions' },
          h('button', { type: 'button', className: 'ss-set-save', onClick: save, disabled: saving === true },
            saving ? '…' : strings.save),
          notice.text ? h('span', { className: `ss-set-status${notice.error ? ' ss-set-status--error' : ''}` }, notice.text) : null,
        ),
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        void loadLanguage();
        for (const key of ['screen_capture_monitor', 'screen_capture_region', 'screen_capture_window']) {
          try {
            ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
              name: 'tool.call.toolview',
              key,
            }, ShotRow));
          } catch (error) {
            console.warn('dsh-screenshoot: toolview registration failed', error);
          }
        }

        try {
          ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
            name: 'plugins.row.config',
            key: 'dsh-screenshoot#screenshoot',
          }, () => h(ScreenshootSettings)));
        } catch (error) {
          console.warn('dsh-screenshoot: settings form registration failed', error);
        }
      },
    };
  },
});
