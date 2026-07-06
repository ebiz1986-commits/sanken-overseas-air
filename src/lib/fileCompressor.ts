import toast from 'react-hot-toast';

/**
 * Compresses an image file if possible, or checks size limits for other files.
 * Returns a promise resolving to a Base64 string, or null if the file is invalid or too large.
 */
export function processAndCompressFile(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    // Max allowable size for non-image files (like PDFs) to fit with headroom inside Firestore's 1MB limit.
    // Base64 encoding adds ~33% size overhead; 320 KB converts to ~420 KB, matching Firestore's 1MB limit with ample multi-file headroom.
    const MAX_PDF_SIZE_BYTES = 320 * 1024; // 320 KB
    // Max allowable input size for any image file before canvas compression
    const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

    if (file.type.startsWith('image/')) {
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        toast.error(`Image is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Please upload an image under 10MB.`);
        resolve(null);
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const maxDimension = 900; // 900px preserves details while keeping sizes extremely small
            let width = img.width;
            let height = img.height;

            if (width > maxDimension || height > maxDimension) {
              if (width > height) {
                height = Math.round((height * maxDimension) / width);
                width = maxDimension;
              } else {
                width = Math.round((width * maxDimension) / height);
                height = maxDimension;
              }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              // Fill with white background in case PNG contains transparency (prevents turning transparent areas into black when compressed to JPEG)
              ctx.fillStyle = '#FFFFFF';
              ctx.fillRect(0, 0, width, height);
              ctx.drawImage(img, 0, 0, width, height);
              // Compress to 0.55 quality JPEG to guarantee high text-readability while staying exceptionally compact (~35KB to 80KB)
              const compressedBase64 = canvas.toDataURL('image/jpeg', 0.55);
              resolve(compressedBase64);
            } else {
              // Fallback if canvas context fails
              if (file.size > MAX_PDF_SIZE_BYTES) {
                toast.error(`Image cannot be compressed and is too large (${(file.size / 1024).toFixed(1)}KB). Please upload under 320KB.`);
                resolve(null);
              } else {
                resolve(event.target?.result as string);
              }
            }
          } catch (error) {
            console.error('Error during image compression, fallback:', error);
            if (file.size > MAX_PDF_SIZE_BYTES) {
              toast.error(`Failed to compress image and file is too large. Please upload under 320KB.`);
              resolve(null);
            } else {
              resolve(event.target?.result as string);
            }
          }
        };
        img.onerror = () => {
          if (file.size > MAX_PDF_SIZE_BYTES) {
            toast.error(`Invalid image file over size limit.`);
            resolve(null);
          } else {
            resolve(event.target?.result as string);
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    } else {
      // PDF or other documents (non-compressible directly in browser canvas)
      if (file.size > MAX_PDF_SIZE_BYTES) {
        toast.error(`PDF document is too large (${(file.size / 1024).toFixed(1)}KB). Please upload a PDF under 320KB to ensure database compatibility.`);
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        resolve(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  });
}
