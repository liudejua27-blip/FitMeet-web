import { Injectable } from '@nestjs/common';
import {
  LifeGraphFieldCategory,
  LifeGraphFieldSource,
} from './life-graph.enums';

export type LifeGraphExtractedField = {
  category: LifeGraphFieldCategory;
  fieldKey: string;
  fieldValue: unknown;
  source: LifeGraphFieldSource.AiInferred;
  confidence: number;
  reason: string;
  requiresUserConfirmation: true;
};

export type LifeGraphExtractionResult = {
  proposedFields: LifeGraphExtractedField[];
  summary: string;
  missingFields: Array<{
    category: LifeGraphFieldCategory;
    fieldKey: string;
    label: string;
    priority: 'high' | 'medium' | 'low';
  }>;
};

@Injectable()
export class LifeGraphExtractionService {
  extractFromChat(message: string): LifeGraphExtractionResult {
    const text = String(message ?? '').trim();
    const proposedFields = this.dedupe([
      ...this.extractLocation(text),
      ...this.extractAvailability(text),
      ...this.extractSports(text),
      ...this.extractSocialIntent(text),
      ...this.extractStyleAndBoundaries(text),
    ]);
    return {
      proposedFields,
      summary: this.summaryFor(proposedFields),
      missingFields: this.missingFieldsFor(proposedFields),
    };
  }

  private extractLocation(text: string): LifeGraphExtractedField[] {
    const fields: LifeGraphExtractedField[] = [];
    const city = this.firstMatch(text, [
      /(青岛|北京|上海|深圳|广州|杭州|成都|南京|武汉|西安|重庆|厦门|苏州|天津|长沙|大连|济南|郑州|合肥|福州|昆明)/,
      /\b(?:in|at|near)\s+([A-Z][A-Za-z\s]{1,40}?)(?:\s+(?:university|campus|area|nearby|on weekends|this weekend)|[,.，。]|$)/i,
    ]);
    if (city) {
      fields.push(
        this.field(
          LifeGraphFieldCategory.Identity,
          'city',
          city.replace(/大学|university/i, '').trim(),
          0.82,
          `用户提到所在城市或活动城市：${city}`,
        ),
      );
    }

    const nearbyArea = this.firstMatch(text, [
      /在([^，。,.]{2,30}(?:大学|校区|附近|商圈|体育馆|健身房))/,
      /(青岛大学附近|青岛大学|五四广场附近|奥帆中心附近|崂山校区|市南区|市北区|崂山区)/,
      /\bnear\s+([A-Z][A-Za-z\s]{2,50}(?:University|Campus|Gym|Park|Square))/i,
    ]);
    if (nearbyArea) {
      fields.push(
        this.field(
          LifeGraphFieldCategory.Identity,
          'nearbyArea',
          nearbyArea,
          0.92,
          `用户明确提到常活动区域：${nearbyArea}`,
        ),
      );
    }
    return fields;
  }

  private extractAvailability(text: string): LifeGraphExtractedField[] {
    const fields: LifeGraphExtractedField[] = [];
    const available = this.firstMatch(text, [
      /(周末(?:上午|中午|下午|晚上)?|工作日(?:上午|中午|下午|晚上)?|平日(?:上午|中午|下午|晚上)?)/,
      /\b(weekend afternoons?|weekends?|weekday evenings?|weekday mornings?)\b/i,
    ]);
    if (available) {
      const normalized = this.normalizeTime(available);
      fields.push(
        this.field(
          LifeGraphFieldCategory.Lifestyle,
          'availableTimes',
          [normalized],
          0.9,
          `用户提到可约时间：${available}`,
        ),
      );
      if (/周末|weekend/i.test(available)) {
        fields.push(
          this.field(
            LifeGraphFieldCategory.Lifestyle,
            'weekendAvailability',
            normalized,
            0.9,
            `用户提到周末可用时间：${available}`,
          ),
        );
      }
    }
    if (/不太?想晚上见|不接受晚上|晚上不方便|no night|not at night|avoid night/i.test(text)) {
      fields.push(
        this.field(
          LifeGraphFieldCategory.Lifestyle,
          'acceptsNightMeet',
          false,
          0.88,
          '用户表达不想晚上见面',
        ),
      );
    }
    return fields;
  }

  private extractSports(text: string): LifeGraphExtractedField[] {
    const sports: string[] = [];
    const sportsMap: Array<[RegExp, string]> = [
      [/跑步|running|run\b/i, '跑步'],
      [/健身|gym|workout|fitness/i, '健身'],
      [/羽毛球|badminton/i, '羽毛球'],
      [/骑行|cycling|bike/i, '骑行'],
      [/瑜伽|yoga/i, '瑜伽'],
      [/游泳|swimming|swim/i, '游泳'],
      [/徒步|hiking|hike/i, '徒步'],
    ];
    for (const [pattern, label] of sportsMap) {
      if (pattern.test(text) && !sports.includes(label)) sports.push(label);
    }
    if (sports.length === 0) return [];
    return [
      this.field(
        LifeGraphFieldCategory.FitnessActivity,
        'sportsPreferences',
        sports,
        0.9,
        `用户提到运动偏好：${sports.join('、')}`,
      ),
    ];
  }

