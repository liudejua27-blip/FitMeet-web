export function classifyWorkoutIntent(
  message: string,
): 'workout' | 'negative' | 'unknown' {
  const text = message.trim();

  if (
    /(不要|不想|先不|暂时不|不用).{0,12}(找人|约练|匹配|搭子|推荐)/i.test(text)
  ) {
    return 'negative';
  }

  if (
    /(约练|运动搭子|跑步搭子|健身搭子|羽毛球搭子|篮球搭子|一起跑步|一起运动|找人跑步|找人健身|附近跑步|周末运动)/i.test(
      text,
    )
  ) {
    return 'workout';
  }

  if (
    /(跑步|慢跑|健身|羽毛球|篮球|散步|徒步|骑行|瑜伽|游泳)/i.test(text) &&
    /(今天|今晚|明天|周末|下午|晚上|附近|大学|公园|体育馆|健身房|青岛|北京|上海|杭州)/i.test(
      text,
    )
  ) {
    return 'workout';
  }

  return 'unknown';
}
