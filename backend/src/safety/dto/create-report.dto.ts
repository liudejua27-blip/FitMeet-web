import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateReportDto {
  @IsIn(['user', 'post', 'meet', 'comment'])
  targetType!: 'user' | 'post' | 'meet' | 'comment';

  @IsNumber()
  targetId!: number;

  @IsString()
  @MaxLength(60)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