  private extractSocialIntent(text: string): LifeGraphExtractedField[] {
    const fields: LifeGraphExtractedField[] = [];
    const goal = this.firstMatch(text, [
      /(想找[^，。,.]{2,40}(?:搭子|朋友|伙伴|教练|对象))/,
      /(找[^，。,.]{2,40}(?:搭子|朋友|伙伴|教练|对象))/,
      /\b(?:looking for|want to find)\s+([^,.，。]{2,60})/i,
    ]);
    if (goal) {
      fields.push(
        this.field(
          LifeGraphFieldCategory.SocialIntent,
          'currentSocialGoal',
          goal.replace(/^想/, ''),
          0.9,
          `用户表达当前社交目标：${goal}`,
        ),
      );
    }
    return fields;
  }

  private extractStyleAndBoundaries(text: string): LifeGraphExtractedField[] {
    const fields: LifeGraphExtractedField[] = [];
    if (/先聊聊?再约|先聊天后见面|先聊.*再见|chat first|talk first/i.test(text)) {
      fields.push(
        this.field(
          LifeGraphFieldCategory.SocialIntent,
          'preferredSocialStyle',
          '先聊天后见面',
          0.88,
          '用户表达希望先聊天确认，再安排见面',
        ),
      );
    }
    if (/公开地点|公共场所|人多|public place/i.test(text)) {
      fields.push(
        this.field(
          LifeGraphFieldCategory.FitnessActivity,
          'publicPlaceOnly',
          true,
          0.86,
          '用户表达偏好公开地点或公共场所',
        ),
      );
    }
    return fields;
  }

  private firstMatch(text: string, patterns: RegExp[]): string {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      const value = match?.[1] || match?.[0];
      if (value) return value.trim();
    }
    return '';
  }

  private normalizeTime(value: string): string {
    if (/weekend afternoon/i.test(value)) return '周末下午';
    if (/weekend/i.test(value)) return '周末';
    if (/weekday evening/i.test(value)) return '工作日晚上';
    if (/weekday morning/i.test(value)) return '工作日上午';
    return value;
  }

  private field(
    category: LifeGraphFieldCategory,
    fieldKey: string,
    fieldValue: unknown,
    confidence: number,
    reason: string,
  ): LifeGraphExtractedField {
    return {
      category,
      fieldKey,
      fieldValue,
      source: LifeGraphFieldSource.AiInferred,
      confidence,
      reason,
      requiresUserConfirmation: true,
    };
  }

  private dedupe(fields: LifeGraphExtractedField[]): LifeGraphExtractedField[] {
    const seen = new Set<string>();
    return fields.filter((field) => {
      const key = `${field.category}:${field.fieldKey}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private summaryFor(fields: LifeGraphExtractedField[]): string {
    const area = fields.find((item) => item.fieldKey === 'nearbyArea')?.fieldValue;
    const time = fields.find((item) => item.fieldKey === 'weekendAvailability')?.fieldValue;
    const sports = fields.find((item) => item.fieldKey === 'sportsPreferences')?.fieldValue;
    const goal = fields.find((item) => item.fieldKey === 'currentSocialGoal')?.fieldValue;
    const parts = [
      area ? `你常在${area}活动` : '',
      time ? `${time}比较有空` : '',
      Array.isArray(sports) && sports.length ? `偏好${sports.join('、')}` : '',
      goal ? `当前主要想${goal}` : '',
    ].filter(Boolean);
    return parts.length
      ? `我从你的描述中识别到：${parts.join('，')}。`
      : '我还没有识别到足够明确的 Life Graph 信息，可以继续补充城市、可约时间、运动偏好和边界。';
  }

  private missingFieldsFor(fields: LifeGraphExtractedField[]) {
    const keys = new Set(fields.map((item) => `${item.category}:${item.fieldKey}`));
    return [
      {
        category: LifeGraphFieldCategory.Identity,
        fieldKey: 'city',
        label: '城市',
        priority: 'high' as const,
      },
      {
        category: LifeGraphFieldCategory.Lifestyle,
        fieldKey: 'availableTimes',
        label: '可约时间',
        priority: 'high' as const,
      },
      {
        category: LifeGraphFieldCategory.FitnessActivity,
        fieldKey: 'sportsPreferences',
        label: '运动偏好',
        priority: 'high' as const,
      },
      {
        category: LifeGraphFieldCategory.SocialIntent,
        fieldKey: 'currentSocialGoal',
        label: '当前社交目标',
        priority: 'high' as const,
      },
    ].filter((item) => !keys.has(`${item.category}:${item.fieldKey}`));
  }
}
