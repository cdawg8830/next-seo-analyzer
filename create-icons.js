const fs = require('fs');
const { createCanvas } = require('canvas');

const sizes = [16, 48, 128];

function createIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#0070f3'; // Next.js blue
  ctx.fillRect(0, 0, size, size);

  // Text
  ctx.fillStyle = 'white';
  ctx.font = `bold ${size * 0.5}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('NX', size/2, size/2);

  return canvas.toBuffer('image/png');
}

// Create icons directory if it doesn't exist
if (!fs.existsSync('icons')) {
  fs.mkdirSync('icons');
}

// Generate icons for each size
sizes.forEach(size => {
  const buffer = createIcon(size);
  fs.writeFileSync(`icons/icon${size}.png`, buffer);
  console.log(`Created icon${size}.png`);
}); 