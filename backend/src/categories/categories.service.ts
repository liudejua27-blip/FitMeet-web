import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './category.entity';

const DEFAULT_CATEGORIES: Category[] = [
  { id: 'all', label: '全部' },
  { id: 'meet', label: '📍 约练邀请' },
  { id: 'log', label: '📸 健身日记' },
  { id: 'gym', label: '🏋️ 健身房' },
  { id: 'run', label: '🏃 跑步' },
  { id: 'yoga', label: '🧘 瑜伽' },
  { id: 'outdoor', label: '🌿 户外' },
  { id: 'swim', label: '🏊 游泳' },
  { id: 'martial', label: '🥊 武术' },
  { id: 'ball', label: '⚽ 球类' },
];

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
  ) {}

  async findAll() {
    const count = await this.categoryRepo.count();
    if (count === 0) {
      await this.categoryRepo.save(DEFAULT_CATEGORIES);
    }
    return this.categoryRepo.find();
  }
}
