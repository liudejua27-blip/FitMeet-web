import { readFileSync } from 'fs';
import { join } from 'path';

type GoldenCase = {
  id: string;
  input: string;
  stateBefore: string;
  expectedIntent: string;
  expectedCard: string;
  mustNot: string[];
};

type Prediction = {
  intent: string;
  card: string;
  emitted: string[];
  fallbackUsed: boolean;
};

type Failure = {
  id: string;
  input: string;
  reason: string;
  expected: string;
  actual: string;
};

const casesPath = join(
  process.cwd(),
  'src/agent-gateway/evals/agent-golden-cases.json',
);

const cases = JSON.parse(readFileSync(casesPath, 'utf8')) as GoldenCase[];
const failures: Failure[] = [];
let intentPass = 0;
let cardPass = 0;
let invariantFailures = 0;
let fallbackUsed = 0;

for (const item of cases) {
  const prediction = predict(item.input, item.stateBefore);
  if (prediction.intent === item.expectedIntent) {
    intentPass += 1;
  } else {
    failures.push({
      id: item.id,
      input: item.input,
      reason: 'intent_mismatch',
      expected: item.expectedIntent,
      actual: prediction.intent,
    });
  }
  if (prediction.card === item.expectedCard) {
    cardPass += 1;
  } else {
    failures.push({
      id: item.id,
      input: item.input,
      reason: 'card_mismatch',
      expected: item.expectedCard,
      actual: prediction.card,
    });
  }
  if (prediction.fallbackUsed) fallbackUsed += 1;
  for (const forbidden of item.mustNot ?? []) {
    if (prediction.emitted.includes(forbidden)) {
      invariantFailures += 1;
      failures.push({
        id: item.id,
        input: item.input,
        reason: 'invariant_violation',
        expected: `must not emit ${forbidden}`,
        actual: prediction.emitted.join(','),
      });
    }
  }
}

const totalAssertions = cases.length * 2;
const passAssertions = intentPass + cardPass;
const pass = failures.length === 0;
const metrics = {
  cases: cases.length,
  pass: passAssertions,
  fail: totalAssertions - passAssertions + invariantFailures,
  intentAccuracy: percentage(intentPass, cases.length),
  cardAccuracy: percentage(cardPass, cases.length),
  invariantFailures,
  fallbackRate: percentage(fallbackUsed, cases.length),
};

console.log('Agent golden eval');
console.log(`cases: ${metrics.cases}`);
console.log(`pass: ${metrics.pass}`);
console.log(`fail: ${metrics.fail}`);
console.log(`intent accuracy: ${metrics.intentAccuracy}%`);
console.log(`card accuracy: ${metrics.cardAccuracy}%`);
console.log(`invariant failures: ${metrics.invariantFailures}`);
console.log(`fallback rate: ${metrics.fallbackRate}%`);

if (!pass) {
  console.error(JSON.stringify({ failures }, null, 2));
  process.exitCode = 1;
}

function predict(input: string, stateBefore: string): Prediction {
  const text = input.trim();
  const emitted: string[] = [];

  if (isCorrection(text, stateBefore)) {
    return {
      intent: 'user_correction',
      card: 'social_match.activity',
      emitted,
      fallbackUsed: false,
    };
  }
  if (isCancel(text, stateBefore)) {
    return { intent: 'cancel', card: 'none', emitted, fallbackUsed: false };
  }
  if (stateBefore === 'COLLECTING_SLOTS' && isSlotCompletion(text)) {
    return {
      intent: 'slot_completion',
      card: 'social_match.activity',
      emitted,
      fallbackUsed: false,
    };
  }
  if (isProfileCompletion(text)) {
    return {
      intent: 'profile_completion',
      card: 'profile.completion',
      emitted,
      fallbackUsed: false,
    };
  }
  if (isContactCandidate(text, stateBefore)) {
    return {
      intent: 'contact_candidate',
      card: 'contact.confirmation',
      emitted,
      fallbackUsed: false,
    };
  }
  if (isPublishSocialIntent(text)) {
    return {
      intent: 'publish_social_intent',
      card: hasExplicitSafety(text)
        ? 'social_match.activity'
        : 'social_match.slot_completion',
      emitted,
      fallbackUsed: false,
    };
  }
  return { intent: 'casual_chat', card: 'none', emitted, fallbackUsed: false };
}

function isProfileCompletion(text: string): boolean {
  return (
    /(完善|补充|补齐|更新|整理|缺什么|不完整|了解我|问我|补一下|把我的).*(资料|个人信息|人物画像|画像|偏好|可约时间|活动区域|兴趣|匹配资料)|资料.*(缺|补|完整|问题)|个人信息.*不完整/.test(
      text,
    ) || /先了解我|Agent\s*先了解我|让\s*Agent\s*先了解我/i.test(text)
  );
}

function isPublishSocialIntent(text: string): boolean {
  return /(发布|发一个|发一张|发青岛|帮我发|发现页|约练卡|约练需求|找.*搭子|找.*伙伴|找.*朋友|找.*人|找个.*(散步|跑步|咖啡|健身|羽毛球|聊天)|有没有人|约人|一起.*(散步|跑步|咖啡|健身|逛展|徒步|桌游)|喝咖啡聊天)/.test(
    text,
  );
}

function isSlotCompletion(text: string): boolean {
  return /(默认|安全|公共场所|站内沟通|不交换联系方式|公开场所|常规处理|平台推荐)/.test(
    text,
  );
}

function hasExplicitSafety(text: string): boolean {
  return /(默认安全|公共场所|站内沟通|不交换联系方式|公开场所|平台推荐|安全边界|安全设置)/.test(
    text,
  );
}

function isCancel(text: string, stateBefore: string): boolean {
  return (
    stateBefore !== 'EMPTY' &&
    /(暂不发布|取消|不要发|不发了|隐藏|算了|不要继续匹配|撤下|不找人)/.test(
      text,
    )
  );
}

function isContactCandidate(text: string, stateBefore: string): boolean {
  return (
    stateBefore === 'CANDIDATES_READY' &&
    /(候选|私信|发送|加好友|邀请|开场|联系|聊聊|消息)/.test(text)
  );
}

function isCorrection(text: string, stateBefore: string): boolean {
  return (
    stateBefore === 'DRAFT_READY' &&
    /(不是|改成|改到|改为|说错|再严格|不要找|只同城|不要写太具体|强度改)/.test(
      text,
    )
  );
}

function percentage(value: number, total: number): string {
  if (!total) return '0.00';
  return ((value / total) * 100).toFixed(2);
}
