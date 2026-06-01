import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  SocialRequestType,
  UserSocialRequestStatus,
} from '../social-request.entity';

export class SearchSocialRequestDto {
  @IsOptional()
  @IsEnum(UserSocialRequestStatus)
  status?: UserSocialRequestStatus;

  @IsOptional()
  @IsEnum(SocialRequestType)
  type?: SocialRequestType;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  offset?: number;
}
