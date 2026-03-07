import {
  IsNumber,
  IsString,
  IsOptional,
  IsArray,
  Min,
  Max,
} from 'class-validator';

export class CreateReviewDto {
  @IsNumber()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsString()
  text!: string;

  @IsOptional()
  @IsArray()
  tags?: string[];
}
