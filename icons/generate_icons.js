const Jimp = require('jimp');

const sizes = [16, 48, 128];

async function generateIcons() {
    for (const size of sizes) {
        // Create a new image with a lilac background (#9D8EC7)
        const image = new Jimp(size, size, 0x9D8EC7FF);
        
        // Create a smooth rounded corner effect
        const cornerRadius = Math.max(3, Math.round(size * 0.12)); // Scale corner radius with icon size
        
        // Round the corners
        image.scan(0, 0, size, size, function(x, y, idx) {
            // Check if we're in a corner
            const inTopLeft = x < cornerRadius && y < cornerRadius;
            const inTopRight = x >= size - cornerRadius && y < cornerRadius;
            const inBottomLeft = x < cornerRadius && y >= size - cornerRadius;
            const inBottomRight = x >= size - cornerRadius && y >= size - cornerRadius;
            
            if (inTopLeft || inTopRight || inBottomLeft || inBottomRight) {
                let centerX, centerY;
                
                if (inTopLeft) {
                    centerX = cornerRadius;
                    centerY = cornerRadius;
                } else if (inTopRight) {
                    centerX = size - cornerRadius;
                    centerY = cornerRadius;
                } else if (inBottomLeft) {
                    centerX = cornerRadius;
                    centerY = size - cornerRadius;
                } else { // inBottomRight
                    centerX = size - cornerRadius;
                    centerY = size - cornerRadius;
                }
                
                // Calculate distance from corner center
                const dist = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
                
                // If outside the corner radius, make transparent
                if (dist > cornerRadius) {
                    image.setPixelColor(0x00000000, x, y);
                }
            }
        });
        
        // Load an appropriate font size based on icon size
        let fontSizeName;
        if (size >= 64) {
            fontSizeName = Jimp.FONT_SANS_64_WHITE;
        } else if (size >= 32) {
            fontSizeName = Jimp.FONT_SANS_32_WHITE;
        } else {
            fontSizeName = Jimp.FONT_SANS_16_WHITE;
        }
        
        // Load font
        const font = await Jimp.loadFont(fontSizeName);
        
        // Add the letter N in white
        image.print(
            font,
            0,
            0,
            {
                text: 'N',
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