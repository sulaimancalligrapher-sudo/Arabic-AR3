/**
 * Helper to normalize and convert Google Drive and web image links
 * to direct embeddable image URLs.
 */
export function extractDriveFileId(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();

  // Pattern 1: https://drive.google.com/file/d/FILE_ID/view...
  const match1 = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match1 && match1[1]) return match1[1];

  // Pattern 2: https://drive.google.com/open?id=FILE_ID or ?id=FILE_ID
  const match2 = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match2 && match2[1]) return match2[1];

  // Pattern 3: https://drive.google.com/uc?id=FILE_ID or /d/FILE_ID
  const match3 = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match3 && match3[1]) return match3[1];

  return null;
}

/**
 * Converts a Google Drive sharing link or direct URL into an accessible image URL.
 */
export function formatDirectImageUrl(url: string | undefined): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  const fileId = extractDriveFileId(trimmed);
  if (fileId) {
    // Googleusercontent direct image endpoint delivers transparent PNGs with full fidelity
    return `https://lh3.googleusercontent.com/d/${fileId}`;
  }

  return trimmed;
}
