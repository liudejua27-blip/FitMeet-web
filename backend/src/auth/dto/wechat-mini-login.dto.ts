import { IsOptional, IsString, MaxLength } from 'class-validator';

export class WechatMiniLoginDto {
  @IsString()
  code: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nickname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;
}
