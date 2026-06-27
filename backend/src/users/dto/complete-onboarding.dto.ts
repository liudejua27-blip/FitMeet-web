import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class OnboardingConsentsDto {
  @IsString()
  @MaxLength(40)
  termsVersion: string;

  @IsString()
  @MaxLength(40)
  privacyVersion: string;

  @IsBoolean()
  adultAttestation: boolean;
}

export class CompleteOnboardingDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedProfileVersion?: number;

  @IsString()
  @MaxLength(40)
  nickname: string;

  @IsDateString()
  dateOfBirth: string;

  @IsString()
  @MaxLength(80)
  city: string;

  @IsString()
  @MaxLength(60)
  primaryPurpose: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  purposes: string[];

  @IsArray()
  @ArrayMinSize(3)
  @IsString({ each: true })
  interestTags: string[];

  @IsInt()
  @Min(1)
  @Max(200)
  distanceKm: number;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @IsInt({ each: true })
  photoIds: number[];

  @IsInt()
  coverPhotoId: number;

  @IsObject()
  @ValidateNested()
  @Type(() => OnboardingConsentsDto)
  consents: OnboardingConsentsDto;
}
