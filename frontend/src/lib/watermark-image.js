const MAX_SOURCE_FILE_BYTES = 5 * 1024 * 1024;
const MAX_OUTPUT_DATA_URL_LENGTH = 220000;
const TARGET_MAX_DIMENSION = 320;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image'));
    image.src = dataUrl;
  });
}

function getScaledSize(width, height) {
  if (!width || !height) {
    return { width: TARGET_MAX_DIMENSION, height: TARGET_MAX_DIMENSION };
  }
  const scale = Math.min(1, TARGET_MAX_DIMENSION / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function optimizeWatermarkImage(file) {
  if (!file) {
    throw new Error('Choose an image file first');
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Use a PNG, JPG, or WebP image for the watermark logo');
  }
  if (file.size > MAX_SOURCE_FILE_BYTES) {
    throw new Error('Logo image must be 5 MB or smaller before processing');
  }

  const sourceDataUrl = await readFileAsDataUrl(file);
  const image = await loadImageFromDataUrl(sourceDataUrl);
  const { width, height } = getScaledSize(image.naturalWidth, image.naturalHeight);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) {
    throw new Error('This browser could not process the watermark image');
  }

  context.clearRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.drawImage(image, 0, 0, width, height);

  const qualitySteps = [0.9, 0.82, 0.74, 0.66, 0.58];
  let outputDataUrl = '';
  for (const quality of qualitySteps) {
    outputDataUrl = canvas.toDataURL('image/webp', quality);
    if (outputDataUrl.length <= MAX_OUTPUT_DATA_URL_LENGTH) {
      break;
    }
  }

  if (!outputDataUrl || outputDataUrl.length > MAX_OUTPUT_DATA_URL_LENGTH) {
    throw new Error('The logo image is still too large after compression. Use a simpler image.');
  }

  return {
    dataUrl: outputDataUrl,
    width,
    height,
  };
}

export function isInlineWatermarkImage(value) {
  return /^data:image\/(?:png|jpeg|jpg|webp);base64,/i.test(String(value || '').trim());
}
