# 逻栖工枢品牌化 UI 规范

## 产品定位

逻栖工枢是一个智能工作中枢：把任务、能力与连接归拢到一个工作中枢。界面应帮助用户从任务出发，按需调度专属助手、能力、方案与外部连接，不使用上游产品的宣传口吻。

视觉延续现有明暗主题与主题变量，以黑、白和中性色建立层级。选中态依靠字重、黑白反差和轻微底色表达；危险、成功和告警状态可保留必要状态色。普通导航和快捷入口不使用科技蓝、霓虹渐变、高饱和功能色或彩色营销徽标。

## 用户可见术语

| 内部或历史概念 | 中文 | English |
| --- | --- | --- |
| Cowork / Main Agent | 工作中枢 | Work Hub |
| New Chat | 新建任务 | New Task |
| Sessions / History | 任务记录 | Task History |
| My Agents | 专属助手 | Personal Assistants |
| Scheduled Tasks | 自动任务 | Automations |
| Skills | 能力库 | Capability Library |
| Kits | 方案库 | Solution Library |
| MCP | 连接中心 | Connection Center |
| Agent Engine | 运行引擎 | Runtime Engine |
| Custom Model | 模型服务 | Model Services |
| IM Bot | 消息接入 | Messaging Access |
| Email | 邮件接入 | Email Access |
| Browser | 网页访问 | Web Access |
| Memory | 长期记忆 | Long-term Memory |
| Dreaming | 记忆整理 | Memory Organization |
| Plugins | 扩展管理 | Extension Management |
| Shortcuts | 快捷操作 | Quick Actions |
| About | 关于逻栖工枢 | About LogicNest WorkHub |

默认工作中枢使用单色猫头鹰线标作为小尺寸界面识别符号；该符号仅用于导航和助手列表，不替代、不派生正式 Logo 资产。内置外观方案的用户可见名称固定为“逻栖外观工坊 / LogicNest Appearance Studio”。

展示词汇集中在 `src/renderer/config/brandUiCopy.ts`，导航结构集中在 `src/renderer/config/brandUi.ts`。原有 Tab ID、Redux 状态、IPC、路由和数据结构保持不变。

## 桌面导航

- 顶部操作：新建任务、搜索任务。
- 工作：工作中枢、任务记录、自动任务。
- 能力：专属助手、能力库、方案库。
- 连接：连接中心。
- 底部：会员或账号入口、设置。

Agent 与任务记录继续使用原父子数据关系。Sites 等未交付入口不进入品牌导航。侧栏的折叠、宽度拖动、任务操作、批量操作和滚动行为继续保留。

## 工作中枢首页

- 保留按时间变化的问候语。
- 副标题使用“从一个任务开始，调度你的能力与工具”。
- 输入提示使用“描述你要完成的工作，或直接提出问题”。
- 常用工作固定为演示制作、数据整理、文档起草、页面搭建，并继续使用原 Skill 映射与提示词。
- 快捷入口采用统一中性样式，不展示积分、广告、轮播或促销浮层。

## 设置导航

- 基础设置：通用、外观、快捷操作。
- 智能能力：模型服务、运行引擎、长期记忆、记忆整理。
- 连接与扩展：网页访问、消息接入、邮件接入、扩展管理。
- 产品：关于逻栖工枢。

OpenClaw 只在运行引擎的技术说明、维护、诊断、日志和许可信息中如实出现，不作为普通用户一级导航或宣传名称。

## 运营中心

产品名称为“逻栖工枢 · 运营中心”。导航固定为运营概览、用户、会员与卡密、设备、审计。保持既有路由和权限映射，不使用没有实时能力支撑的“实时数据”标签。整体使用黑白与中性色，危险操作保留必要状态色。

## 文案与技术命名例外

- 用户文案描述“能完成什么”和“从哪里进入”，避免堆叠 Agent、MCP、Cowork 等实现术语。
- 中文与英文逐项编写，不通过运行时字符串替换进行换名。
- 内部 Cowork、OpenClaw、Agent、MCP、Kits、Skills 标识不批量重命名。
- LobsterAI MIT LICENSE、版权声明、第三方许可证和仍需展示的法定协议名称保持原样。
- 正式 Logo、ICO、托盘图标和安装器图片不得修改、派生或重新编码。
