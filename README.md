# Next.js Performance Analyzer

A Chrome extension that provides real-time performance analysis and optimization recommendations for Next.js websites.

## Features

- 🚀 Real-time Core Web Vitals monitoring
  - Largest Contentful Paint (LCP)
  - First Input Delay (FID)
  - Cumulative Layout Shift (CLS)
- 📊 Performance Score calculation aligned with Lighthouse metrics
- ⚡ Next.js-specific optimization recommendations
- 🎯 Marketing and SEO recommendations
- 🔄 Automatic analysis on page load and route changes
- 💡 Actionable implementation suggestions

## Installation

### From Chrome Web Store
Coming soon!

### Local Development
1. Clone this repository
```bash
git clone https://github.com/yourusername/next-seo-analyzer.git
cd next-seo-analyzer
```

2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory

## Usage

1. Navigate to any Next.js website
2. Click the extension icon in your Chrome toolbar
3. View real-time performance metrics and recommendations
4. Implementation suggestions are provided for each recommendation

## Technical Details

### Architecture
- `popup.html/js`: User interface and results display
- `content.js`: Core Web Vitals collection and Next.js detection
- `background.js`: State management and tab coordination

### Performance Metrics
- **LCP (Largest Contentful Paint)**
  - Measures loading performance
  - Target: < 2.5 seconds
- **FID (First Input Delay)**
  - Measures interactivity
  - Target: < 100 milliseconds
- **CLS (Cumulative Layout Shift)**
  - Measures visual stability
  - Target: < 0.1

### Next.js Detection
The extension automatically detects Next.js websites by looking for:
- `__NEXT_DATA__` script tag
- Next.js-specific script patterns
- Image optimization components
- Font optimization markers

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

Distributed under the MIT License. See `LICENSE` for more information.

## Acknowledgments

- Built with Chrome Extensions Manifest V3
- Uses Performance Observer API for metrics collection
- Inspired by Lighthouse and Next.js best practices 