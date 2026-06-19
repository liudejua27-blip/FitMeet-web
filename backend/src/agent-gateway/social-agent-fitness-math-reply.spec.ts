import { socialAgentFitnessMathReply } from './social-agent-fitness-math-reply';

describe('socialAgentFitnessMathReply', () => {
  it('answers pace and calorie questions without side effects', () => {
    expect(socialAgentFitnessMathReply('5公里30分钟配速是多少？')).toContain(
      '平均配速约 6',
    );
    expect(socialAgentFitnessMathReply('5公里30分钟配速是多少？')).toContain(
      '不会写入你的画像',
    );

    const calorieReply = socialAgentFitnessMathReply(
      '70kg 跑步 30分钟大概消耗多少热量',
    );
    expect(calorieReply).toContain('消耗约 291 千卡');
    expect(calorieReply).toContain('非医疗参考');
  });

  it('answers BMI, heart-rate zone, and training-load questions deterministically', () => {
    const bmiReply = socialAgentFitnessMathReply(
      '身高175cm，体重70kg，体重指数多少？',
    );
    expect(bmiReply).toContain('BMI 约 22.9');
    expect(bmiReply).toContain('正常区间');

    const heartRateReply =
      socialAgentFitnessMathReply('30岁跑步心率区间怎么估算？');
    expect(heartRateReply).toContain('最大心率约 190 次/分');
    expect(heartRateReply).toContain('有氧基础区约 114-133 次/分');

    const trainingLoadReply = socialAgentFitnessMathReply(
      '每周跑3次，每次5公里，训练量是多少？',
    );
    expect(trainingLoadReply).toContain('每周总距离约 15 公里');
    expect(trainingLoadReply).toContain('不会创建活动或写入画像');
  });

  it('falls back to a capability answer that forbids search, action, and profile writes', () => {
    const reply = socialAgentFitnessMathReply('你可以帮我算什么？');

    expect(reply).toContain('轻量运动计算');
    expect(reply).toContain('不会写入画像');
    expect(reply).toContain('不会触发找人、发消息或创建活动');
  });
});
