import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Admin, CatalogKind, Prisma, PrismaClient } from '@prisma/client';
import JSZip from 'jszip';

const DEFAULT_CATALOG_VERSION = '1.0.0';
const EXPERT_KIT_VERSION = '1.1.0';
const UPSTREAM_URL = 'https://github.com/netease-youdao/LobsterAI';

type SkillCard = {
  id: string;
  name: { zh: string; en: string };
  description: { zh: string; en: string };
};

type ExpertBlueprint = {
  slug: string;
  nameZh: string;
  nameEn: string;
  descriptionZh: string;
  descriptionEn: string;
  tags: string[];
  tryAsking: string[];
  inputs: string[];
  steps: string[];
  deliverables: string[];
  qualityChecks: string[];
  safetyBoundary: string;
};

type SeedEntry = {
  kind: CatalogKind;
  slug: string;
  nameZh: string;
  nameEn: string;
  descriptionZh: string;
  descriptionEn: string;
  sortOrder: number;
  tags: string[];
  metadata: Record<string, unknown>;
  version?: string;
  expert?: ExpertBlueprint;
};

const expertBlueprints: ExpertBlueprint[] = [
  {
    slug: 'engineering', nameZh: '工枢·研发协作', nameEn: 'WorkHub Engineering',
    descriptionZh: '将需求拆成可验证的技术方案、实施任务与交付检查，支持开发全过程协作。',
    descriptionEn: 'Turn product intent into testable technical design, implementation tasks, and delivery checks.',
    tags: ['专家方案', '研发', '交付'],
    tryAsking: ['把这个需求拆成研发计划、接口契约和验收清单。', '审查这段代码的风险，并给出可执行的修复顺序。'],
    inputs: ['目标、现有代码或设计资料', '技术约束、交付期限与验收标准'],
    steps: ['澄清目标、边界和不可变约束。', '形成架构方案、任务拆分和依赖关系。', '实施或审查时同步列出测试与回滚条件。', '交付前核对代码、文档和验收结果。'],
    deliverables: ['技术方案与接口契约', '按优先级排序的实施清单', '测试与上线检查表'],
    qualityChecks: ['结论可追溯到输入约束。', '每项改动都有可验证的验收方式。'],
    safetyBoundary: '不执行生产变更、发布或删除操作，除非用户明确确认具体目标。',
  },
  {
    slug: 'design', nameZh: '工枢·设计创作', nameEn: 'WorkHub Design',
    descriptionZh: '把产品目标转化为可评审的体验、视觉与设计规范，兼顾品牌一致性和可实现性。',
    descriptionEn: 'Create reviewable product experience, visual direction, and design specifications.',
    tags: ['专家方案', '设计', '体验'],
    tryAsking: ['为这个功能整理用户流程、页面层级和验收要点。', '根据品牌调性给出一套界面视觉规范。'],
    inputs: ['目标用户与使用场景', '品牌约束、功能范围和已有素材'],
    steps: ['梳理用户任务和关键决策点。', '提出信息架构与界面层级。', '明确视觉规则、状态和响应式要求。', '通过可用性与可实现性检查收敛方案。'],
    deliverables: ['用户流程与页面结构', '视觉方向和组件规范', '设计验收清单'],
    qualityChecks: ['核心任务路径不依赖隐含操作。', '视觉规范能被工程团队直接实现。'],
    safetyBoundary: '不把未经授权的品牌资产、受限素材或个人图像用于公开输出。',
  },
  {
    slug: 'operations', nameZh: '工枢·运营管理', nameEn: 'WorkHub Operations',
    descriptionZh: '把运营目标组织为节奏、流程、指标与复盘动作，帮助团队持续改善执行效率。',
    descriptionEn: 'Organize operational goals into cadence, processes, metrics, and improvement actions.',
    tags: ['专家方案', '运营', '流程'],
    tryAsking: ['为下月运营目标制定周节奏、负责人和复盘机制。', '根据这份数据找出流程瓶颈并给出改进计划。'],
    inputs: ['业务目标、现有流程和数据', '团队角色、周期与资源限制'],
    steps: ['确认目标指标和责任边界。', '绘制现状流程并识别阻塞点。', '制定活动节奏、指标看板与异常处理。', '输出复盘结论和下一轮动作。'],
    deliverables: ['运营执行表', '指标定义与复盘模板', '改进优先级清单'],
    qualityChecks: ['指标可量化且责任人明确。', '建议包含执行成本和预期影响。'],
    safetyBoundary: '不替用户承诺业务结果或代表其对外发布运营通知。',
  },
  {
    slug: 'product-management', nameZh: '工枢·产品管理', nameEn: 'WorkHub Product Management',
    descriptionZh: '从问题发现到版本验收整理产品决策，形成团队可执行的产品计划。',
    descriptionEn: 'Turn product discovery into prioritized, buildable, and measurable release plans.',
    tags: ['专家方案', '产品', '规划'],
    tryAsking: ['把这些用户反馈归纳为问题、机会和版本优先级。', '为新功能编写包含验收条件的产品需求文档。'],
    inputs: ['用户问题、业务目标与现有产品资料', '范围、优先级规则和版本窗口'],
    steps: ['定义用户问题和成功指标。', '比较方案、成本、风险与依赖。', '撰写需求、验收条件和发布范围。', '建立反馈与迭代闭环。'],
    deliverables: ['问题定义与优先级依据', 'PRD 或版本计划', '验收标准和度量方案'],
    qualityChecks: ['需求区分事实、假设与待验证项。', '范围与验收条件一致。'],
    safetyBoundary: '不伪造用户研究结论或把未验证假设写成确定事实。',
  },
  {
    slug: 'human-resources', nameZh: '工枢·人力协同', nameEn: 'WorkHub People Operations',
    descriptionZh: '支持招聘、沟通、培养与组织流程的规范化整理，帮助管理者做出一致判断。',
    descriptionEn: 'Structure hiring, communication, learning, and people-operation workflows.',
    tags: ['专家方案', '人力', '组织'],
    tryAsking: ['根据岗位目标生成结构化面试题和评分表。', '设计一个新员工入职 30 天协同计划。'],
    inputs: ['岗位或组织目标', '适用制度、评价维度与时间范围'],
    steps: ['确认业务场景与公平性要求。', '整理流程、沟通节点与评价依据。', '生成标准化材料并标注负责人。', '复核隐私、偏差和合规风险。'],
    deliverables: ['面试或沟通材料', '培养与跟进计划', '流程检查清单'],
    qualityChecks: ['评价标准与岗位要求直接相关。', '表达尊重个人隐私且避免歧视性判断。'],
    safetyBoundary: '不替代人事决策，不根据受保护特征推荐、淘汰或评价个人。',
  },
  {
    slug: 'marketing', nameZh: '工枢·市场增长', nameEn: 'WorkHub Marketing',
    descriptionZh: '围绕受众、定位、内容和转化目标组织市场行动，输出可跟踪的增长方案。',
    descriptionEn: 'Plan measurable marketing work across audience, positioning, content, and conversion.',
    tags: ['专家方案', '市场', '增长'],
    tryAsking: ['为这个产品制定一份四周内容与活动传播计划。', '分析目标客群并提出可验证的传播主张。'],
    inputs: ['产品信息、目标受众和市场目标', '品牌口径、渠道约束和预算范围'],
    steps: ['定义受众、价值主张与转化目标。', '设计内容主题、渠道节奏与素材需求。', '建立指标、实验和归因方法。', '按结果复盘并调整下一轮动作。'],
    deliverables: ['营销策略与内容日历', '渠道执行清单', '指标与复盘框架'],
    qualityChecks: ['主张与可证明的产品能力一致。', '每个渠道动作都有目标指标。'],
    safetyBoundary: '不生成虚假宣传、误导性承诺或未经许可的客户背书。',
  },
  {
    slug: 'finance', nameZh: '工枢·财务分析', nameEn: 'WorkHub Finance',
    descriptionZh: '将经营资料转化为预算、分析和管理建议，并清楚区分数据事实与判断。',
    descriptionEn: 'Turn operating data into budgets, analysis, and clearly qualified management advice.',
    tags: ['专家方案', '财务', '分析'],
    tryAsking: ['根据这份收支数据整理预算偏差和管理层关注点。', '为季度经营复盘设计指标结构和分析口径。'],
    inputs: ['报表、预算或经营数据', '会计口径、期间和决策问题'],
    steps: ['检查数据范围、口径与完整性。', '计算趋势、差异和关键驱动因素。', '提出可复核的管理建议。', '标注数据限制和需要专业复核的事项。'],
    deliverables: ['结构化财务分析', '预算或经营复盘摘要', '风险与待确认事项'],
    qualityChecks: ['金额、期间和口径在全文保持一致。', '推断与原始数据明确区分。'],
    safetyBoundary: '不提供投资、税务、审计或法律结论，重大事项须由持证专业人士确认。',
  },
  {
    slug: 'sales', nameZh: '工枢·销售支持', nameEn: 'WorkHub Sales',
    descriptionZh: '帮助销售团队研究客户、组织机会、准备材料并保持可追踪的跟进行动。',
    descriptionEn: 'Support account research, opportunity planning, sales materials, and accountable follow-up.',
    tags: ['专家方案', '销售', '客户'],
    tryAsking: ['根据客户资料制定一次发现会议的问题清单和跟进计划。', '把这些商机整理为优先级、风险和下一步动作。'],
    inputs: ['客户背景、商机阶段和产品信息', '已知需求、限制条件和沟通记录'],
    steps: ['整理客户目标、角色和当前证据。', '识别机会、异议、风险与下一步。', '准备沟通材料和行动计划。', '复核承诺、价格和审批边界。'],
    deliverables: ['客户机会摘要', '会议材料与问题清单', '跟进计划和风险提示'],
    qualityChecks: ['所有承诺有明确来源或标为待确认。', '下一步包含负责人和时间点。'],
    safetyBoundary: '不虚构客户信息、价格授权或合同承诺，也不代表用户发送外部信息。',
  },
  {
    slug: 'data', nameZh: '工枢·数据分析', nameEn: 'WorkHub Data',
    descriptionZh: '从原始数据到可执行结论建立透明的分析路径，强调可复现和数据边界。',
    descriptionEn: 'Build transparent, reproducible paths from raw data to actionable conclusions.',
    tags: ['专家方案', '数据', '洞察'],
    tryAsking: ['为这份数据设计清洗规则、分析问题和可视化方案。', '检查这组指标的异常，并解释可能原因和验证方法。'],
    inputs: ['数据文件、字段说明和分析目标', '统计口径、时间范围和可用工具'],
    steps: ['检查数据来源、覆盖范围和质量。', '定义分析问题、指标和方法。', '执行清洗、分析和可视化。', '解释限制条件并给出后续验证动作。'],
    deliverables: ['数据质量说明', '分析结果与图表建议', '结论、限制与行动建议'],
    qualityChecks: ['计算过程可以复现。', '相关性、因果性和样本局限明确区分。'],
    safetyBoundary: '不暴露个人敏感数据，不将不完整样本夸大为普遍结论。',
  },
  {
    slug: 'customer-support', nameZh: '工枢·客户支持', nameEn: 'WorkHub Customer Support',
    descriptionZh: '将客户问题转化为准确、同理且可闭环的服务流程和知识沉淀。',
    descriptionEn: 'Turn customer issues into accurate, empathetic, and traceable support workflows.',
    tags: ['专家方案', '客服', '服务'],
    tryAsking: ['根据这张工单生成回复草稿、排查步骤和升级条件。', '归纳近期客户反馈，找出需要改进的服务流程。'],
    inputs: ['客户问题、产品信息和历史处理记录', '服务政策、SLA 和升级渠道'],
    steps: ['确认问题、影响范围和紧急程度。', '整理排查步骤、回复草稿与知识链接。', '定义升级条件和责任人。', '复盘高频问题并沉淀改进项。'],
    deliverables: ['客户回复草稿', '处理与升级路径', '知识库和流程改进建议'],
    qualityChecks: ['回复不承诺未确认的修复时间或补偿。', '处理状态和下一步对客户清晰可见。'],
    safetyBoundary: '不索取不必要的敏感信息，不代表用户执行退款、账户或隐私相关操作。',
  },
  {
    slug: 'legal', nameZh: '工枢·法务支持', nameEn: 'WorkHub Legal Support',
    descriptionZh: '辅助整理合同、法规和风险材料，帮助团队准备专业审阅所需的清晰事实基础。',
    descriptionEn: 'Structure contracts, regulations, and risk materials for qualified legal review.',
    tags: ['专家方案', '法务', '合规'],
    tryAsking: ['将这份合同按义务、风险、待谈判条款和待确认事项整理。', '为这个业务场景列出合规核查问题和证据清单。'],
    inputs: ['合同、政策或事实材料', '适用地区、业务背景和审阅目标'],
    steps: ['提取条款、事实和关键定义。', '按义务、期限、风险和待确认项分类。', '形成给专业人士审阅的提纲与问题清单。', '标注管辖、时效和资料缺口。'],
    deliverables: ['合同或法规摘要', '风险与待确认事项清单', '专业审阅问题单'],
    qualityChecks: ['引用内容与原始材料可对应。', '法律事实、风险提示和法律结论清楚区分。'],
    safetyBoundary: '不提供法律意见、诉讼策略或替代律师审阅。',
  },
  {
    slug: 'bio-research', nameZh: '工枢·生物研究', nameEn: 'WorkHub Bio Research',
    descriptionZh: '协助文献检索、实验资料整理与研究总结，强调证据等级、可重复性和伦理边界。',
    descriptionEn: 'Support literature review, experimental organization, and evidence-aware research summaries.',
    tags: ['专家方案', '生物研究', '文献'],
    tryAsking: ['为这个研究问题制定文献检索式、纳入标准和证据表。', '把实验记录整理为方法、观察、限制和后续验证建议。'],
    inputs: ['研究问题、文献或实验记录', '研究范围、可用资源和伦理限制'],
    steps: ['明确研究问题、证据标准与纳入边界。', '组织检索、资料提取和证据分级。', '总结方法、结果、限制与可重复性要求。', '列出伦理、生物安全和专业复核事项。'],
    deliverables: ['检索与证据整理表', '研究摘要与方法记录', '限制、风险和下一步验证建议'],
    qualityChecks: ['结论与证据等级匹配。', '实验条件、样本和限制记录完整。'],
    safetyBoundary: '不提供临床诊断、治疗建议或高风险实验操作指令。',
  },
];

