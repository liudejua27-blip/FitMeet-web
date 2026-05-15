import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateLocationDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  /** Optional: flip the nearby-match opt-in in the same call. */
  @IsOptional()
  @IsBoolean()
  acceptNearbyMatch?: boolean;
}
