import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

/**
 * Converts a data: URI (base64) into a Blob so it can be uploaded to Storage.
 */
function dataUriToBlob(dataUri: string): { blob: Blob; ext: string } {
  const [meta, b64] = dataUri.split(',');
  const mime = /:(.*?);/.exec(meta)?.[1] || 'application/octet-stream';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ext = mime === 'application/pdf' ? 'pdf' : (mime.split('/')[1] || 'bin').replace('jpeg', 'jpg');
  return { blob: new Blob([bytes], { type: mime }), ext };
}

/**
 * Uploads a compressed base64 data URI to Firebase Storage and returns the
 * public download URL. `prefix` groups files (e.g. "tickets/first_invoice").
 * If given a value that is already a URL (not a data: URI), it is returned as-is.
 */
export async function uploadDataUriToStorage(dataUri: string, prefix: string): Promise<string> {
  if (!dataUri || !dataUri.startsWith('data:')) return dataUri; // already a URL or empty
  const { blob, ext } = dataUriToBlob(dataUri);
  const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType: blob.type });
  return await getDownloadURL(storageRef);
}

// ---- Display classification (handles legacy base64, Storage URLs, and pasted web links) ----

export function isStorageUrl(v?: string): boolean {
  return !!v && (v.includes('firebasestorage.googleapis.com') || v.includes('?alt=media') || v.includes('storage.googleapis.com'));
}

export function isPdfValue(v?: string): boolean {
  if (!v) return false;
  return v.startsWith('data:application/pdf') || v.toLowerCase().includes('.pdf');
}

/** External link the user pasted (e.g. SharePoint) — NOT a Storage file or base64. */
export function isExternalWebLink(v?: string): boolean {
  return !!v && (v.startsWith('http://') || v.startsWith('https://')) && !v.startsWith('data:') && !isStorageUrl(v);
}

/** Returns how a stored file value should be rendered. */
export function classifyFileValue(v?: string): 'none' | 'pdf' | 'image' | 'weblink' {
  if (!v) return 'none';
  if (isPdfValue(v)) return 'pdf';
  if (isExternalWebLink(v)) return 'weblink';
  return 'image'; // base64 image or Storage image URL — <img src> renders both
}
