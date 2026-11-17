import { ImageQualityMetrics } from '../types';

/**
 * Client-side pre-flight image quality evaluation
 * Checks resolution, luminance, and sharpness to assist the operator before inference.
 */
export async function analyzeImageQuality(dataUrl: string): Promise<ImageQualityMetrics> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const aspectRatio = Number((w / h).toFixed(2));
      const warnings: string[] = [];

      // Resolution check
      if (w < 400 || h < 400) {
        warnings.push(`Image resolution is low (${w}x${h}px). Recommend at least 640x640px for high-precision component detection.`);
      }

      if (aspectRatio > 3.0 || aspectRatio < 0.33) {
        warnings.push(`Unusual image aspect ratio (${aspectRatio}:1). Ensure the camera captures the full packing container.`);
      }

      // Analyze pixel data using offscreen canvas
      let brightnessScore = 128;
      let blurScore = 100;

      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const sampleSize = 120;
        canvas.width = sampleSize;
        canvas.height = sampleSize;

        if (ctx) {
          ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
          const imgData = ctx.getImageData(0, 0, sampleSize, sampleSize);
          const data = imgData.data;

          let totalLuma = 0;
          const grayPixels = new Float32Array(sampleSize * sampleSize);

          for (let i = 0; i < data.length; i += 4) {
            // Standard luminance: 0.299R + 0.587G + 0.114B
            const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            totalLuma += luma;
            grayPixels[i / 4] = luma;
          }

          brightnessScore = Math.round(totalLuma / (sampleSize * sampleSize));

          // Estimate blur via simple discrete Laplacian variance
          let laplacianSum = 0;
          let laplacianSqSum = 0;
          let count = 0;

          for (let y = 1; y < sampleSize - 1; y++) {
            for (let x = 1; x < sampleSize - 1; x++) {
              const idx = y * sampleSize + x;
              const val =
                grayPixels[idx - sampleSize] +
                grayPixels[idx + sampleSize] +
                grayPixels[idx - 1] +
                grayPixels[idx + 1] -
                4 * grayPixels[idx];
              laplacianSum += val;
              laplacianSqSum += val * val;
              count++;
            }
          }

          const mean = laplacianSum / count;
          const variance = laplacianSqSum / count - mean * mean;
          blurScore = Math.round(variance);

          // Lighting evaluation
          if (brightnessScore < 45) {
            warnings.push('Low ambient lighting detected. Turn on overhead inspection light or illuminate package to prevent shadows.');
          } else if (brightnessScore > 225) {
            warnings.push('Severe glare / overexposure detected. Adjust lighting angle to reduce reflection from metallic surfaces.');
          }

          // Sharpness evaluation
          if (blurScore < 20) {
            warnings.push('Image appears blurry or out of focus. Hold camera steady and capture again for crisp component contours.');
          }
        }
      } catch (err) {
        // Fallback gracefully if canvas context restricted
        console.warn('Canvas pixel analysis not available:', err);
      }

      const qualityPassed = warnings.length === 0;

      resolve({
        width: w,
        height: h,
        aspect_ratio: aspectRatio,
        estimated_blur_score: blurScore,
        brightness_score: brightnessScore,
        quality_passed: qualityPassed,
        warnings
      });
    };

    img.onerror = () => {
      resolve({
        width: 0,
        height: 0,
        aspect_ratio: 1,
        quality_passed: false,
        warnings: ['Unable to decode image file. Please provide a valid JPEG, PNG, or WebP image.']
      });
    };

    img.src = dataUrl;
  });
}
