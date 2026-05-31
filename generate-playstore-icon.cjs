const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SIZE = 512;

async function generateIcon() {
  console.log('Generating Play Store icon from hdpi launcher...');

  const srcPath = path.join(__dirname, 'android', 'app', 'src', 'main', 'res', 'mipmap-xxxhdpi', 'ic_launcher.png');
  const outDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'res');

  // Read and upscale the 192x192 source to 512x512 using Lanczos3, then sharpen
  const finalIcon = await sharp(srcPath)
    .resize(SIZE, SIZE, {
      kernel: sharp.kernel.lanczos3,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .sharpen({
      sigma: 1.2,
      m1: 0.5,
      m2: 0.5
    })
    .png({
      quality: 100
    })
    .toBuffer();

  // Save the icon
  const outputPath = path.join(outDir, 'mipmap-xxxhdpi', 'ic_launcher_playstore.png');
  fs.writeFileSync(outputPath, finalIcon);
  console.log(`Icon saved to: ${outputPath}`);

  const rootPath = path.join(outDir, 'playstore-icon.png');
  fs.writeFileSync(rootPath, finalIcon);
  console.log(`Also saved to: ${rootPath}`);

  // Verify
  const metadata = await sharp(finalIcon).metadata();
  console.log(`Output size: ${metadata.width}x${metadata.height}`);
}

generateIcon().catch(console.error);