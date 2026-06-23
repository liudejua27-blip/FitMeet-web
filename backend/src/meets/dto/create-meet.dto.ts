import { IsString, IsOptional, IsNumber } from 'class-validator';

export class CreateMeetDto {
  @IsString()
  title!: string;

  @IsString()
  type!: string;

  @IsString()
  sport!: string;

  @IsString()
  time!: string;

  @IsString()
  loc!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  poiId?: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsString()
  dist?: string;

  @IsOptional()
  @IsString()
  price?: string;

  @IsOptional()
  @IsNumber()
  maxSlots?: number;

  @IsOptional()
  @IsString()
  level?: string;

  @IsOptional()
  @IsString()
  desc?: string;

  @IsOptional()
  @IsString()
  feeType?: string;

  @IsOptional()
  @IsString()
  groupType?: string;

  @IsOptional()
  @IsString()
  creatorType?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  startAt?: string;
}
