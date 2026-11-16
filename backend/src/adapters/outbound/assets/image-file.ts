import { imageSize } from 'image-size';
import { AppError } from '../../../domain/errors/app-error.js';

/** Header/container validation; the Android decoder also validates the downloaded file. */
export function inspectAvatarImage(bytes: Buffer) {
  try {
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error('size');
    const dimensions = imageSize(bytes);
    const contentType =
      dimensions.type === 'png'
        ? 'image/png'
        : dimensions.type === 'webp'
          ? 'image/webp'
          : dimensions.type === 'jpg'
            ? 'image/jpeg'
            : null;
    if (
      !contentType ||
      dimensions.width < 1 ||
      dimensions.height < 1 ||
      dimensions.width > 4096 ||
      dimensions.height > 4096 ||
      dimensions.width * dimensions.height > 12_000_000
    )
      throw new Error('dimensions');
    // Walk container chunks instead of looking for byte patterns in compressed image data.
    if (contentType === 'image/png') {
      let offset = 8;
      let end = false;
      while (offset + 12 <= bytes.length) {
        const length = bytes.readUInt32BE(offset);
        const type = bytes.toString('ascii', offset + 4, offset + 8);
        if (offset + 12 + length > bytes.length || ['acTL', 'fcTL', 'fdAT'].includes(type))
          throw new Error('invalid or animated PNG');
        offset += 12 + length;
        if (type === 'IEND') {
          end = length === 0 && offset === bytes.length;
          break;
        }
      }
      if (!end) throw new Error('invalid PNG');
    }
    if (contentType === 'image/webp') {
      if (bytes.readUInt32LE(4) + 8 !== bytes.length) throw new Error('invalid WebP');
      let offset = 12;
      while (offset + 8 <= bytes.length) {
        const type = bytes.toString('ascii', offset, offset + 4);
        const length = bytes.readUInt32LE(offset + 4);
        if (
          ['ANIM', 'ANMF'].includes(type) ||
          (type === 'VP8X' && length > 0 && (bytes[offset + 8]! & 2) !== 0)
        )
          throw new Error('animated WebP');
        offset += 8 + length + (length % 2);
      }
      if (offset !== bytes.length) throw new Error('invalid WebP');
    }
    return { contentType, width: dimensions.width, height: dimensions.height };
  } catch {
    throw new AppError('invalid_avatar_image', 400);
  }
}
