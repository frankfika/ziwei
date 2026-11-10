/**
 * 会话页的界面文案（中文 / English）—— 导航、会话头、对话抽屉、空态、输入区。
 * 盘的原文与回答是中文数据集产物，不走这里；这里只管界面骨架。
 */

import type { Lang } from './quotaCopy';

export interface ChatCopy {
  // 导航
  navNew: string;
  navAria: string;
  navAbout: string;
  // 首页
  homeTitle: string;
  /** 空态 hero 的星图主题词（中文竖排 / 英文横排） */
  heroTitle: string;
  errorYear: string;
  errorMonth: string;
  errorDay: string;
  errorDate: string;
  errorClock: string;
  errorShichen: string;
  // 会话头
  newChatTitle: string;
  askPanelTitle: string;
  openAskAria: string;
  profilesAria: string;
  aiReadyAria: string;
  aiSetupAria: string;
  closeAskAria: string;
  askGlyph: string;
  chartLink: string;
  aiSettings: string;
  // 对话抽屉
  manageAria: string;
  closeSheetAria: string;
  profileAiAria: string;
  conversationsOf: (name?: string) => string;
  noConversationsHint: string;
  currentChart: string;
  msgCount: (n: number) => string;
  today: string;
  yesterday: string;
  newTopic: string;
  deleteThread: string;
  deleteThreadConfirm: string;
  deleteChart: string;
  deleteChartConfirm: string;
  deepThinkOn: string;
  deepThinkOff: string;
  deepThinkTitle: string;
  // 对话区
  captionStarted: string;
  emptyTitle: (name?: string) => string;
  emptySub: string;
  placeholderIdle: string;
  placeholderPending: string;
  queued: (q: string) => string;
  maxNotice: (n: number) => string;
  thinking: string;
  thinkingNote: string;
  emptyAnswer: string;
  send: string;
  sendQueueTitle: string;
  // 档案
  newProfile: string;
  synastry: string;
  noProfilesBody: string;
  noProfilesCta: string;
  incompleteBirth: string;
  // 回答来源与自检
  sourceUser: string;
  sourceBuiltin: string;
  suspectStar: (name: string) => string;
  suspectPalace: (name: string) => string;
  suspectPlacement: (name: string) => string;
  citedLabel: string;
  overreachNotice: string;
  requestFailed: string;
  // 非 bare 面板（盘页嵌入的追问）
  savedChats: (n: number) => string;
  localOnly: string;
  collapse: string;
  expand: string;
  moreAskAria: string,
  moreRecommended: string,
  askUnavailable: string,
  openAiSettingsTitle: string,
  collapseChart: string,
  viewChartInChat: string,
  askAround: string,
  placeholderContinue: string;
  exampleCareer: string;
  verifying: string;
  followUp: string;
  hintVerifying: string;
  hintContinue: string;
  hintFirst: string;
  verifyingIntro: string;
  retry: string;
  /** 服务端报错卡上的「配置自己的 Key」出口（内置 AI 挂了时给用户一条活路） */
  errorConfigCta: string;
  yourQuestion: string;
  nonBareDelete: string;
  disclaimerShort: string;
  // AI 设置
  aiPanelTitle: string;
}

