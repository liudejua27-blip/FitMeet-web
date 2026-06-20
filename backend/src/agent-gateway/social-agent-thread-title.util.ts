import { cleanDisplayText } from '../common/display-text.util';
import { explicitlyRejectsSocialExecution } from './social-agent-social-intent-gate';

const GENERIC_THREAD_TITLE_PATTERNS = [
  /^FitMeet Social Agent 聊天任务$/i,
  /^FitMeet Social Agent 聊天$/i,
  /^FitMeet Social Agent 聊天在.+$/i,
  /^FitMeet Social Agent chat(?: at| on).+$/i,
  /^FitMeet Agent 对话$/i,
  /^新对话$/i,
  /^未命名对话$/i,
];

export function isGenericSocialAgentThreadTitle(value: string | null | undefined) {
  const title = cleanDisplayText(value, '').trim();
  if (!title) return true;
  return GENERIC_THREAD_TITLE_PATTERNS.some((pattern) => pattern.test(title));
}

export function inferSocialAgentThreadTitle(input: {
  title?: string | null;
  goal?: string | null;
  firstMessage?: string | null;
}) {
  const explicitTitle = cleanDisplayText(input.title, '').trim();
  if (explicitTitle && !isGenericSocialAgentThreadTitle(explicitTitle)) {
    return explicitTitle.slice(0, 40);
  }

  const text = cleanDisplayText(input.firstMessage, '').trim() || cleanDisplayText(input.goal, '').trim();
  if (!text) return '新对话';
  if (isGenericUserPrompt(text)) return '普通聊天：功能咨询';

  const compact = text.replace(/\s+/g, ' ').replace(/[。！？!?]+$/g, '').trim();
  if (shouldUseOrdinaryChatTitle(compact)) {
    return ordinaryChatTitle(compact);
  }
  const location = locationLabel(compact);
  const activity = activityLabel(compact);
  const time = timeLabel(compact);

  if (activity) {
    return [time, location, activity].filter(Boolean).join('').slice(0, 40) || `${activity}搭子`;
  }
  if (/(找人|认识|交友|朋友|同频|理想型|搭子)/.test(compact)) {
    return `${location ?? ''}认识新朋友`.slice(0, 40);
  }

  return ordinaryChatTitle(compact);
}

function isGenericUserPrompt(text: string) {
  return /^(你有什么功能|有什么功能|你能做什么|介绍一下|help|hi|hello|你好|在吗|测试)$/i.test(
    text.trim(),
  );
}

function matchFirst(text: string, pattern: RegExp) {
  return text.match(pattern)?.[1] ?? null;
}

function locationLabel(text: string) {
  const landmark = matchFirst(
    text,
    /(青岛大学|五四广场|奥帆中心|栈桥|八大关|浮山|小麦岛|石老人|金沙滩)/,
  );
  if (landmark) return landmark;
  return matchFirst(
    text,
    /(崂山区|市南区|市北区|李沧区|黄岛区|西海岸|上海|北京|深圳|广州|杭州|成都|青岛|南京|武汉|西安|重庆|厦门|苏州|天津)/,
  );
}

function timeLabel(text: string) {
  if (/周末|星期六|星期日|周六|周日/.test(text)) return '周末';
  if (/今晚|今天晚上|晚上/.test(text)) return '今晚';
  if (/明天/.test(text)) return '明天';
  return null;
}

function activityLabel(text: string) {
  if (/羽毛球/.test(text)) return '羽毛球搭子';
  if (/篮球/.test(text)) return '篮球搭子';
  if (/跑步|慢跑|夜跑|晨跑/.test(text)) return '跑步搭子';
  if (/健身|力量|撸铁|训练/.test(text)) return '健身搭子';
  if (/户外|徒步|露营|爬山/.test(text)) return '户外搭子';
  if (/散步|city\s*walk|城市漫步/i.test(text)) return '散步搭子';
  if (/咖啡|聊天/i.test(text)) return '轻松聊天';
  if (/瑜伽/.test(text)) return '瑜伽搭子';
  if (/活动|参加/.test(text)) return '活动机会';
  return null;
}

function shouldUseOrdinaryChatTitle(text: string) {
  if (explicitlyRejectsSocialExecution(text)) return true;
  return /(训练恢复|恢复训练|训练安排|拉伸|放松|伤后恢复|休息日|恢复建议)/i.test(
    text,
  );
}

function ordinaryChatTitle(text: string) {
  if (/训练恢复|恢复训练|训练安排|恢复建议/i.test(text)) {
    return '普通聊天：训练恢复建议';
  }
  return `普通聊天：${text.slice(0, 16)}`.slice(0, 40);
}
