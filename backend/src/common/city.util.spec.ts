import { extractKnownCity, sanitizeCity } from './city.util';

describe('sanitizeCity', () => {
  it('extracts a real city from prompt-like text', () => {
    expect(sanitizeCity('城市是哪里：优先匹配青岛附近')).toBe('青岛');
    expect(sanitizeCity('优先匹配 北京 公开地点')).toBe('北京');
  });

  it('normalizes common city suffixes', () => {
    expect(sanitizeCity('青岛市')).toBe('青岛');
  });

  it('drops question-only city values', () => {
    expect(sanitizeCity('城市是哪里')).toBe('');
    expect(sanitizeCity('优先匹配公开地点低压力')).toBe('');
  });

  it('keeps clean English city names', () => {
    expect(sanitizeCity('Shanghai')).toBe('Shanghai');
    expect(sanitizeCity('New York')).toBe('New York');
  });

  it('uses fallback when the value is not a city', () => {
    expect(sanitizeCity(null, '青岛')).toBe('青岛');
    expect(sanitizeCity('城市在哪里', '北京')).toBe('北京');
  });

  it('extracts known cities from natural language without treating the full sentence as a city', () => {
    expect(extractKnownCity('帮我找一个今晚在青岛轻松跑步的人')).toBe('青岛');
    expect(extractKnownCity('今晚轻松跑步')).toBe('');
  });
});
