/**
 * core/recording/mock-data.ts — Mock 数据
 *
 * M9.0 阶段：UI 全链路用静态数据驱动。真实 partial/final 转写
 * 的接入会在 M9.2 / M9.3 替换这一层（接口保持不变）。
 *
 * @see docs/plans/2026-05-13-long-recording-and-transcript.md
 */

import type {
  DerivativePayload,
  FinalTranscript,
  OutlineItem,
  RecordingDetail,
  RecordingMeta,
  RecordingSpeaker,
  RecordingTemplate,
} from '../../types/recording';

const SPEAKER_CARLIN: RecordingSpeaker = { id: 'S1', label: 'Carlin', color: '#2563eb' };
const SPEAKER_PETER: RecordingSpeaker = { id: 'S2', label: 'Peter', color: '#16a34a' };
const SPEAKER_SEAN: RecordingSpeaker = { id: 'S3', label: 'Sean', color: '#d97706' };
const SPEAKER_PATRICK: RecordingSpeaker = { id: 'S4', label: 'Patrick', color: '#9333ea' };

const SPEAKER_PALETTE: RecordingSpeaker[] = [
  SPEAKER_CARLIN,
  SPEAKER_PETER,
  SPEAKER_SEAN,
  SPEAKER_PATRICK,
];

// ---- recording 1: 产品交付决策 ----------------------------------------------

const OUTLINE_1: OutlineItem[] = [
  { id: 'o1', title: '欢迎与议程', start_ms: 0 },
  { id: 'o2', title: 'Q1 优先事项与功能范围', start_ms: 4 * 60_000 + 30_000 },
  { id: 'o3', title: 'AI 路线图（语音克隆）', start_ms: 11 * 60_000 + 20_000 },
  { id: 'o4', title: '后端基础设施与上线时间表', start_ms: 18 * 60_000 + 5_000 },
  { id: 'o5', title: '风险、解决措施与后续步骤', start_ms: 24 * 60_000 + 15_000 },
];

const TRANSCRIPT_1: FinalTranscript = {
  schema: 'orbit.transcript@1',
  language_detected: ['zh-CN', 'en-US'],
  speakers: SPEAKER_PALETTE,
  segments: [
    {
      id: 0,
      speaker: 'S1',
      start_ms: 0,
      end_ms: 11_000,
      text:
        '欢迎各位，今天的 30 分钟同步会议将涵盖 Q1 优先事项、AI 路线图、基础设施准备情况和风险规划。我们开始吧。',
      confidence: 0.94,
    },
    {
      id: 1,
      speaker: 'S2',
      start_ms: 11_000,
      end_ms: 38_000,
      text:
        '好的，先讲 Q1 的范围。我们这一季要锁定的是新用户引导界面的版式重设，以及各板块的任务分析仪表盘。这两个是确定要按期交付的。',
      confidence: 0.92,
    },
    {
      id: 2,
      speaker: 'S3',
      start_ms: 38_000,
      end_ms: 79_000,
      text:
        '关于支持功能自动化的部分，我建议推迟到 Q2。原因是工程资源要保障 Q1 这两块的高质量交付，硬塞会引入风险。',
      confidence: 0.91,
    },
    {
      id: 3,
      speaker: 'S1',
      start_ms: 79_000,
      end_ms: 132_000,
      text:
        'AI 路线图这边，语音克隆测试版我们对外延期到五月发布。摘要功能升级仍然保持是 Q1 的重点，这个不动。',
      confidence: 0.93,
    },
    {
      id: 4,
      speaker: 'S4',
      start_ms: 132_000,
      end_ms: 188_000,
      text:
        '基础设施这边的进度是这样：新一代日志管线下周完成灰度，核心 API 的限流策略也会在三月上线。监控的告警阈值我会同步更新一份文档。',
      confidence: 0.9,
    },
    {
      id: 5,
      speaker: 'S2',
      start_ms: 188_000,
      end_ms: 232_000,
      text:
        '风险方面，目前最担心的是仪表盘的数据回填会拖整个上线。我建议给数据团队多预留一周缓冲，并且把回填脚本和验证脚本都跑一遍 dry-run。',
      confidence: 0.89,
    },
    {
      id: 6,
      speaker: 'S1',
      start_ms: 232_000,
      end_ms: 274_000,
      text:
        '好，那我们的下一步动作就这么定。我会把今天的决策、风险、待办整理一份给到大家，48 小时内确认到 Owner。',
      confidence: 0.94,
    },
  ],
};

