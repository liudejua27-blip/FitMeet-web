import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Coach } from './coach.entity';
import { Review } from './review.entity';
import { Follow } from '../friends/follow.entity';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class CoachesService {
  constructor(
    @InjectRepository(Coach)
    private readonly coachRepo: Repository<Coach>,
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
    @InjectRepository(Follow)
    private readonly followRepo: Repository<Follow>,
  ) {}

  async findAll(specialty?: string) {
    const qb = this.coachRepo.createQueryBuilder('coach')
      .leftJoinAndSelect('coach.user', 'user')
      .orderBy('coach.rating', 'DESC');

    if (specialty && specialty !== 'all') {
      qb.where('coach.specialtyCode = :specialty', { specialty });
    }

    const coaches = await qb.getMany();
    return Promise.all(coaches.map(c => this.toCoachResponse(c)));
  }

  async findOne(id: number) {
    const coach = await this.coachRepo.findOne({
      where: { id },
      relations: ['user'],
    });
    if (!coach) throw new NotFoundException('教练不存在');

    const reviews = await this.reviewRepo.find({
      where: { coachId: id },
      relations: ['user'],
      order: { createdAt: 'DESC' },
      take: 20,
    });

    const response = await this.toCoachResponse(coach);
    return {
      ...response,
      reviewList: reviews.map(r => ({
        id: r.id,
        username: r.user?.name || '',
        avatar: r.user?.avatar || '',
        color: r.user?.color || '#38BDF8',
        rating: Number(r.rating),
        text: r.text,
        date: r.createdAt.toISOString().split('T')[0],
        tags: r.tags || [],
      })),
    };
  }

  async addReview(coachId: number, userId: number, dto: CreateReviewDto) {
    const coach = await this.coachRepo.findOne({ where: { id: coachId } });
    if (!coach) throw new NotFoundException('教练不存在');

    const review = this.reviewRepo.create({
      ...dto,
      coachId,
      userId,
      tags: dto.tags || [],
    });
    await this.reviewRepo.save(review);

    // Update coach rating
    const { avg } = await this.reviewRepo
      .createQueryBuilder('review')
      .select('AVG(review.rating)', 'avg')
      .where('review.coachId = :coachId', { coachId })
      .getRawOne();
    const count = await this.reviewRepo.count({ where: { coachId } });

    await this.coachRepo.update(coachId, {
      rating: parseFloat(avg) || 0,
      reviewCount: count,
    });

    return { success: true };
  }

  private async toCoachResponse(coach: Coach) {
    const user = coach.user;
    const followersCount = user
      ? await this.followRepo.count({ where: { followingId: user.id } })
      : 0;

    return {
      id: coach.id,
      userId: user?.id,
      name: user?.name || '',
      cover: coach.cover,
      coverBg: coach.coverBg,
      color: user?.color || '#C8FF00',
      specialty: coach.specialty,
      experience: coach.experience,
      tags: coach.tags || [],
      specialtyCode: coach.specialtyCode,
      rating: Number(coach.rating),
      reviews: coach.reviewCount,
      students: coach.students,
      sessions: coach.sessions,
      price: coach.price,
      unit: coach.unit,
      cert: coach.cert,
      desc: coach.desc,
      followers: followersCount,
      works: coach.works || [],
      income: coach.income,
    };
  }
}
