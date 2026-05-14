import type {
  DerivativePayload,
  RecordingDetail,
  RecordingTemplate,
  TranscriptSegment,
} from '../../types/recording';

export const BUILTIN_TEMPLATES: RecordingTemplate[] = [
  {
    id: 'tpl-reasoning-summary',
    name: '推理总结',
    author: 'Orbit',
    description: '提取论点、论据与结论，适合演讲和复盘。',
    uses: 0,
    accent: '#7c3aed',
  },
  {
    id: 'tpl-expression',
    name: '表达力提升',
    author: 'Orbit',
    description: '标注表达结构、语速停顿与可优化段落。',
    uses: 0,
    accent: '#0ea5e9',
  },
  {
    id: 'tpl-action-list',
    name: '行动清单',
    author: 'Orbit',
    description: '从对话中抽取可执行项，附来源时间戳。',
    uses: 0,
    accent: '#16a34a',
  },
  {
    id: 'tpl-swot',
    name: 'SWOT',
    author: 'Orbit',
    description: '把转写内容拆成优势 / 劣势 / 机会 / 威胁。',
    uses: 0,
    accent: '#f97316',
  },
  {
    id: 'tpl-1-3-1',
    name: '1-3-1 决策框架',
    author: 'Orbit',
    description: '一个问题、三个方案、一个推荐。',
    uses: 0,
    accent: '#dc2626',
  },
];

export function generateLocalDerivative(
  template: RecordingTemplate,
  detail: RecordingDetail,
): DerivativePayload {
  const text = transcriptText(detail.transcript.segments);
  const firstSegment = detail.transcript.segments[0];
  const anchor = firstSegment
    ? [{ start_ms: firstSegment.start_ms, end_ms: firstSegment.end_ms }]
    : undefined;

  return {
    schema: 'orbit.derivative@1',
    kind: 'custom',
    template_id: template.id,
    generated_at: new Date().toISOString(),
    provider: 'local-template',
    title: template.name,
    body: [
      `## ${template.name}`,
      template.description,
      '',
      text.length > 0
        ? summarizeText(text)
        : '这条录音暂时没有可用转写；原始音频已保存在本机，可稍后重新生成。',
    ].join('\n'),
    items: firstSegment
      ? [
          {
            id: `${template.id}-1`,
            title: '来源片段',
            body: firstSegment.text,
            anchors: anchor,
            speakers: [firstSegment.speaker],
          },
        ]
      : [],
  };
}

function transcriptText(segments: TranscriptSegment[]): string {
  return segments.map((segment) => segment.text).join(' ').trim();
}

function summarizeText(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 220) return normalized;
  return `${normalized.slice(0, 220)}…`;
}
