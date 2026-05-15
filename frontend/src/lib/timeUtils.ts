/**
 * 时间工具函数
 * 将绝对时间转换为相对时间显示
 */

export function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffDays = Math.floor(diffMs / 86400000);

  // 已过期
  if (diffMs < 0) {
    return '已结束';
  }

  // 2小时内
  if (diffMins < 120) {
    if (diffMins < 1) return '即将开始';
    return `${diffMins}分钟后开始`;
  }

  // 今天
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    const hours = date.getHours();
    const mins = date.getMinutes();
    return `今晚 ${hours}:${mins.toString().padStart(2, '0')}`;
  }

  // 明天
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date.toDateString() === tomorrow.toDateString()) {
    const hours = date.getHours();
    const mins = date.getMinutes();
    return `明天 ${hours}:${mins.toString().padStart(2, '0')}`;
  }

  // 本周内
  if (diffDays < 7) {
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const hours = date.getHours();
    const mins = date.getMinutes();
    return `${weekdays[date.getDay()]} ${hours}:${mins.toString().padStart(2, '0')}`;
  }

  // 更远的日期
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/**
 * 获取倒计时文本
 */
export function getCountdown(dateString: string): string | null {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMs < 0) return null;
  if (diffMins < 30) return `${diffMins}分钟后开始`;
  return null;
}

/**
 * 计算距离显示
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}
