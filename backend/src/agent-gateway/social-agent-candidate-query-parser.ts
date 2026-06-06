import { cleanDisplayText } from '../common/display-text.util';

const KNOWN_ACTIVITY_TAGS: Array<[string, RegExp]> = [
  ['咖啡', /咖啡|coffee/i],
  ['拍照', /拍照|摄影|photo/i],
  ['跑步', /跑步|running|跑团/i],
  ['羽毛球', /羽毛球|badminton/i],
  ['健身', /健身|撸铁|fitness|gym/i],
  ['瑜伽', /瑜伽|yoga/i],
  ['徒步', /徒步|hiking/i],
  ['骑行', /骑行|cycling/i],
  ['citywalk', /city\s*walk|citywalk|城市漫步|散步/i],
  ['学习', /学习|自习|study/i],
  ['电影', /电影|movie/i],
];

export function extractCandidateActivity(text: string): string {
  return extractCandidateTags(text)[0] ?? '';
}

export function extractCandidateTags(text: string): string[] {
  const source = cleanDisplayText(text, '');
  if (!source) return [];
  return KNOWN_ACTIVITY_TAGS.filter(([, regex]) => regex.test(source)).map(
    ([tag]) => tag,
  );
}

export function extractCandidateTime(text: string): string {
  if (/周末|星期六|星期日|周六|周日/i.test(text)) return '周末';
  if (/晚上|夜间/i.test(text)) return '晚上';
  if (/下午/i.test(text)) return '下午';
  if (/上午|早上/i.test(text)) return '上午';
  return '';
}
