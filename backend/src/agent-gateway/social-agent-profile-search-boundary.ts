import { cleanDisplayText } from '../common/display-text.util';

export function hasSocialAgentImmediateSearchRequest(message: string): boolean {
  const text = cleanDisplayText(message, '').trim().toLowerCase();
  if (!text) return false;
  return (
    /(?:帮我找|给我找|帮我搜索|帮我搜|搜索|搜一下|搜一搜).{0,24}(?:人|用户|候选|搭子|伙伴|朋友|同校|同城|附近)/i.test(
      text,
    ) ||
    /(?:现在|马上|立即|直接|先).{0,12}(?:找|搜索|搜|推荐).{0,24}(?:人|用户|候选|搭子|伙伴|朋友|同校|同城|附近)/i.test(
      text,
    ) ||
    /(?:推荐|返回).{0,16}(?:真实用户|候选人|候选|搭子|合适的人|同城朋友)/i.test(
      text,
    )
  );
}
