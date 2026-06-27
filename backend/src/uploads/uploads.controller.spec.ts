import { BadRequestException, RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UploadsController } from './uploads.controller';

describe('UploadsController', () => {
  function makeController() {
    const uploadsService = {
      saveImage: jest.fn().mockResolvedValue({
        assetId: 42,
        url: 'https://cdn.fitmeet.test/avatar.webp',
        width: 640,
        height: 640,
        moderationStatus: 'approved',
      }),
      saveFile: jest.fn().mockResolvedValue('https://cdn.fitmeet.test/v.mp4'),
    };
    const controller = new UploadsController(uploadsService as never);
    return { controller, uploadsService };
  }

  it('keeps image and video uploads behind JWT-protected POST routes', () => {
    const prototype = UploadsController.prototype;

    expect(Reflect.getMetadata(PATH_METADATA, UploadsController)).toBe(
      'uploads',
    );
    const uploadImage = prototype['uploadImage'];
    const uploadVideo = prototype['uploadVideo'];

    expect(Reflect.getMetadata(PATH_METADATA, uploadImage)).toBe('image');
    expect(Reflect.getMetadata(METHOD_METADATA, uploadImage)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, uploadVideo)).toBe('video');
    expect(Reflect.getMetadata(METHOD_METADATA, uploadVideo)).toBe(
      RequestMethod.POST,
    );

    for (const handler of [uploadImage, uploadVideo]) {
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
        JwtAuthGuard,
      ]);
    }
  });

  it('delegates image uploads to UploadsService and preserves dimensions', async () => {
    const { controller, uploadsService } = makeController();
    const file = { originalname: 'avatar.jpg' } as Express.Multer.File;
    const req = { user: { id: 7 } };

    await expect(controller.uploadImage(file, req as never)).resolves.toEqual({
      assetId: 42,
      url: 'https://cdn.fitmeet.test/avatar.webp',
      width: 640,
      height: 640,
      moderationStatus: 'approved',
    });
    expect(uploadsService.saveImage).toHaveBeenCalledWith(file, 7);
  });

  it('delegates video uploads to UploadsService and wraps the URL response', async () => {
    const { controller, uploadsService } = makeController();
    const file = { originalname: 'clip.mp4' } as Express.Multer.File;

    await expect(controller.uploadVideo(file)).resolves.toEqual({
      url: 'https://cdn.fitmeet.test/v.mp4',
    });
    expect(uploadsService.saveFile).toHaveBeenCalledWith(file);
  });

  it('rejects missing upload files before hitting storage', async () => {
    const { controller, uploadsService } = makeController();
    const req = { user: { id: 7 } };

    await expect(
      controller.uploadImage(undefined as never, req as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.uploadVideo(undefined as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(uploadsService.saveImage).not.toHaveBeenCalled();
    expect(uploadsService.saveFile).not.toHaveBeenCalled();
  });
});