const SUMMARY_1: DerivativePayload = {
  schema: 'orbit.derivative@1',
  kind: 'summary',
  generated_at: '2026-05-13T10:01:22Z',
  provider: 'mock-final',
  body: [
    '## 概述',
    '在 30 分钟的产品交付路径讨论中，团队针对产品 Q1 的目标、功能优先级、交付计划和风险管理方面达成了一致，并将基于讨论结论做下一步动作。',
    '',
    '## 目标',
    '- 通过优化产品的使用体验来加强用户的长期使用，提升用户的优势认知。',
    '- 把高质量交付而非"全做"作为 Q1 的衡量标准。',
    '- 在 48 小时内为今日决策与风险给出 Owner。',
  ].join('\n'),
};

const DECISIONS_1: DerivativePayload = {
  schema: 'orbit.derivative@1',
  kind: 'decisions',
  generated_at: '2026-05-13T10:01:22Z',
  provider: 'mock-final',
  items: [
    {
      id: 'd1',
      title: '决策 1 — Q1 目标',
      body:
        '新用户引导界面的版式重新设计；各板块任务分析仪表盘已锁定交付，需要按期执行。',
      anchors: [{ start_ms: 11_000, end_ms: 38_000 }],
      speakers: ['S2'],
    },
    {
      id: 'd2',
      title: '决策 2 — 支持功能自动化',
      body:
        '为保障软件工程资源、按期交付高质量功能，故将此功能推迟至 Q2 实现。',
      anchors: [{ start_ms: 38_000, end_ms: 79_000 }],
      speakers: ['S3'],
    },
    {
      id: 'd3',
      title: '决策 3 — 人工智能路线图',
      body:
        '语音克隆测试版延期至五月发布；摘要功能升级仍将是第一季度的重点。',
      anchors: [{ start_ms: 79_000, end_ms: 132_000 }],
      speakers: ['S1'],
    },
  ],
};

const RISKS_1: DerivativePayload = {
  schema: 'orbit.derivative@1',
  kind: 'risks',
  generated_at: '2026-05-13T10:01:22Z',
  provider: 'mock-final',
  items: [
    {
      id: 'r1',
      title: '风险 1 — 仪表盘数据回填',
      body:
        '回填可能拖累整体上线节奏，建议为数据团队预留 1 周缓冲并跑 dry-run 校验。',
      anchors: [{ start_ms: 188_000, end_ms: 232_000 }],
      speakers: ['S2'],
    },
    {
      id: 'r2',
      title: '风险 2 — Q2 自动化承诺',
      body:
        '将自动化推迟到 Q2 后，需要在本季度内确认 Q2 容量，以免重复延期。',
      anchors: [{ start_ms: 38_000, end_ms: 79_000 }],
      speakers: ['S3'],
    },
  ],
};

const TODOS_1: DerivativePayload = {
  schema: 'orbit.derivative@1',
  kind: 'todos',
  generated_at: '2026-05-13T10:01:22Z',
  provider: 'mock-final',
  items: [
    {
      id: 't1',
      title: '整理决策与风险给到团队',
      body: '会议后 48 小时内确认每条 Owner。',
      owner: 'Carlin',
      done: false,
      anchors: [{ start_ms: 232_000, end_ms: 274_000 }],
    },
    {
      id: 't2',
      title: '同步监控告警阈值文档',
      body: '基础设施侧负责人更新阈值并群里同步。',
      owner: 'Patrick',
      done: false,
      anchors: [{ start_ms: 132_000, end_ms: 188_000 }],
    },
    {
      id: 't3',
      title: '准备数据回填 dry-run',
      body: '数据团队完成脚本与验证流程演练。',
      owner: 'Peter',
      done: true,
      anchors: [{ start_ms: 188_000, end_ms: 232_000 }],
    },
  ],
};

const META_1: RecordingMeta = {
  id: 'mob_cap_rec_001',
  title: '产品交付决策：功能优先级与发布计划',
  started_at: '2026-05-13T14:30:00+08:00',
  duration_ms: 30 * 60_000 + 24_000,
  language_hints: ['zh-CN', 'en-US'],
  speakers: SPEAKER_PALETTE,
  partial_state: 'finished',
  final_state: 'done',
  partial_provider: 'apple-on-device',
  final_provider: 'mock-final',
  participants: ['Carlin', 'Peter', 'Sean', 'Patrick'],
  location: '办公室',
  tags: ['产品', '决策'],
};

