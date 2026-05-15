import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { ClubJoinPolicy } from '../club.entity';

export class CreateClubDto {
  @IsString()
  @MaxLength(60)
  name!: string;

  @IsString()
  @MaxLength(40)
  city!: string;

  @IsString()
  @MaxLength(40)
  sportType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  coverUrl?: string;

  @IsOptional()
  @IsIn(['open', 'approval'])
  joinPolicy?: ClubJoinPolicy;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  announcement?: string;
}
