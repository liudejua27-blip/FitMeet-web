import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ProfilePhotoInputDto {
  @IsInt()
  assetId: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isCover?: boolean;
}

export class UpdateProfilePhotosDto {
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => ProfilePhotoInputDto)
  photos: ProfilePhotoInputDto[];
}
