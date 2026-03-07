import { IsString, IsOptional, IsArray } from 'class-validator';

export class CreatePostDto {
  @IsString()
  type!: string; // 'meet' | 'log'

  @IsOptional()
  @IsString()
  title?: string;

  @IsString()
  sport!: string;

  @IsString()
  text!: string;

  @IsOptional()
  @IsString()
  emoji?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsArray()
  images?: any[]; // Array<{ url: string, width: number, height: number }>

  @IsOptional()
  @IsString()
  videoUrl?: string;

  @IsOptional()
  @IsString()
  level?: string;

  @IsOptional()
  @IsString()
  slots?: string;

  @IsOptional()
  @IsString()
  dist?: string;
}
