import {
  extractCandidateActivity,
  extractCandidateTags,
  extractCandidateTime,
} from './social-agent-candidate-query-parser';

describe('social agent candidate query parser', () => {
  it('extracts activity tags from Chinese and English mixed requests', () => {
    expect(
      extractCandidateTags('周末想 running、coffee，然后 city walk 拍照'),
    ).toEqual(['咖啡', '拍照', '跑步', 'citywalk']);
    expect(extractCandidateTags('晚上 badminton + yoga')).toEqual([
      '羽毛球',
      '瑜伽',
    ]);
  });

  it('uses the first recognized tag as the inferred activity type', () => {
    expect(extractCandidateActivity('找人周末喝咖啡再拍照')).toBe('咖啡');
    expect(extractCandidateActivity('一起 hiking 或 cycling')).toBe('徒步');
    expect(extractCandidateActivity('只是想认识新朋友')).toBe('');
  });

  it('extracts stable coarse time preferences', () => {
    expect(extractCandidateTime('这周六下午跑步')).toBe('周末');
    expect(extractCandidateTime('今晚或晚上都行')).toBe('晚上');
    expect(extractCandidateTime('下午 coffee chat')).toBe('下午');
    expect(extractCandidateTime('早上 gym')).toBe('上午');
    expect(extractCandidateTime('时间之后再说')).toBe('');
  });
});
