import type { Meet } from '../types';

export function filterDisplayableMeets(meets: Meet[]) {
  return meets.filter(isDisplayableMeet);
}

function isDisplayableMeet(meet: Meet) {
  return (
    !isMarkedMock(meet) &&
    !isTestLikeText([meet.username, meet.title, meet.desc].filter(Boolean).join(' '))
  );
}

function isMarkedMock(value: unknown) {
  return (
    typeof value === 'object' &&
    value !== null &&
    'mock' in value &&
    (value as { mock?: unknown }).mock === true
  );
}

function isTestLikeText(value: string) {
  return /E2E|测试|test|mock|真实\s*API|免费约练测试|一周三炮|(?:^|\s)[\u4e00-\u9fa5]{1,2}\d{1,6}(?:\s|$)|[甲乙丙丁]\d{3,}/iu.test(
    value,
  );
}