// ---- recording 2: 进行中（用于列表展示 live 状态） ---------------------------

const META_2: RecordingMeta = {
  id: 'mob_cap_rec_002',
  title: 'AI 路线图工作坊',
  started_at: '2026-05-13T09:00:00+08:00',
  duration_ms: 18 * 60_000 + 42_000,
  language_hints: ['zh-CN'],
  speakers: [SPEAKER_CARLIN, SPEAKER_PETER],
  partial_state: 'finished',
  final_state: 'running',
  partial_provider: 'apple-on-device',
  final_provider: 'mock-final',
  participants: ['Carlin', 'Peter'],
  location: '远程',
};

const META_3: RecordingMeta = {
  id: 'mob_cap_rec_003',
  title: '客户访谈 · ACME 产品反馈',
  started_at: '2026-05-12T11:00:00+08:00',
  duration_ms: 44 * 60_000 + 11_000,
  language_hints: ['zh-CN', 'en-US'],
  speakers: SPEAKER_PALETTE,
  partial_state: 'finished',
  final_state: 'done',
  partial_provider: 'apple-on-device',
  final_provider: 'mock-final',
  participants: ['Carlin', 'Peter', 'ACME-Lily'],
  location: '腾讯会议',
  tags: ['客户', '反馈'],
};

const META_4: RecordingMeta = {
  id: 'mob_cap_rec_004',
  title: '通勤地铁灵感',
  started_at: '2026-05-11T08:34:00+08:00',
  duration_ms: 6 * 60_000 + 12_000,
  language_hints: ['zh-CN'],
  speakers: [SPEAKER_CARLIN],
  partial_state: 'finished',
  final_state: 'failed',
  partial_provider: 'apple-on-device',
  final_provider: 'mock-final',
};

// ---- 模板 -----------------------------------------------------------------

export const MOCK_TEMPLATES: RecordingTemplate[] = [
  {
    id: 'tpl-reasoning-summary',
    name: '推理总结',
    author: 'Betty',
    description: '适用于演讲表达的综合复盘，提取论点 / 论据 / 结论',
    uses: 35_000,
    accent: '#7c3aed',
  },
  {
    id: 'tpl-expression',
    name: '表达力提升',
    author: 'Betty Morgen',
    description: '适用于演讲表达的综合复盘，标注语速 / 停顿 / 修辞',
    uses: 35_000,
    accent: '#0ea5e9',
  },
  {
    id: 'tpl-action-list',
    name: '行动清单',
    author: 'Orbit',
    description: '从对话中抽取可执行项，附 Owner 与时间窗',
    uses: 12_400,
    accent: '#16a34a',
  },
  {
    id: 'tpl-swot',
    name: 'SWOT',
    author: 'Orbit',
    description: '把对话拆成优势 / 劣势 / 机会 / 威胁四象限',
    uses: 8_900,
    accent: '#f97316',
  },
  {
    id: 'tpl-1-3-1',
    name: '1-3-1 决策框架',
    author: 'Carlin',
    description: '一个问题 · 三个方案 · 一个推荐',
    uses: 5_120,
    accent: '#dc2626',
  },
];

// ---- detail 集合 ----------------------------------------------------------

const DETAIL_1: RecordingDetail = {
  meta: META_1,
  outline: OUTLINE_1,
  transcript: TRANSCRIPT_1,
  derivatives: {
    summary: SUMMARY_1,
    decisions: DECISIONS_1,
    risks: RISKS_1,
    todos: TODOS_1,
    custom: [],
  },
};

const DETAIL_2: RecordingDetail = {
  meta: META_2,
  outline: OUTLINE_1.slice(0, 2),
  transcript: {
    schema: 'orbit.transcript@1',
    language_detected: ['zh-CN'],
    speakers: [SPEAKER_CARLIN, SPEAKER_PETER],
    segments: TRANSCRIPT_1.segments.slice(0, 3),
  },
  derivatives: {
    custom: [],
  },
};

