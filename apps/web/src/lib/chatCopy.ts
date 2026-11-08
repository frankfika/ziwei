/**
 * 会话页的界面文案（中文 / English）—— 导航、会话头、对话抽屉、空态、输入区。
 * 盘的原文与回答是中文数据集产物，不走这里；这里只管界面骨架。
 */

import type { Lang } from './quotaCopy';

export interface ChatCopy {
  // 导航
  navNew: string;
  navAbout: string;
  // 会话头
  newChatTitle: string;
  chartLink: string;
  aiSettings: string;
  // 对话抽屉
  manageAria: string;
  closeSheetAria: string;
  archivedLabel: string;
  profileAiAria: string;
  conversationsOf: (name?: string) => string;
  msgCount: (n: number) => string;
  today: string;
  yesterday: string;
  archived: (n: number) => string;
  newTopic: string;
  freeChat: string;
  clearThread: string;
  clearConfirm: string;
  archiveThread: string;
  archiveTitle: string;
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
  noProfilesTitle: string;
  noProfilesBody: string;
  noProfilesCta: string;
  incompleteBirth: string;
  // AI 设置
  aiPanelTitle: string;
}

const ZH: ChatCopy = {
  navNew: '开始排盘',
  navAbout: '关于与口径',
  newChatTitle: '新对话',
  chartLink: '命盘',
  aiSettings: 'AI 设置',
  // 对话抽屉
  manageAria: '对话管理',
  closeSheetAria: '关闭对话抽屉',
  archivedLabel: '已归档',
  profileAiAria: '档案与 AI',
  conversationsOf: (name) => (name ? `${name}的对话` : '对话'),
  msgCount: (n) => `${n} 条`,
  today: '今天',
  yesterday: '昨天',
  archived: (n) => `已归档 ${n}`,
  newTopic: '开个新话题',
  freeChat: '自由聊聊',
  clearThread: '清空当前对话',
  clearConfirm: '清空当前这段对话？其他对话会保留。',
  archiveThread: '归档这段对话',
  archiveTitle: '从对话列表收起来，可在「已归档」里找回',
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
  noProfilesTitle: '还没有档案',
  noProfilesBody: '先排一张盘，之后打开首页就能直接接着聊。',
  noProfilesCta: '去排一张盘',
  incompleteBirth: '这个档案的生辰不完整，无法对话。请重新排盘。',
  aiPanelTitle: 'AI 设置',
};

const EN: ChatCopy = {
  navNew: 'New chart',
  navAbout: 'About',
  newChatTitle: 'New chat',
  chartLink: 'Chart',
  aiSettings: 'AI settings',
  // 对话抽屉
  manageAria: 'Conversations',
  closeSheetAria: 'Close conversations',
  archivedLabel: 'Archived',
  profileAiAria: 'Profiles & AI',
  conversationsOf: (name) => (name ? `${name}’s conversations` : 'Conversations'),
  msgCount: (n) => `${n}`,
  today: 'today',
  yesterday: 'yesterday',
  archived: (n) => `Archived ${n}`,
  newTopic: 'Start a topic',
  freeChat: 'Just chat',
  clearThread: 'Clear this chat',
  clearConfirm: 'Clear the current conversation? Other conversations are kept.',
  archiveThread: 'Archive this chat',
  archiveTitle: 'Hide from the list; restore anytime under "Archived"',
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
  noProfilesTitle: 'No profile yet',
  noProfilesBody: 'Cast a chart first — the home page then picks up right where you left off.',
  noProfilesCta: 'Cast a chart',
  incompleteBirth: 'This profile’s birth data is incomplete. Please cast the chart again.',
  aiPanelTitle: 'AI settings',
};

export const CHAT_COPY: Record<Lang, ChatCopy> = { zh: ZH, en: EN };
