const Jimp = require('jimp');

const sizes = [16, 48, 128];

async function generateIcons() {
    for (const size of sizes) {
        const image = new Jimp(size, size, '#0070f3');
        
        // Load font
        const font = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
        
        // Add text
        image.print(
            font,
            0,
            0,
            {
                text: 'S',
                alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
                alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE
            },
            size,
            size
        );
        
        // Save the file
        await image.writeAsync(`icons/icon${size}.png`);
        console.log(`Generated icon${size}.png`);
    }
}

generateIcons().catch(console.error); 