const DETAIL_3: RecordingDetail = {
  meta: META_3,
  outline: OUTLINE_1,
  transcript: TRANSCRIPT_1,
  derivatives: {
    summary: SUMMARY_1,
    decisions: DECISIONS_1,
    todos: TODOS_1,
    custom: [],
  },
};

const DETAIL_4: RecordingDetail = {
  meta: META_4,
  outline: [],
  transcript: {
    schema: 'orbit.transcript@1',
    language_detected: ['zh-CN'],
    speakers: [SPEAKER_CARLIN],
    segments: [],
  },
  derivatives: { custom: [] },
};

const ALL_DETAILS: Record<string, RecordingDetail> = {
  [META_1.id]: DETAIL_1,
  [META_2.id]: DETAIL_2,
  [META_3.id]: DETAIL_3,
  [META_4.id]: DETAIL_4,
};

const ALL_LIST: RecordingMeta[] = [META_2, META_1, META_3, META_4];

export function listMockRecordings(): RecordingMeta[] {
  return ALL_LIST;
}

export function getMockRecording(id: string): RecordingDetail | undefined {
  return ALL_DETAILS[id];
}

/** 用于"立即生成"按钮的 mock 派生物 */
export function generateMockDerivative(
  template: RecordingTemplate,
): DerivativePayload {
  return {
    schema: 'orbit.derivative@1',
    kind: 'custom',
    template_id: template.id,
    generated_at: new Date().toISOString(),
    provider: 'mock-final',
    title: template.name,
    body: [
      `**模板：${template.name}（by ${template.author}）**`,
      '',
      template.description,
      '',
      '> 这是 mock 生成的内容；接入真实 LLM 后会用 transcript 作为上下文重新生成。',
      '',
      '- 关键论点 1：在保障质量前提下推进 Q1 既定范围',
      '- 关键论点 2：把不确定性留给 Q2 而不是塞进 Q1',
      '- 关键论点 3：风险 = 数据回填，对策 = 一周缓冲 + dry-run',
    ].join('\n'),
    items: [
      {
        id: 'gen-1',
        title: '论点 — 范围聚焦',
        body: '团队认同 Q1 不再扩展自动化能力，把交付质量列为首要 KPI。',
        anchors: [{ start_ms: 38_000, end_ms: 79_000 }],
      },
      {
        id: 'gen-2',
        title: '论据 — 工程资源紧张',
        body: '若强行加入自动化，仪表盘按期交付概率显著下降。',
        anchors: [{ start_ms: 79_000, end_ms: 132_000 }],
      },
      {
        id: 'gen-3',
        title: '结论 — 推迟自动化至 Q2',
        body: '需要在本季度内提前为 Q2 锁定容量，避免再次延期。',
        anchors: [{ start_ms: 232_000, end_ms: 274_000 }],
      },
    ],
  };
}

/**
 * 实时录音 mock：返回一个 partial 转写流，每 700ms 推一段。
 * UI 用它来展示"实时转写正在出现"的体验。
 */
export const MOCK_LIVE_PARTIALS: { ts: number; speaker: string; text: string }[] = [
  { ts: 0, speaker: 'S1', text: '欢迎各位，今天的 30 分钟同步会议' },
  { ts: 1, speaker: 'S1', text: '将涵盖 Q1 优先事项、AI 路线图、' },
  { ts: 2, speaker: 'S1', text: '基础设施准备情况和风险规划。我们开始吧。' },
  { ts: 3, speaker: 'S2', text: '好的，先讲 Q1 的范围——我们这一季要锁定的是' },
  { ts: 4, speaker: 'S2', text: '新用户引导界面的版式重设，' },
  { ts: 5, speaker: 'S2', text: '以及各板块的任务分析仪表盘。' },
  { ts: 6, speaker: 'S3', text: '关于支持功能自动化的部分，我建议推迟到 Q2。' },
  { ts: 7, speaker: 'S3', text: '原因是工程资源要保障 Q1 这两块的高质量交付。' },
];

export const MOCK_LANGUAGES = [
  { code: 'auto', label: '自动检测（180+）' },
  { code: 'zh-CN', label: '中文（普通话）' },
  { code: 'zh-HK', label: '中文（粤语）' },
  { code: 'en-US', label: 'English' },
  { code: 'ja-JP', label: '日本語' },
  { code: 'ko-KR', label: '한국어' },
  { code: 'es-ES', label: 'Español' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'de-DE', label: 'Deutsch' },
];
