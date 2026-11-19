import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import QRCode from 'qrcode';

let repository = process.argv[2] || process.env.GITHUB_REPOSITORY;
if (!repository) {
  repository = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
}
repository = repository
  .replace(/^https:\/\/github\.com\//, '')
  .replace(/^git@github\.com:/, '')
  .replace(/\/$/, '')
  .replace(/\.git$/, '');
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
  throw new Error('Use a GitHub repository URL or OWNER/REPOSITORY.');
}

const releaseTag = process.argv[3] || process.env.RELEASE_TAG;
if (!releaseTag || !/^[A-Za-z0-9_.-]+$/.test(releaseTag)) {
  throw new Error('Provide a release tag as the second argument or set RELEASE_TAG.');
}

const releaseUrl = `https://github.com/${repository}/releases/download/${releaseTag}`;
const downloadUrl = `${releaseUrl}/petcare.apk`;
await mkdir('downloads', { recursive: true });
await QRCode.toFile('downloads/petcare-download-qr.png', downloadUrl, {
  width: 600,
  margin: 4,
  errorCorrectionLevel: 'M',
});
await writeFile('downloads/download-url.txt', `${downloadUrl}\n`);
await writeFile(
  'downloads/release-notes.md',
  `# Petcare for Android

[Download the APK](${downloadUrl}) or scan this QR code with your Android phone.

![Scan to download Petcare](${releaseUrl}/petcare-download-qr.png)

1. Download petcare.apk.
2. Open the file and allow installation from your browser when Android asks.
3. Install and open Petcare.

This is a signed debug APK for testing. The app needs internet access for accounts, records, and photos.
For a private repository, sign in to a GitHub account with repository access before downloading.
`,
);
console.log(`QR saved: downloads/petcare-download-qr.png\nAPK download: ${downloadUrl}`);