const skillMetadata = [
  ['article-writer', '文章写作'], ['canvas-design', '平面设计'], ['content-planner', '内容策划'],
  ['create-plan', '计划制定'], ['daily-trending', '热点整理'], ['develop-web-game', '网页游戏开发'],
  ['docx', 'Word 文档'], ['films-search', '影视搜索'], ['frontend-design', '前端设计'],
  ['imap-smtp-email', '邮件收发'], ['local-tools', '本地工具'], ['music-search', '音乐搜索'],
  ['pdf', 'PDF 文档'], ['playwright', '浏览器自动化'], ['pptx', '演示文稿'],
  ['remotion', '程序化视频'], ['seedance', '视频生成'], ['seedream', '图片生成'],
  ['skill-creator', '能力创建'], ['skill-vetter', '能力审查'],
  ['stock-analyzer', '股票分析'], ['stock-announcements', '股票公告'], ['stock-explorer', '股票查询'],
  ['technology-news-search', '科技资讯'], ['weather', '天气查询'], ['web-search', '网页搜索'],
  ['xlsx', '电子表格'], ['youdaonote', '云笔记兼容'],
] as const;

const connectors = [
  ['tavily', 'Tavily', 'Real-time web search and extraction', 'search', 'npx', ['-y', 'tavily-mcp@latest'], ['TAVILY_API_KEY']],
  ['github', 'GitHub', 'GitHub repository and issue management', 'developer', 'npx', ['-y', '@modelcontextprotocol/server-github'], ['GITHUB_PERSONAL_ACCESS_TOKEN']],
  ['gitlab', 'GitLab', 'GitLab project and merge request management', 'developer', 'npx', ['-y', '@modelcontextprotocol/server-gitlab'], ['GITLAB_PERSONAL_ACCESS_TOKEN']],
  ['context7', 'Context7', 'Library documentation lookup', 'developer', 'npx', ['-y', '@upstash/context7-mcp@latest'], []],
  ['google-drive', 'Google Drive', 'Google Drive file access', 'productivity', 'npx', ['-y', '@modelcontextprotocol/server-gdrive'], []],
  ['gmail', 'Gmail', 'Gmail search and sending', 'productivity', 'npx', ['-y', '@gongrzhe/server-gmail-autoauth-mcp'], ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REDIRECT_URI']],
  ['google-calendar', 'Google Calendar', 'Google Calendar event management', 'productivity', 'npx', ['-y', '@cocal/google-calendar-mcp'], ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI']],
  ['notion', 'Notion', 'Notion workspace management', 'productivity', 'npx', ['-y', '@notionhq/notion-mcp-server'], ['OPENAPI_MCP_HEADERS']],
  ['slack', 'Slack', 'Slack workspace messaging', 'productivity', 'npx', ['-y', '@modelcontextprotocol/server-slack'], ['SLACK_BOT_TOKEN', 'SLACK_TEAM_ID']],
  ['todoist', 'Todoist', 'Todoist task management', 'productivity', 'npx', ['-y', 'todoist-mcp@latest'], ['TODOIST_API_TOKEN']],
  ['playwright', 'Playwright', 'Browser automation', 'browser', 'npx', ['-y', '@executeautomation/playwright-mcp-server'], []],
  ['figma', 'Figma', 'Figma design-file access', 'design', 'npx', ['-y', 'figma-developer-mcp@latest'], ['FIGMA_API_KEY']],
  ['canva', 'Canva', 'Canva design management', 'design', 'npx', ['-y', '@iflow-mcp/mattcoatsworth-canva-mcp-server'], ['CANVA_API_KEY']],
  ['firecrawl', 'Firecrawl', 'Structured web extraction', 'data-api', 'npx', ['-y', 'firecrawl-mcp@latest'], ['FIRECRAWL_API_KEY']],
  ['fetch', 'Fetch', 'Web content retrieval', 'data-api', 'npx', ['-y', '@modelcontextprotocol/server-fetch'], []],
] as const;

const kitEntries: SeedEntry[] = [
  {
    kind: 'KIT', slug: 'computer-use', nameZh: '电脑操作', nameEn: 'Computer Use',
    descriptionZh: '在获得用户确认后查看和操作 Windows 桌面应用。',
    descriptionEn: 'Inspect and control approved Windows desktop applications.', sortOrder: 20,
    tags: ['Windows', '自动化'], metadata: { builtInLifecycle: 'computer-use', platform: 'win32-x64' },
  },
  ...expertBlueprints.map((expert, index): SeedEntry => ({
    kind: 'KIT', slug: expert.slug, nameZh: expert.nameZh, nameEn: expert.nameEn,
    descriptionZh: expert.descriptionZh, descriptionEn: expert.descriptionEn, sortOrder: 30 + index * 10,
    tags: expert.tags, version: EXPERT_KIT_VERSION, expert,
    metadata: {
      expertSuite: true,
      author: '逻栖工枢',
      tryAsking: expert.tryAsking.map((zh) => ({ zh, en: zh })),
      skills: [expertSkillCard(expert)],
      source: { name: 'LobsterAI expert-suite structure', url: UPSTREAM_URL, license: 'MIT' },
    },
  })),
];

const skillEntries: SeedEntry[] = skillMetadata.map(([slug, nameZh], index) => ({
  kind: 'SKILL', slug, nameZh, nameEn: slug, descriptionZh: `使用${nameZh}能力完成相关工作。`,
  descriptionEn: `Use the ${slug} capability.`, sortOrder: 100 + index * 10,
  tags: ['内置能力'], metadata: { builtIn: true },
}));

const connectorEntries: SeedEntry[] = connectors.map(([slug, name, description, category, command, args, requiredEnvKeys], index) => ({
  kind: 'CONNECTOR', slug, nameZh: name, nameEn: name, descriptionZh: description,
  descriptionEn: description, sortOrder: 100 + index * 10, tags: [category],
  metadata: { server: { transportType: 'stdio', command, args, requiredEnvKeys } },
}));

function expertSkillCard(expert: ExpertBlueprint): SkillCard {
  return {
    id: `${expert.slug}-expert`,
    name: { zh: `${expert.nameZh}工作流`, en: `${expert.nameEn} Workflow` },
    description: { zh: expert.descriptionZh, en: expert.descriptionEn },
  };
}

export async function seedCatalog(db: PrismaClient, admin: Admin, storageDirectory: string) {
  const storageDir = path.resolve(storageDirectory);
  await mkdir(storageDir, { recursive: true });

  const archivedSmoke = await db.catalogRelease.updateMany({
    where: { item: { kind: 'KIT', slug: 'smoke-kit' }, status: 'PUBLISHED' },
    data: { status: 'ARCHIVED', updatedByAdminId: admin.id },
  });

  const archivedRetiredAppearanceItems = await db.catalogRelease.updateMany({
    where: {
      item: {
        OR: [
          { kind: 'KIT', slug: 'ai-skin-designer' },
          { kind: 'SKILL', slug: 'skin-creator' },
        ],
      },
      status: { in: ['DRAFT', 'PUBLISHED'] },
    },
    data: { status: 'ARCHIVED', updatedByAdminId: admin.id },
  });

  let created = 0;
  for (const entry of [...kitEntries, ...skillEntries, ...connectorEntries]) {
    const item = await db.catalogItem.upsert({
      where: { kind_slug: { kind: entry.kind, slug: entry.slug } },
      update: { sortOrder: entry.sortOrder },
      create: { id: randomUUID(), kind: entry.kind, slug: entry.slug, sortOrder: entry.sortOrder },
    });
    const version = entry.version ?? DEFAULT_CATALOG_VERSION;
    const existing = await db.catalogRelease.findUnique({ where: { itemId_version: { itemId: item.id, version } } });
    if (existing) {
      // Reconcile assets for idempotent upgrades. Older production seeds could
      // have created computer-use without its runtime asset; keep the release
      // and user data, but add the verified runtime exactly once.
      if (entry.kind === 'KIT' && entry.slug === 'computer-use') {
        const hasRuntime = await db.catalogAsset.findFirst({
          where: { releaseId: existing.id, role: 'RUNTIME' },
          select: { id: true },
        });
        if (!hasRuntime) {
          const runtime = await buildComputerUseRuntime(storageDir);
          await db.catalogAsset.create({ id: randomUUID(), releaseId: existing.id, ...runtime, role: 'RUNTIME' });
          console.log('[seed] repaired computer-use runtime asset');
        }
      }
      continue;
    }

    const assets = entry.kind === 'CONNECTOR'
      ? []
      : [{ role: 'PAYLOAD', ...(await buildPayload(entry, storageDir, version)) }];
    if (entry.kind === 'KIT' && entry.slug === 'computer-use') {
      assets.push({ role: 'RUNTIME', ...(await buildComputerUseRuntime(storageDir)) });
    }

    await db.$transaction(async (tx) => {
      await tx.catalogRelease.updateMany({
        where: { itemId: item.id, status: 'PUBLISHED' },
        data: { status: 'ARCHIVED', updatedByAdminId: admin.id },
      });
      await tx.catalogRelease.create({
        data: {
          id: randomUUID(), itemId: item.id, version,
          nameZh: entry.nameZh, nameEn: entry.nameEn,
          descriptionZh: entry.descriptionZh, descriptionEn: entry.descriptionEn,
          tags: entry.tags, metadata: entry.metadata as Prisma.InputJsonValue,
          status: 'PUBLISHED', publishedAt: new Date(),
          createdByAdminId: admin.id, updatedByAdminId: admin.id,
          ...(assets.length > 0 ? { assets: { create: assets.map((asset) => ({ id: randomUUID(), ...asset })) } } : {}),
        },
      });
    });
    created += 1;
  }
  console.log(
    `[seed] catalog ready (${created} new releases, ${archivedSmoke.count} smoke releases archived, `
    + `${archivedRetiredAppearanceItems.count} retired appearance releases archived)`,
  );
}

async function buildComputerUseRuntime(storageDir: string) {
  const runtimeName = 'computer-use-runtime-win-x64-1.0.7.zip';
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const sourceCandidates = [
    path.join(moduleDirectory, 'catalog-assets', runtimeName),
    path.join(moduleDirectory, '../../prisma/catalog-assets', runtimeName),
  ];
  let data: Buffer | undefined;
  for (const sourcePath of sourceCandidates) {
    try {
      data = await readFile(sourcePath);
      break;
    } catch {
      // The compiled server keeps seed assets beside the source prisma directory.
    }
  }
  if (!data) throw new Error(`Computer Use seed runtime asset missing: ${runtimeName}`);
  const sha256 = createHash('sha256').update(data).digest('hex');
  if (data.byteLength !== 540139 || sha256 !== 'd43c15cd69e10f0fbffe62f6c5ec947b4e61c5df84efbce46b6f73e28c9de30e') {
    throw new Error('Computer Use seed runtime integrity check failed');
  }
  const storageKey = `${randomUUID()}.zip`;
  await writeFile(path.join(storageDir, storageKey), data, { flag: 'wx' });
  return {
    storageKey,
    originalName: 'logicnest-computer-use-runtime-win-x64-1.0.7.zip',
    mimeType: 'application/zip',
    sizeBytes: BigInt(data.byteLength),
    sha256,
  };
}

function numberedSection(title: string, items: string[]): string[] {
  return [title, ...items.map((item, index) => `${index + 1}. ${item}`), ''];
}

function buildExpertSkillDocument(entry: SeedEntry, expert: ExpertBlueprint): string {
  const skillName = `${entry.slug}-expert`;
  return [
    '---',
    `name: ${skillName}`,
    `description: ${expert.descriptionEn}`,
    '---',
    '',
    `# ${expert.nameZh}`,
    '',
    expert.descriptionZh,
    '',
    ...numberedSection('## 输入检查', expert.inputs),
    ...numberedSection('## 工作步骤', expert.steps),
    ...numberedSection('## 输出格式', expert.deliverables),
    ...numberedSection('## 质量检查', expert.qualityChecks),
    '## 安全边界',
    expert.safetyBoundary,
    '',
    '## 使用原则',
    '使用清晰、可执行的中文交付结果。信息不足时先说明缺口和需要确认的内容；涉及外部系统、对外沟通或不可逆操作前，必须取得用户确认。',
    '',
    '## 示例任务',
    ...expert.tryAsking.map((prompt) => `- ${prompt}`),
    '',
  ].join('\n');
}

async function buildPayload(entry: SeedEntry, storageDir: string, version: string) {
  const zip = new JSZip();
  const skillName = entry.expert ? `${entry.slug}-expert` : (entry.kind === 'KIT' ? `${entry.slug}-expert` : entry.slug);
  const skillDocument = entry.expert
    ? buildExpertSkillDocument(entry, entry.expert)
    : [
      '---', `name: ${skillName}`, `description: ${entry.descriptionEn}`, '---', '',
      `# ${entry.nameZh}`, '', entry.descriptionZh, '',
      '使用清晰、可执行的结果；执行外部操作前须取得用户确认。', '',
    ].join('\n');
  zip.file(`${skillName}/SKILL.md`, skillDocument);
  zip.file('LICENSE.txt', 'MIT License\n\nThis catalog package is distributed with LogicNest WorkHub under the project MIT license.\n');
  if (entry.expert) {
    zip.file('UPSTREAM_NOTICE.md', [
      '# Third-party notice',
      '',
      'This LogicNest WorkHub workflow is independently authored and adapts the public expert-suite capability structure from LobsterAI.',
      `Upstream project: ${UPSTREAM_URL}`,
      'Upstream license: MIT. Retain the upstream license and notices when redistributing derived source material.',
      '',
    ].join('\n'));
  }
  const data = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const storageKey = `${randomUUID()}.zip`;
  await writeFile(path.join(storageDir, storageKey), data, { flag: 'wx' });
  return {
    storageKey,
    originalName: `${entry.slug}-${version}.zip`,
    mimeType: 'application/zip',
    sizeBytes: BigInt(data.byteLength),
    sha256: createHash('sha256').update(data).digest('hex'),
  };
}