const ZH: ChatCopy = {
  // 回答来源与自检
  sourceUser: '（你的 Key）',
  sourceBuiltin: '（内置免费）',
  suspectStar: (name) => `星曜「${name}」`,
  suspectPalace: (name) => `宫位「${name}」`,
  suspectPlacement: (name) => `落宫「${name}」`,
  citedLabel: '依据：',
  overreachNotice: '这条回答里有些说法超出了你的盘面材料，请谨慎参考：',
  requestFailed: '追问请求失败，可能是网络波动或服务暂时不可用。请稍后重试。',
  // 非 bare 面板（盘页嵌入的追问）
  savedChats: (n) => `已存 ${n} 条对话`,
  localOnly: '对话只存在本机',
  collapse: '收起',
  expand: '展开',
  moreAskAria: '展开更多推荐追问',
  moreRecommended: '更多推荐',
  askUnavailable: '智能追问暂未开启。排盘与解读不受影响，可以照常查看。',
  openAiSettingsTitle: '点开 AI 设置',
  collapseChart: '收起命盘',
  viewChartInChat: '在对话里看这张盘',
  askAround: '围绕这张盘提问，回答只依据数据集原文。',
  placeholderContinue: '接着上面的对话继续问，例如：那财运方面呢？',
  exampleCareer: '例如：这份命盘在职业方向上有什么特点？',
  verifying: '正在查证…',
  followUp: '追问',
  hintVerifying: '查证进行中，请稍候。',
  hintContinue: '会带上这张盘之前的对话作为语境。也可 ⌘/Ctrl + Enter。',
  hintFirst: '提交后将依据本盘与数据集原文作答。也可 ⌘/Ctrl + Enter。',
  verifyingIntro: '正在核对盘面并检索数据集原文，通常需要几秒。',
  retry: '重试',
  errorConfigCta: '配置自己的 Key',
  yourQuestion: '你的问题',
  nonBareDelete: '删除这段对话',
  disclaimerShort: '回答只依据这张盘的已有材料推演：先给结论，再逐条讲依据。内容仅供参考，不构成医疗、法律或投资建议。',

  homeTitle: '和你的命盘聊聊',
  heroTitle: '紫微斗数',
  errorYear: '出生年份需在 1900–2100 之间。',
  errorMonth: '出生月份需在 1–12 之间。',
  errorDay: '出生日期需在 1–31 之间。',
  errorDate: '这个日期不存在，请检查年月日。',
  errorClock: '钟点需在 00:00–23:59 之间。',
  errorShichen: '时辰序号需在 0–11 之间。',
  navNew: '开始排盘',
  navAria: '主导航',
  navAbout: '关于与口径',
  newChatTitle: '新对话',
  askPanelTitle: '命盘追问',
  openAskAria: '打开追问助手',
  profilesAria: '选择档案',
  aiReadyAria: 'AI 已配置',
  aiSetupAria: '配置 AI',
  closeAskAria: '收起追问助手',
  askGlyph: '问',
  chartLink: '命盘',
  aiSettings: 'AI 设置',
  // 对话抽屉
  manageAria: '对话管理',
  closeSheetAria: '关闭对话抽屉',
  profileAiAria: '档案与 AI',
  conversationsOf: (name) => (name ? `${name}的对话` : '对话'),
  noConversationsHint: '还没有对话。挑一个话题开始，或自由聊聊。',
  currentChart: '当前这张盘',
  msgCount: (n) => `${n} 条`,
  today: '今天',
  yesterday: '昨天',
  newTopic: '开个新话题',
  deleteThread: '删除',
  deleteThreadConfirm: '删掉这段对话？删掉后无法找回。',
  deleteChart: '删除此档案',
  deleteChartConfirm: '删掉这张命盘档案？这张盘的本地对话记录仍保留在本机。',
  deepThinkOn: '● 深度思考：开',
  deepThinkOff: '○ 深度思考：关',
  deepThinkTitle: '深度思考：模型先推演再作答，应期、四化串联更严谨，但更慢；关闭后更快更省。仅对支持思考的模型（如 DeepSeek）生效。',
  captionStarted: '始于',
  emptyTitle: (name) => (name ? `想问问 ${name} 这张盘什么？` : '想问问这张盘什么？'),
  emptySub: '回答只依据这张盘的数据集原文 —— 材料里没写的，它会直说没有；对话只存在本机浏览器。',
  placeholderIdle: '问问感情、事业、今年如何…',
  placeholderPending: '正在回答中，可以先把下一句打好…',
  queued: (q) => `已排队：「${q}」—— 这条回答结束后自动发送`,
  maxNotice: (n) => `这段对话只保留最近 ${n} 条，再往下问会挤掉最前面的 —— 想留档请另开一段新对话。`,
  thinking: '正在思考…',
  thinkingNote: '（过程仅作参考，以最终回答为准）',
  emptyAnswer: '模型这次没有产出正文。可以直接点重试，或换一个不带思考的模型。',
  send: '发送',
  sendQueueTitle: '回答中 —— 点击把这句话排到下一条',
  newProfile: '＋ 新建档案',
  synastry: '双人合盘 →',
  noProfilesBody: '先排一张盘，之后打开首页就能直接接着聊。',
  noProfilesCta: '去排一张盘',
  incompleteBirth: '这个档案的生辰不完整，无法对话。请重新排盘。',
  aiPanelTitle: 'AI 设置',
};

