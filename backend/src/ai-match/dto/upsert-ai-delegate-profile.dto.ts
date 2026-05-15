import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';

export class UpsertAiDelegateProfileDto {
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsBoolean()
  @IsOptional()
  privacyConsent?: boolean;

  @IsBoolean()
  @IsOptional()
  autoChatEnabled?: boolean;

  @IsInt()
  @Min(1)
  @Max(10)
  @IsOptional()
  dailyAutoChatLimit?: number;

  @IsString()
  @IsOptional()
  @MaxLength(40)
  preferredName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(40)
  city?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  favoriteSports?: string[];

  @IsString()
  @IsOptional()
  @MaxLength(1200)
  interests?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1200)
  workExperience?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1200)
  idealPartner?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1200)
  trainingGoals?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1200)
  boundaries?: string;

  @IsString()
  @IsOptional()
  @MaxLength(160)
  availability?: string;
}
