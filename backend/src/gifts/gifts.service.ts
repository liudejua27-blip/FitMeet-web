import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Gift } from './gift.entity';

const DEFAULT_GIFTS: Gift[] = [
  { id: 'drink', name: '能量饮料', emoji: '🥤', price: 5 },
  { id: 'protein', name: '蛋白粉', emoji: '💪', price: 10 },
  { id: 'towel', name: '运动毛巾', emoji: '🧖', price: 3 },
  { id: 'medal', name: '金牌', emoji: '🥇', price: 20 },
  { id: 'fire', name: '燃脂之火', emoji: '🔥', price: 8 },
  { id: 'heart', name: '爱心', emoji: '❤️', price: 1 },
];

@Injectable()
export class GiftsService {
  constructor(
    @InjectRepository(Gift)
    private readonly giftRepo: Repository<Gift>,
  ) {}

  async findAll() {
    const count = await this.giftRepo.count();
    if (count === 0) {
      await this.giftRepo.save(DEFAULT_GIFTS);
    }
    return this.giftRepo.find({ order: { price: 'ASC' } });
  }
}
