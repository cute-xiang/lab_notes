'use strict';

const obsidian = require('obsidian');
const {
  Plugin,
  PluginSettingTab,
  Setting,
  Modal,
  Notice,
  requestUrl,
  TextAreaComponent,
  MarkdownView,
} = obsidian;

/**
 * 常见 OpenAI 兼容服务商预设。
 * 注意：接口地址可能调整，请以服务商官方文档为准，可随时在设置中手动修改。
 */
const PROVIDER_PRESETS = {
  openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  anthropic: {
    name: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-5-5',
    api: 'anthropic',
  },
  grok: { name: 'xAI Grok', baseUrl: 'https://api.x.ai/v1', model: 'grok-4.6' },
  deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  qwen: { name: '通义千问 Qwen', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  kimi: { name: 'Kimi 月之暗面', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  zhipu: { name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  ollama: { name: 'Ollama 本地', baseUrl: 'http://localhost:11434/v1', model: 'llama3' },
  custom: { name: '自定义 Custom', baseUrl: '', model: '' },
};

/** 内置的选中文本处理动作，{{text}} 会被替换为选中内容 */
const BUILTIN_ACTIONS = [
  { id: 'summarize', name: '总结', prompt: '请用简洁的中文总结以下内容，保留关键信息：\n\n{{text}}' },
  { id: 'translate', name: '翻译', prompt: '将以下内容在中英文之间互译（中文译为英文，英文译为中文），只输出译文：\n\n{{text}}' },
  { id: 'polish', name: '润色', prompt: '润色以下文本，使其更清晰、流畅、专业，保持原意与语言，只输出润色后的文本：\n\n{{text}}' },
  { id: 'explain', name: '解释', prompt: '用通俗易懂的语言解释以下内容：\n\n{{text}}' },
];

const DEFAULT_SETTINGS = {
  provider: 'openai',
  apiBaseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  temperature: 0.7,
  maxTokens: 2048,
  timeoutMs: 60000,
  systemPrompt: '你是一个专业的写作与阅读助手，帮助用户处理 Markdown 笔记。回答要简洁、准确、有条理。',
  // 光标停留自动续写（幽灵文本）
  ghostEnabled: true,
  ghostDelayMs: 10000,
  ghostAcceptKey: 'Space',
};

class AIAssistantPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new AIAssistantSettingTab(this.app, this));

    // 左侧功能区图标：快速提问（多级图标兜底，兼容不同 Obsidian 版本）
    const openAsk = () => {
      new AskModal(this.app, async (question) => {
        await this.askAI(question);
      }).open();
    };
    for (const iconName of ['sparkles', 'bot', 'message-circle', 'wand']) {
      try {
        this.addRibbonIcon(iconName, 'AI 助手：向 AI 提问', openAsk);
        break;
      } catch (e) {
        // 该图标名在当前版本不可用，尝试下一个
      }
    }

    // 命令面板：内置文本处理动作
    for (const action of BUILTIN_ACTIONS) {
      this.addCommand({
        id: `action-${action.id}`,
        name: `AI: ${action.name}选中内容`,
        editorCallback: (editor) => this.runOnSelection(editor, action.prompt, action.name),
      });
    }

    // 命令面板：续写
    this.addCommand({
      id: 'continue-writing',
      name: 'AI: 续写（基于光标前内容）',
      editorCallback: (editor) => this.continueWriting(editor),
    });

    // 命令面板：自定义提示词
    this.addCommand({
      id: 'custom-prompt',
      name: 'AI: 自定义提示词处理选中内容',
      editorCallback: (editor) => {
        new PromptModal(this.app, async (prompt) => {
          await this.runOnSelection(editor, prompt, '自定义提示词');
        }).open();
      },
    });

    // 命令面板：AI 问答
    this.addCommand({
      id: 'ask-ai',
      name: 'AI: 向 AI 提问',
      callback: () => {
        new AskModal(this.app, async (question) => {
          await this.askAI(question);
        }).open();
      },
    });

    // 编辑器右键菜单：续写始终可用；其余动作仅在有选中文本时出现
    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu, editor) => {
        menu.addSeparator();
        // 续写基于光标前内容，不需要选中文本，放在最前面
        menu.addItem((item) =>
          item
            .setTitle('AI: 续写')
            .setIcon('sparkles')
            .onClick(() => this.continueWriting(editor))
        );
        const selected = editor.getSelection();
        if (!selected || !selected.trim()) return;
        for (const action of BUILTIN_ACTIONS) {
          menu.addItem((item) =>
            item
              .setTitle(`AI: ${action.name}`)
              .setIcon('sparkles')
              .onClick(() => this.runOnSelection(editor, action.prompt, action.name))
          );
        }
        menu.addItem((item) =>
          item
            .setTitle('AI: 自定义提示词...')
            .setIcon('pencil')
            .onClick(() => {
              new PromptModal(this.app, async (prompt) => {
                await this.runOnSelection(editor, prompt, '自定义提示词');
              }).open();
            })
        );
      })
    );

    // 命令面板：诊断自动续写（把每一步状态写入诊断文件）
    this.addCommand({
      id: 'diagnose-ghost',
      name: 'AI: 诊断自动续写（生成诊断文件）',
      callback: async () => {
        let cmStatus = '未知';
        try {
          require('@codemirror/state');
          require('@codemirror/view');
          cmStatus = '可加载';
        } catch (e) {
          cmStatus = '加载失败：' + (e && e.message ? e.message : String(e));
        }
        const mv = this.app.workspace.getActiveViewOfType(MarkdownView);
        let editorInfo = '无活动笔记编辑器（请先打开一篇笔记并进入编辑模式）';
        if (mv) {
          const cmView = mv.editor && mv.editor.cm;
          editorInfo = cmView
            ? `CM 编辑器存在（focus=${cmView.hasFocus}，文档 ${cmView.state.doc.length} 字）`
            : '有笔记视图但未找到 CM 编辑器实例';
        }
        this.recordGhostDiag(
          `【手动诊断】CM模块=${cmStatus}；${editorInfo}；开关=${this.settings.ghostEnabled}；延迟=${this.settings.ghostDelayMs}ms；最近状态=${this.ghostDiag || '无'}`
        );
        await this.flushGhostDiag();
        new Notice('诊断已写入 ghost-diag.txt：' + (this.ghostDiag || '无'), 12000);
      },
    });

    // 命令面板：立即测试幽灵续写（无需等待 10 秒）
    this.addCommand({
      id: 'test-ghost',
      name: 'AI: 立即测试幽灵续写（不用等10秒）',
      editorCallback: () => {
        const mv = this.app.workspace.getActiveViewOfType(MarkdownView);
        const cmView = mv && mv.editor && mv.editor.cm;
        const trigger = cmView && this._ghostTriggers && this._ghostTriggers.get(cmView);
        if (typeof trigger === 'function') {
          new Notice('已发起幽灵续写测试，稍后查看光标处');
          trigger();
        } else {
          new Notice('自动续写扩展未初始化：请重启 Obsidian 并确认设置里已开启');
        }
      },
    });

    // 注册「光标停留自动续写」幽灵文本编辑器扩展
    this.registerGhostCompletion();
  }

  /** 记录自动续写诊断信息（内存 + 文件），便于排查功能为何未生效 */
  recordGhostDiag(msg) {
    this.ghostDiag = msg;
    if (!this._ghostLogs) this._ghostLogs = [];
    this._ghostLogs.push(`[${new Date().toLocaleTimeString('zh-CN')}] ${msg}`);
    if (this._ghostLogs.length > 100) this._ghostLogs.shift();
    // 仅在用户主动执行「诊断」命令时写文件，避免日常使用往 vault 里产生垃圾文件
  }

  async flushGhostDiag() {
    try {
      const text = (this._ghostLogs || []).join('\n') + '\n';
      const path = `.obsidian/plugins/${this.manifest.id}/ghost-diag.txt`;
      await this.app.vault.adapter.write(path, text);
    } catch (e) {
      // 诊断文件写入失败不影响功能
    }
  }

  /** 设置变更提示：轮询机制会自动采用新参数，这里只记录一条诊断日志 */
  rescheduleAllGhost() {
    this.recordGhostDiag(
      `设置已更新：开关=${this.settings.ghostEnabled}，等待=${this.settings.ghostDelayMs}ms；下一轮检测立即采用新值`
    );
  }

  /**
   * 注册光标停留自动续写：光标静止 N 秒后，把续写内容以半透明幽灵文本显示在光标处，
   * 按自定义按键（默认空格）接受、Esc 放弃。基于 CodeMirror 6 编辑器扩展实现。
   */
  registerGhostCompletion() {
    let stateMod = null;
    let viewMod = null;
    try {
      stateMod = require('@codemirror/state');
      viewMod = require('@codemirror/view');
    } catch (e) {
      const reason = 'CodeMirror 模块加载失败：' + (e && e.message ? e.message : String(e));
      console.warn('AI 助手：' + reason, e);
      this.recordGhostDiag(reason);
      return;
    }

    const plugin = this;
    plugin.recordGhostDiag('CodeMirror 模块加载成功，正在注册编辑器扩展');
    const { StateField, StateEffect, EditorSelection, Prec } = stateMod;
    const { ViewPlugin, Decoration, WidgetType, keymap, EditorView } = viewMod;

    const setGhost = StateEffect.define();
    const clearGhost = StateEffect.define();

    // 半透明幽灵文本控件
    class GhostWidget extends WidgetType {
      constructor(text) {
        super();
        this.text = text;
      }
      eq(other) {
        return other.text === this.text;
      }
      toDOM() {
        const span = document.createElement('span');
        span.className = 'ai-ghost-text';
        span.textContent = this.text;
        return span;
      }
      ignoreEvent() {
        return true;
      }
    }

    // 保存当前幽灵文本 { text, pos }
    const ghostField = StateField.define({
      create() {
        return null;
      },
      update(value, tr) {
        for (const effect of tr.effects) {
          if (effect.is(setGhost)) return effect.value;
          if (effect.is(clearGhost)) return null;
        }
        if (tr.docChanged || tr.selectionSet) return null;
        return value;
      },
      provide: (field) => EditorView.decorations.compute([field], (state) => {
        const ghost = state.field(field);
        if (!ghost || !ghost.text) return Decoration.none;
        return Decoration.set([
          Decoration.widget({ widget: new GhostWidget(ghost.text), side: 1 }).range(ghost.pos),
        ]);
      }),
    });

    // 光标停留检测：每 500ms 轮询一次，用「当前最新」的设置值判断静止时长。
    // 这样在设置里改等待时间后，下一轮轮询立即采用新值，不依赖任何 Obsidian 内部字段。
    const idleTrigger = ViewPlugin.fromClass(class {
      constructor(view) {
        this.view = view;
        this.seq = 0;
        this.lastActivity = Date.now();
        this.armedAt = null;   // 已为哪一轮静止触发过，避免同一轮重复请求
        this.pending = false;  // 是否正在请求中
        // 暴露给诊断命令，按编辑器实例索引，避免多篇笔记时串台
        if (!plugin._ghostTriggers) plugin._ghostTriggers = new WeakMap();
        plugin._ghostTriggers.set(view, () => this.trigger(true));
        this.pollTimer = setInterval(() => this.poll(), 500);
      }
      update(update) {
        // 注意：不要把 focusChanged 当作"用户操作"，否则点一下界面就会无限重排
        if (update.docChanged || update.selectionSet) {
          this.seq++;
          this.lastActivity = Date.now();
          if (this.view.state.field(ghostField)) {
            this.view.dispatch({ effects: clearGhost.of(null) });
          }
        }
      }
      poll() {
        if (!plugin.settings.ghostEnabled || this.pending) return;
        if (!this.view.dom || !this.view.dom.isConnected) return;
        // 已有幽灵文本在显示，不再发起新请求
        if (this.view.state.field(ghostField)) return;
        // 同一轮静止只触发一次
        if (this.armedAt === this.lastActivity) return;
        const delay = Number(plugin.settings.ghostDelayMs) || 10000;
        if (Date.now() - this.lastActivity < delay) return;
        this.armedAt = this.lastActivity;
        this.trigger(false);
      }
      async trigger(force) {
        if (!plugin.settings.ghostEnabled) {
          plugin.recordGhostDiag('中止：自动续写开关已关闭');
          return;
        }
        const view = this.view;
        // 不再要求 view.hasFocus：用户切到别的窗口再回来时焦点常不在编辑器上，
        // 旧逻辑会直接放弃，导致"看起来没生效"。
        if (!view.dom || !view.dom.isConnected) {
          plugin.recordGhostDiag('中止：编辑器未显示在界面中（DOM 未连接）');
          return;
        }
        const pos = view.state.selection.main.head;
        const before = view.state.doc.sliceString(0, pos);
        if (!before.trim()) {
          plugin.recordGhostDiag('中止：光标前没有文本内容');
          return;
        }
        const seq = this.seq;
        const context = before.slice(-4000);
        const prompt = `请根据以下上下文续写，保持语言、风格和语气一致，只输出续写内容：\n\n${context}`;
        plugin.recordGhostDiag(`发起续写请求（光标位置 ${pos}，上下文 ${before.length} 字）`);
        this.pending = true;
        let result;
        try {
          result = await plugin.callLLM(plugin.buildMessages(prompt), { notice: false });
        } catch (e) {
          plugin.recordGhostDiag('续写请求失败：' + (e && e.message ? e.message : String(e)));
          return;
        } finally {
          this.pending = false;
        }
        if (!result || !String(result).trim()) {
          plugin.recordGhostDiag('续写请求返回空内容');
          return;
        }
        // 请求期间用户已移动光标或有新输入，则丢弃本次结果（手动测试时跳过）
        if (!force && (seq !== this.seq || view.state.selection.main.head !== pos)) {
          plugin.recordGhostDiag('结果已丢弃：等待期间光标移动或有新输入');
          return;
        }
        try {
          view.dispatch({ effects: setGhost.of({ text: String(result).trim(), pos }) });
          plugin.recordGhostDiag(`幽灵文本已显示（${String(result).length} 字），按 ${plugin.settings.ghostAcceptKey || 'Space'} 接受 / Esc 放弃`);
        } catch (e) {
          plugin.recordGhostDiag('显示幽灵文本失败：' + (e && e.message ? e.message : String(e)));
        }
      }
      destroy() {
        if (this.pollTimer) clearInterval(this.pollTimer);
      }
    });

    // 接受键可自定义：把按键描述（如 Space / Tab / Ctrl+Enter）解析为修饰键 + 主键
    const KEY_ALIASES = {
      space: ' ', spacebar: ' ', tab: 'Tab', enter: 'Enter', return: 'Enter',
      esc: 'Escape', escape: 'Escape', backspace: 'Backspace',
      delete: 'Delete', arrowup: 'ArrowUp', arrowdown: 'ArrowDown',
      arrowleft: 'ArrowLeft', arrowright: 'ArrowRight',
    };
    const matchesAcceptKey = (event, spec) => {
      const parts = String(spec || '').trim().split('+').map((p) => p.trim().toLowerCase()).filter(Boolean);
      if (!parts.length) return false;
      const key = parts.pop();
      const wantCtrl = parts.some((p) => ['ctrl', 'control', 'cmd', 'meta'].includes(p));
      const wantAlt = parts.some((p) => ['alt', 'option'].includes(p));
      const wantShift = parts.some((p) => p === 'shift');
      if (wantCtrl !== (event.ctrlKey || event.metaKey)) return false;
      if (wantAlt !== event.altKey) return false;
      if (wantShift !== event.shiftKey) return false;
      const expected = KEY_ALIASES[key] || key;
      if (expected.length === 1) return event.key.toLowerCase() === expected.toLowerCase();
      return event.key === expected;
    };

    // 高优先级按键：自定义键接受、Esc 放弃。
    // 用 domEventHandlers 而非固定 keymap，这样任意键/组合键都能在设置里即时生效。
    const ghostKeys = Prec.highest(EditorView.domEventHandlers({
      keydown: (event, view) => {
        const ghost = view.state.field(ghostField);
        if (!ghost || !ghost.text) return false;
        // 中文输入法组字期间不拦截，否则选字空格会被误判为“接受”
        if (event.isComposing || event.keyCode === 229) return false;
        if (event.key === 'Escape') {
          event.preventDefault();
          view.dispatch({ effects: clearGhost.of(null) });
          return true;
        }
        if (!matchesAcceptKey(event, plugin.settings.ghostAcceptKey)) return false;
        event.preventDefault();
        event.stopPropagation();
        view.dispatch({
          changes: { from: ghost.pos, insert: ghost.text },
          selection: EditorSelection.cursor(ghost.pos + ghost.text.length),
          effects: clearGhost.of(null),
        });
        return true;
      },
    }));

    // 保存扩展引用，供设置变更时遍历所有编辑器重新计时
    plugin._ghostIdleTrigger = idleTrigger;
    this.registerEditorExtension([ghostField, idleTrigger, ghostKeys]);
    plugin.recordGhostDiag(
      '编辑器扩展注册完成，光标静止 ' + (Number(plugin.settings.ghostDelayMs) || 10000) + 'ms 后自动续写'
    );
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  /** 当前配置是否使用 Anthropic 原生 Messages API（与 OpenAI 格式不同） */
  isAnthropicApi() {
    const s = this.settings;
    if (s.provider === 'anthropic') return true;
    return /anthropic\.com/i.test((s.apiBaseUrl || '').trim());
  }

  /** 调用大模型接口：默认走 OpenAI 兼容的 /chat/completions，Anthropic 走 /messages */
  async callLLM(messages, options = {}) {
    const notice = options.notice !== false;
    const s = this.settings;

    if (!s.apiKey || !s.apiKey.trim()) {
      if (notice) new Notice('请先在插件设置中填写 API Key');
      throw new Error('API Key 未配置');
    }
    if (!s.apiBaseUrl || !s.apiBaseUrl.trim()) {
      if (notice) new Notice('请先在插件设置中填写 API 地址');
      throw new Error('API 地址未配置');
    }

    const isAnthropic = this.isAnthropicApi();
    const base = this.normalizeBaseUrl(s.apiBaseUrl);
    const url = isAnthropic ? `${base}/messages` : `${base}/chat/completions`;

    let body;
    let headers;
    if (isAnthropic) {
      // Anthropic Messages API：system 是顶层字段，消息里只能有 user/assistant
      const systemText = messages
        .filter((m) => m && m.role === 'system')
        .map((m) => (typeof m.content === 'string' ? m.content : ''))
        .filter(Boolean)
        .join('\n\n');
      body = {
        model: s.model,
        max_tokens: s.maxTokens,
        // Anthropic 的温度上限为 1，超出会被 400 拒绝
        temperature: Math.max(0, Math.min(1, Number(s.temperature) || 0)),
        messages: messages
          .filter((m) => m && m.role !== 'system')
          .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
      };
      if (systemText) body.system = systemText;
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': s.apiKey,
        'anthropic-version': '2023-06-01',
      };
    } else {
      body = {
        model: s.model,
        messages: messages,
        temperature: s.temperature,
        max_tokens: s.maxTokens,
        stream: false,
      };
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${s.apiKey}`,
      };
    }

    // 对 429 / 5xx 等瞬时故障自动重试，避免偶发 502 直接失败
    const maxRetries = 2;
    const retryDelayMs = 1500;
    const statusHints = {
      400: '请求参数有误',
      401: 'API Key 无效',
      403: '没有访问该模型的权限',
      404: 'API 地址或模型名不正确',
      429: '请求过于频繁或额度不足',
      500: '服务端内部错误',
      502: '网关暂时无法连接上游',
      503: '服务暂时不可用',
      504: '网关连接上游超时',
    };

    let response = null;
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let timer;
      const timeoutPromise = new Promise((resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`请求超时（${Math.round(s.timeoutMs / 1000)} 秒）`)),
          s.timeoutMs
        );
      });
      const requestPromise = requestUrl({
        url: url,
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
        throw: false,
      }).then(
        (res) => res,
        (err) => ({ __error: err })
      );

      try {
        response = await Promise.race([requestPromise, timeoutPromise]);
        lastError = response && response.__error ? response.__error : null;
      } catch (e) {
        lastError = e;
      } finally {
        clearTimeout(timer);
      }

      // 网络错误（超时除外）也重试
      if (lastError) {
        if (lastError.message && lastError.message.includes('超时')) break;
        if (attempt === maxRetries) break;
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * (attempt + 1)));
        continue;
      }

      const status = response.status;
      const retryable = status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
      if (!retryable || attempt === maxRetries) break;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * (attempt + 1)));
    }

    if (lastError) {
      if (notice) new Notice(`AI 请求失败：${lastError.message}`);
      throw lastError;
    }

    if (response.status < 200 || response.status >= 300) {
      let detail = '';
      try {
        const parsed = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
        detail = (parsed && parsed.error && parsed.error.message) || parsed.message || JSON.stringify(parsed);
      } catch (e) {
        detail = String(response.body || '').slice(0, 300);
      }
      if (!detail) detail = '(响应体为空)';
      const hint = statusHints[response.status] ? `，${statusHints[response.status]}` : '';
      const msg = `API 返回 ${response.status}${hint}：${detail}`;
      if (notice) new Notice(msg);
      throw new Error(msg);
    }

    // 兼容标准 OpenAI 结构、中转站包装结构，以及被强制返回的 SSE 流
    // 注意：Obsidian 的 requestUrl 对 application/json 响应可能只填充 json 字段而 body 为空，
    // 因此 raw 必须始终为字符串，且优先使用已解析的 response.json。
    let raw = '';
    if (typeof response.body === 'string') {
      raw = response.body;
    } else if (response.body != null) {
      try {
        raw = JSON.stringify(response.body);
      } catch (e) {
        raw = String(response.body);
      }
    }
    if (!raw && response.json != null) {
      try {
        raw = JSON.stringify(response.json);
      } catch (e) {
        // 忽略循环引用等异常
      }
    }

    let data = null;
    if (response.json && typeof response.json === 'object') {
      data = response.json;
    } else if (raw.trim()) {
      try {
        data = JSON.parse(raw);
      } catch (e) {
        const lines = raw.split(/\r?\n/).filter((line) => line.trim().startsWith('data:'));
        const chunks = [];
        for (const line of lines) {
          const payload = line.replace(/^data:\s*/, '').trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            chunks.push(JSON.parse(payload));
          } catch (inner) {
            // 跳过非 JSON 片段
          }
        }
        for (let i = chunks.length - 1; i >= 0; i--) {
          const c = this.extractContent(chunks[i]);
          if (c) return c;
        }
        const msg = `API 返回的不是 JSON：${raw.slice(0, 300)}`;
        if (notice) new Notice(msg);
        throw new Error(msg);
      }
    }

    const content = this.extractContent(data);
    if (!content) {
      const msg = `未找到回复文本，API 原始返回：${String(raw || '').slice(0, 300)}`;
      if (notice) new Notice(msg);
      throw new Error(msg);
    }
    return content;
  }

  /** 规范化 API 根地址：去掉端点后缀，并补全常见服务商缺失的 /v1 */
  normalizeBaseUrl(raw) {
    let url = (raw || '').trim().replace(/\/+$/, '');
    url = url.replace(/\/chat\/completions$/i, '').replace(/\/messages$/i, '');
    if (/\/v1$/i.test(url)) return url;
    if (/anthropic\.com$/i.test(url)) return url + '/v1';
    if (/dashscope\.aliyuncs\.com$/i.test(url)) {
      return url + '/compatible-mode/v1';
    }
    if (/compatible-mode$/i.test(url)) {
      return url + '/v1';
    }
    if (/api\.x\.ai$/i.test(url)) return url + '/v1';
    return url;
  }

  /** 从多种响应结构中提取文本，兼容中转站与推理模型的字段差异 */
  extractContent(data) {
    if (!data) return null;
    let d = data;
    if (!d.choices && d.data && typeof d.data === 'object') d = d.data;
    if (!d.choices && d.output && typeof d.output === 'object') d = d.output;

    // Anthropic Messages API：content 为 [{ type: 'text', text: '...' }]
    if (Array.isArray(d.content)) {
      const joined = d.content
        .map((part) => (typeof part === 'string' ? part : part && part.text))
        .filter(Boolean)
        .join('');
      if (joined.trim()) return joined.trim();
    }

    if (Array.isArray(d.choices) && d.choices.length) {
      const first = d.choices[0];
      if (first && first.message) {
        let c = first.message.content || first.message.reasoning_content || null;
        if (Array.isArray(c)) {
          c = c.map((part) => (typeof part === 'string' ? part : part && part.text))
            .filter(Boolean).join('');
        }
        if (c) return String(c).trim();
      }
      if (first && first.text) return String(first.text).trim();
      if (first && first.delta && first.delta.content) return String(first.delta.content).trim();
    }
    for (const key of ['content', 'response', 'answer', 'result']) {
      if (typeof d[key] === 'string' && d[key].trim()) return d[key].trim();
    }
    return null;
  }

  buildMessages(prompt) {
    return [
      { role: 'system', content: this.settings.systemPrompt },
      { role: 'user', content: prompt },
    ];
  }

  /** 对选中文本执行动作，结果替换选中内容 */
  async runOnSelection(editor, promptTemplate, label) {
    const selected = editor.getSelection();
    if (!selected || !selected.trim()) {
      new Notice('请先选中要处理的文本');
      return;
    }
    const prompt = promptTemplate.includes('{{text}}')
      ? promptTemplate.replace('{{text}}', selected)
      : `${promptTemplate}\n\n${selected}`;

    new Notice(`AI 正在${label}...`);
    try {
      const result = await this.callLLM(this.buildMessages(prompt));
      editor.replaceSelection(result);
      new Notice('AI 处理完成');
    } catch (e) {
      // 错误提示已在 callLLM 中给出
    }
  }

  /** 续写：基于光标前内容，把结果插入到光标处 */
  async continueWriting(editor) {
    const cursor = editor.getCursor();
    const before = editor.getRange({ line: 0, ch: 0 }, cursor);
    const context = before.slice(-4000);
    if (!context.trim()) {
      new Notice('光标前没有可用于续写的内容');
      return;
    }
    const prompt = `请根据以下上下文续写，保持语言、风格和语气一致，只输出续写内容：\n\n${context}`;
    new Notice('AI 正在续写...');
    try {
      const result = await this.callLLM(this.buildMessages(prompt));
      const sep = /[\s\n]$/.test(before) ? '' : '\n\n';
      editor.replaceRange(sep + result, cursor);
      new Notice('续写完成');
    } catch (e) {
      // 错误提示已在 callLLM 中给出
    }
  }

  /** AI 问答：结果以弹窗展示，可选择插入到当前笔记 */
  async askAI(question) {
    if (!question || !question.trim()) return;
    new Notice('AI 正在思考...');
    try {
      const result = await this.callLLM(this.buildMessages(question));
      new ResultModal(
        this.app,
        question,
        result,
        (text) => {
          const view = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
          if (!view) {
            new Notice('请先打开一篇笔记');
            return;
          }
          const editor = view.editor;
          const cursor = editor.getCursor();
          editor.replaceRange(`\n\n${text}\n`, cursor);
          new Notice('已插入当前笔记');
        }
      ).open();
    } catch (e) {
      // 错误提示已在 callLLM 中给出
    }
  }
}

/** 通用：带输入框和取消/确定按钮的弹窗基类 */
class InputModal extends Modal {
  constructor(app, title, description, placeholder, rows, onSubmit) {
    super(app);
    this.modalTitle = title;
    this.description = description;
    this.placeholder = placeholder;
    this.rows = rows;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: this.modalTitle });
    if (this.description) {
      contentEl.createEl('p', { cls: 'setting-item-description', text: this.description });
    }
    const input = new TextAreaComponent(contentEl);
    input.setPlaceholder(this.placeholder);
    input.inputEl.rows = this.rows;
    input.inputEl.style.width = '100%';
    const buttons = contentEl.createDiv({ cls: 'ai-modal-buttons' });
    buttons.createEl('button', { text: '取消' }).onclick = () => this.close();
    buttons.createEl('button', { text: '发送', cls: 'mod-cta' }).onclick = async () => {
      const value = input.getValue().trim();
      if (!value) return;
      this.close();
      await this.onSubmit(value);
    };
    input.inputEl.focus();
  }

  onClose() {
    this.contentEl.empty();
  }
}

class PromptModal extends InputModal {
  constructor(app, onSubmit) {
    super(
      app,
      '自定义提示词',
      '用 {{text}} 代表选中的文本；若不包含该占位符，选中文本会自动附加到提示词末尾。',
      '例如：请把以下内容改写成条目列表：\n\n{{text}}',
      6,
      onSubmit
    );
  }
}

class AskModal extends InputModal {
  constructor(app, onSubmit) {
    super(app, '向 AI 提问', '', '输入你的问题，例如：帮我制定这篇笔记的复习计划', 4, onSubmit);
  }
}

/** 展示 AI 回答，支持复制与插入笔记 */
class ResultModal extends Modal {
  constructor(app, question, answer, onInsert) {
    super(app);
    this.question = question;
    this.answer = answer;
    this.onInsert = onInsert;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'AI 回答' });
    contentEl.createEl('div', { cls: 'ai-result-question', text: `问：${this.question}` });
    const pre = contentEl.createEl('pre', { cls: 'ai-result-answer' });
    pre.textContent = this.answer;

    const buttons = contentEl.createDiv({ cls: 'ai-modal-buttons' });
    buttons.createEl('button', { text: '复制' }).onclick = async () => {
      try {
        await navigator.clipboard.writeText(this.answer);
        new Notice('已复制到剪贴板');
      } catch (e) {
        new Notice('复制失败，请手动选择文本复制');
      }
    };
    buttons.createEl('button', { text: '插入到笔记', cls: 'mod-cta' }).onclick = () => {
      this.close();
      this.onInsert(this.answer);
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}

/** 中英双语文本：中文 / English */
const bi = (zh, en) => `${zh} / ${en}`;

/** 为设置项写入两行双语说明：第一行中文，第二行英文 */
function setBiDesc(setting, zh, en) {
  setting.setDesc('');
  const el = setting.descEl;
  if (!el) {
    setting.setDesc(`${zh} ｜ ${en}`);
    return setting;
  }
  el.empty();
  el.createDiv({ text: zh });
  el.createDiv({ text: en, cls: 'ai-setting-desc-en' });
  return setting;
}

/** 插件设置面板 */
class AIAssistantSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'AI 助手设置 / DuoAI Assistant Settings' });
    containerEl.createEl('p', {
      cls: 'setting-item-description',
      text: '支持任何 OpenAI 兼容接口，以及 Anthropic Claude、xAI Grok。密钥仅保存在本地 Vault 中。',
    });
    containerEl.createEl('p', {
      cls: 'setting-item-description ai-setting-desc-en',
      text: 'Works with any OpenAI-compatible API, plus Anthropic Claude and xAI Grok. Your API key is stored locally in this vault only.',
    });

    setBiDesc(
      new Setting(containerEl).setName(bi('服务商预设', 'Provider preset')),
      '选择后自动填入 API 地址与模型名，仍可手动修改。',
      'Fills in the base URL and model automatically; you can still edit them.'
    ).addDropdown((dropdown) => {
        for (const [key, preset] of Object.entries(PROVIDER_PRESETS)) {
          dropdown.addOption(key, preset.name);
        }
        dropdown.setValue(this.plugin.settings.provider || 'custom');
        dropdown.onChange(async (value) => {
          const preset = PROVIDER_PRESETS[value];
          if (!preset) return;
          this.plugin.settings.provider = value;
          if (preset.baseUrl) this.plugin.settings.apiBaseUrl = preset.baseUrl;
          if (preset.model) this.plugin.settings.model = preset.model;
          await this.plugin.saveSettings();
          this.display();
        });
      });

    setBiDesc(
      new Setting(containerEl).setName(bi('API 地址', 'API base URL')),
      '接口根地址，不要包含 /chat/completions 或 /messages。例如：https://api.openai.com/v1',
      'Root URL without /chat/completions or /messages, e.g. https://api.openai.com/v1'
    ).addText((text) => {
        text.inputEl.style.width = '100%';
        text.setPlaceholder('https://api.openai.com/v1')
          .setValue(this.plugin.settings.apiBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.apiBaseUrl = value.trim();
            await this.plugin.saveSettings();
          });
      });

    setBiDesc(
      new Setting(containerEl).setName(bi('API Key', 'API key')),
      '鉴权密钥，仅保存在本地。',
      'API key, stored locally only.'
    ).addText((text) => {
        text.inputEl.type = 'password';
        text.inputEl.style.width = '100%';
        text.setPlaceholder('sk-...')
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value.trim();
            await this.plugin.saveSettings();
          });
      });

    setBiDesc(
      new Setting(containerEl).setName(bi('模型名称', 'Model')),
      '例如 gpt-4o-mini、claude-sonnet-5-5、grok-4.6、deepseek-chat。',
      'For example gpt-4o-mini, claude-sonnet-5-5, grok-4.6, deepseek-chat.'
    ).addText((text) => {
        text.setPlaceholder('gpt-4o-mini')
          .setValue(this.plugin.settings.model)
          .onChange(async (value) => {
            this.plugin.settings.model = value.trim();
            await this.plugin.saveSettings();
          });
      });

    setBiDesc(
      new Setting(containerEl).setName(bi('温度', 'Temperature')),
      '数值越低越稳定，越高越有创造性。',
      'Lower is more deterministic, higher is more creative.'
    ).addSlider((slider) => {
        slider.setLimits(0, 2, 0.1)
          .setValue(this.plugin.settings.temperature)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.temperature = value;
            await this.plugin.saveSettings();
          });
      });

    setBiDesc(
      new Setting(containerEl).setName(bi('最大 Token 数', 'Max tokens')),
      '单次回复的最大长度。',
      'Maximum length of a single reply.'
    ).addText((text) => {
        text.setPlaceholder('2048')
          .setValue(String(this.plugin.settings.maxTokens))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            if (!isNaN(n) && n > 0) {
              this.plugin.settings.maxTokens = n;
              await this.plugin.saveSettings();
            }
          });
      });

    setBiDesc(
      new Setting(containerEl).setName(bi('请求超时（毫秒）', 'Request timeout (ms)')),
      '超过该时间未完成则取消请求。',
      'Cancel the request if it takes longer than this.'
    ).addText((text) => {
        text.setPlaceholder('60000')
          .setValue(String(this.plugin.settings.timeoutMs))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            if (!isNaN(n) && n >= 1000) {
              this.plugin.settings.timeoutMs = n;
              await this.plugin.saveSettings();
            }
          });
      });

    let delayText;
    setBiDesc(
      new Setting(containerEl).setName(bi('自动续写等待时间', 'Auto-completion delay')),
      '开关：是否启用光标停留自动续写（启用后在光标处显示半透明建议，按下方设置的按键接受、Esc 放弃）。输入框：光标静止多久后触发，单位毫秒，默认 10000（10 秒），最小 1000。修改后立即生效。',
      'Toggle: enable ghost-text completion when the cursor is idle (use the key configured below to accept, Esc to dismiss). Field: idle delay in milliseconds, default 10000, minimum 1000. Changes apply immediately.'
    ).addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.ghostEnabled !== false)
          .onChange(async (value) => {
            this.plugin.settings.ghostEnabled = value;
            if (delayText) delayText.setDisabled(!value);
            await this.plugin.saveSettings();
            this.plugin.rescheduleAllGhost();
          });
      })
      .addText((text) => {
        delayText = text;
        text.setPlaceholder('10000')
          .setValue(String(this.plugin.settings.ghostDelayMs || 10000))
          .setDisabled(this.plugin.settings.ghostEnabled === false)
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            if (!isNaN(n) && n >= 1000) {
              this.plugin.settings.ghostDelayMs = n;
              await this.plugin.saveSettings();
              this.plugin.rescheduleAllGhost();
            }
          });
      });

    // 接受幽灵文本的按键：预设 + 自定义，改动立即生效（读取设置而非重建扩展）
    const ACCEPT_KEY_PRESETS = ['Space', 'Tab', 'Enter', 'Ctrl+Enter', 'Alt+Enter', 'Shift+Enter'];
    let acceptKeyInput = null;
    const currentAcceptKey = String(this.plugin.settings.ghostAcceptKey || 'Space');
    setBiDesc(
      new Setting(containerEl).setName(bi('接受续写的按键', 'Accept completion key')),
      '幽灵文本出现时按此键插入正文；Esc 始终用于放弃。可选预设，也可填任意键或组合键，如 Ctrl+Enter、Alt+E。',
      'Key that inserts the ghost suggestion; Esc always dismisses it. Pick a preset or enter any key/combination, e.g. Ctrl+Enter or Alt+E.'
    ).addDropdown((dropdown) => {
        dropdown.addOption('Space', bi('空格 (Space)', 'Space'));
        dropdown.addOption('Tab', 'Tab');
        dropdown.addOption('Enter', 'Enter');
        dropdown.addOption('Ctrl+Enter', 'Ctrl+Enter');
        dropdown.addOption('Alt+Enter', 'Alt+Enter');
        dropdown.addOption('Shift+Enter', 'Shift+Enter');
        dropdown.addOption('custom', bi('自定义…', 'Custom...'));
        dropdown.setValue(ACCEPT_KEY_PRESETS.includes(currentAcceptKey) ? currentAcceptKey : 'custom');
        dropdown.onChange(async (value) => {
          if (value === 'custom') {
            if (acceptKeyInput) acceptKeyInput.setDisabled(false);
            return;
          }
          this.plugin.settings.ghostAcceptKey = value;
          if (acceptKeyInput) acceptKeyInput.setValue(value).setDisabled(true);
          await this.plugin.saveSettings();
          this.plugin.rescheduleAllGhost();
        });
      })
      .addText((text) => {
        acceptKeyInput = text;
        text.setPlaceholder('Ctrl+Enter')
          .setValue(currentAcceptKey)
          .setDisabled(ACCEPT_KEY_PRESETS.includes(currentAcceptKey))
          .onChange(async (value) => {
            const key = value.trim();
            if (!key) return;
            this.plugin.settings.ghostAcceptKey = key;
            await this.plugin.saveSettings();
            this.plugin.rescheduleAllGhost();
          });
      });

    setBiDesc(
      new Setting(containerEl).setName(bi('系统提示词', 'System prompt')),
      '设定 AI 的角色与回答风格。',
      'Sets the role and tone of the assistant.'
    ).addTextArea((textarea) => {
        textarea.inputEl.rows = 4;
        textarea.inputEl.style.width = '100%';
        textarea.setValue(this.plugin.settings.systemPrompt)
          .onChange(async (value) => {
            this.plugin.settings.systemPrompt = value;
            await this.plugin.saveSettings();
          });
      });

    setBiDesc(
      new Setting(containerEl).setName(bi('测试连接', 'Test connection')),
      '发送一条简单消息，验证配置是否正确。',
      'Sends a simple message to verify the configuration.'
    ).addButton((button) => {
        button.setButtonText(bi('测试', 'Test'));
        button.onClick(async () => {
          button.setDisabled(true);
          button.setButtonText(bi('测试中...', 'Testing...'));
          try {
            const answer = await this.plugin.callLLM([
              { role: 'user', content: '请只回复：连接成功' },
            ]);
            new Notice(`${bi('连接成功', 'Connected')}：${String(answer == null ? '' : answer).slice(0, 60)}`);
          } catch (e) {
            new Notice(`${bi('连接失败', 'Failed')}：${e.message}`);
          } finally {
            button.setDisabled(false);
            button.setButtonText(bi('测试', 'Test'));
          }
        });
      });
  }
}

module.exports = AIAssistantPlugin;

/* nosourcemap */