const EN: ChatCopy = {
  // Answer source & self-check
  sourceUser: '(your key)',
  sourceBuiltin: '(built-in, free)',
  suspectStar: (name) => `star “${name}”`,
  suspectPalace: (name) => `palace “${name}”`,
  suspectPlacement: (name) => `placement “${name}”`,
  citedLabel: 'Based on: ',
  overreachNotice: 'Some claims go beyond your chart material — read with care:',
  requestFailed: 'The request failed — network hiccup or the service is down. Try again shortly.',
  // Non-bare panel (chart page)
  savedChats: (n) => `${n} saved`,
  localOnly: 'Conversations stay on this device',
  collapse: 'Collapse',
  expand: 'Expand',
  moreAskAria: 'Show more suggested questions',
  moreRecommended: 'More',
  askUnavailable: 'The chart assistant is off. Casting and reading still work.',
  openAiSettingsTitle: 'Open AI settings',
  collapseChart: 'Hide chart',
  viewChartInChat: 'View this chart in the chat',
  askAround: 'Ask about this chart — answers come only from the dataset.',
  placeholderContinue: 'Continue the conversation, e.g. “What about wealth?”',
  exampleCareer: 'E.g. “What are the career strengths in this chart?”',
  verifying: 'Verifying…',
  followUp: 'Ask',
  hintVerifying: 'Verifying against your chart — please wait.',
  hintContinue: 'Prior turns are sent as context. ⌘/Ctrl + Enter also works.',
  hintFirst: 'The answer draws on this chart and the dataset text. ⌘/Ctrl + Enter also works.',
  verifyingIntro: 'Checking your chart and retrieving the dataset text — usually a few seconds.',
  retry: 'Retry',
  errorConfigCta: 'Set up your own key',
  yourQuestion: 'Your question',
  nonBareDelete: 'Delete this chat',
  disclaimerShort: 'Answers are reasoned only from this chart’s existing material: conclusion first, then the basis. For reference only — not medical, legal or investment advice.',

  homeTitle: 'Talk with your chart',
  heroTitle: 'Ziwei Astrology',
  errorYear: 'Birth year must be between 1900 and 2100.',
  errorMonth: 'Birth month must be between 1 and 12.',
  errorDay: 'Birth day must be between 1 and 31.',
  errorDate: 'That date does not exist — check year, month and day.',
  errorClock: 'Clock time must be between 00:00 and 23:59.',
  errorShichen: 'The double-hour index must be between 0 and 11.',
  navNew: 'New chart',
  navAria: 'Main navigation',
  navAbout: 'About',
  newChatTitle: 'New chat',
  askPanelTitle: 'Ask about this chart',
  openAskAria: 'Open the chart assistant',
  profilesAria: 'Choose a profile',
  aiReadyAria: 'AI is configured',
  aiSetupAria: 'Set up AI',
  closeAskAria: 'Close the chart assistant',
  askGlyph: '?',
  chartLink: 'Chart',
  aiSettings: 'AI settings',
  // 对话抽屉
  manageAria: 'Conversations',
  closeSheetAria: 'Close conversations',
  profileAiAria: 'Profiles & AI',
  conversationsOf: (name) => (name ? `${name}’s conversations` : 'Conversations'),
  noConversationsHint: 'No conversations yet. Pick a topic to start, or just chat.',
  currentChart: 'Current chart',
  msgCount: (n) => `${n}`,
  today: 'today',
  yesterday: 'yesterday',
  newTopic: 'Start a topic',
  deleteThread: 'Delete',
  deleteThreadConfirm: 'Delete this conversation? This cannot be undone.',
  deleteChart: 'Delete this profile',
  deleteChartConfirm: 'Delete this chart profile? Its local conversations stay on this device.',
  deepThinkOn: '● Deep think: on',
  deepThinkOff: '○ Deep think: off',
  deepThinkTitle: 'Deep think: the model reasons before answering — more rigorous, slower. Off is faster. Only works with reasoning-capable models (e.g. DeepSeek).',
  captionStarted: 'since',
  emptyTitle: (name) => (name ? `What would you ask about ${name}’s chart?` : 'What would you ask about this chart?'),
  emptySub: 'Answers come only from this chart’s source texts — if the data doesn’t say it, it says so. Conversations stay on this device.',
  placeholderIdle: 'Love, career, this year…',
  placeholderPending: 'Answering — you can draft the next one…',
  queued: (q) => `Queued: "${q}" — sent automatically when this answer finishes`,
  maxNotice: (n) => `This chat keeps the last ${n} exchanges; older ones drop off — start a new conversation to keep a record.`,
  thinking: 'Thinking…',
  thinkingNote: '(reference only — the final answer is what counts)',
  emptyAnswer: 'The model produced no answer this time. Tap retry, or switch to a model without thinking.',
  send: 'Send',
  sendQueueTitle: 'Answering — tap to queue this message',
  newProfile: '＋ New profile',
  synastry: 'Synastry →',
  noProfilesBody: 'Cast a chart first — the home page then picks up right where you left off.',
  noProfilesCta: 'Cast a chart',
  incompleteBirth: 'This profile’s birth data is incomplete. Please cast the chart again.',
  aiPanelTitle: 'AI settings',
};

export const CHAT_COPY: Record<Lang, ChatCopy> = { zh: ZH, en: EN };
