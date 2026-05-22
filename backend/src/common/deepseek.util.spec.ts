import { DEFAULT_DEEPSEEK_MODEL, resolveDeepSeekModel } from './deepseek.util';

describe('resolveDeepSeekModel', () => {
  it('uses the supported flash model by default', () => {
    expect(resolveDeepSeekModel()).toBe(DEFAULT_DEEPSEEK_MODEL);
    expect(resolveDeepSeekModel('')).toBe(DEFAULT_DEEPSEEK_MODEL);
  });

  it('normalizes the old pre-release v4 model name', () => {
    expect(resolveDeepSeekModel('deepseek-v4')).toBe(DEFAULT_DEEPSEEK_MODEL);
  });

  it('keeps an explicit supported model name', () => {
    expect(resolveDeepSeekModel(' deepseek-v4-pro ')).toBe('deepseek-v4-pro');
  });
});
