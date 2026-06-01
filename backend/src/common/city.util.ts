const KNOWN_CHINESE_CITIES = [
  '北京',
  '上海',
  '广州',
  '深圳',
  '杭州',
  '成都',
  '重庆',
  '南京',
  '苏州',
  '武汉',
  '西安',
  '长沙',
  '郑州',
  '天津',
  '青岛',
  '济南',
  '厦门',
  '福州',
  '宁波',
  '大连',
  '沈阳',
  '合肥',
  '昆明',
  '佛山',
  '东莞',
  '无锡',
  '珠海',
  '中山',
  '惠州',
  '南昌',
  '南宁',
  '贵阳',
  '太原',
  '石家庄',
  '哈尔滨',
  '长春',
  '兰州',
  '海口',
  '三亚',
  '呼和浩特',
  '乌鲁木齐',
  '拉萨',
  '银川',
  '西宁',
  '香港',
  '澳门',
  '台北',
];

const QUESTION_OR_PROMPT_PATTERN =
  /(城市是哪里|城市在哪里|在哪个城市|城市是哪|优先匹配|优先找|匹配城市|目标城市|所在城市|常驻城市|希望城市|城市|地区|地点|位置|哪里|哪儿|哪座|附近|公开地点|低压力|不限)/;

const CITY_PREFIX_PATTERN =
  /^(?:在|想在|希望在|优先在|优先匹配|优先找|匹配|城市|地区|地点|位置|目标城市|所在城市|常驻城市|城市是哪里|城市在哪里|在哪个城市|城市是哪)[：:，,\s-]*/;

function normalizeCityToken(value: string): string {
  return (
    value
      // eslint-disable-next-line no-useless-escape
      .replace(/[“”"'\[\]【】()（）{}<>《》]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/市$/u, '')
  );
}

export function sanitizeCity(raw: unknown, fallback = ''): string {
  const text = typeof raw === 'string' ? raw.trim() : '';
  const safeFallback = typeof fallback === 'string' ? fallback.trim() : '';
  if (!text) return normalizeCityToken(safeFallback);

  const normalized = normalizeCityToken(text);
  if (!normalized) return normalizeCityToken(safeFallback);

  const known = KNOWN_CHINESE_CITIES.find((city) => normalized.includes(city));
  if (known) return known;

  let candidate = normalized;
  for (let i = 0; i < 4; i += 1) {
    const next = candidate.replace(CITY_PREFIX_PATTERN, '').trim();
    if (next === candidate) break;
    candidate = next;
  }

  candidate = normalizeCityToken(candidate.split(/[，,。；;、\n]/u)[0] ?? '');
  if (!candidate) return normalizeCityToken(safeFallback);

  if (QUESTION_OR_PROMPT_PATTERN.test(candidate)) {
    return normalizeCityToken(safeFallback);
  }

  if (/^[\u4e00-\u9fa5]{2,12}$/u.test(candidate)) return candidate;
  if (/^[A-Za-z][A-Za-z\s.-]{1,48}$/.test(candidate)) return candidate.trim();

  return normalizeCityToken(safeFallback);
}

export function extractKnownCity(raw: unknown): string {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return '';
  const normalized = normalizeCityToken(text);
  return KNOWN_CHINESE_CITIES.find((city) => normalized.includes(city)) ?? '';
}
