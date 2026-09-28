# Hide Gemini Watermark (Gemini Watermark Hider) ✦

[![GitHub Stars](https://img.shields.io/github/stars/harik90/Gemini_WatermarkHider?style=for-the-badge&logo=github&color=F59E0B)](https://github.com/harik90/Gemini_WatermarkHider)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![100% Client-Side](https://img.shields.io/badge/Privacy-100%25%20Client--Side-10B981?style=for-the-badge)](https://github.com/harik90/Gemini_WatermarkHider)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)

> **100% Private, Client-Side Watermark Remover for Google Gemini & Veo Images and Videos.**  
> Zero server uploads. No API keys required. Your files never leave your browser.

🌐 **Live Website**: [https://harik90.github.io/Gemini_WatermarkHider/](https://harik90.github.io/Gemini_WatermarkHider/)

---

## ✨ Features

- **✦ Gemini Sparkle & Star Removal**: Mathematical reverse alpha blending using calibrated 4-point astroid curves, edge feathering, and boundary inpainting fallback.
- **🎬 Real-Time Video Watermark Removal**: Frame-accurate watermark detection and erasure for Gemini / Veo clips (`.mp4`, `.webm`) with preserved audio synchronization and zero slow-motion distortion.
- **🔒 100% Private & In-Browser**: Built entirely on HTML5 Canvas, Web Audio API, and MediaRecorder. No media is ever transmitted over the network.
- **⚡ Batch Processing & ZIP Export**: Drop single files, batches, or folders. Download all cleaned assets individually or packed into a single `.zip` archive.
- **🔍 Interactive Before / After Comparison**: Interactive split slider to inspect results down to individual pixels.
- **🎯 Manual Bounding Box Adjustment**: Fine-tune watermark position and size if automatic corner detection needs custom guidance.
- **🌙 AMOLED Dark Mode**: Crafted with deep dark surfaces, smooth micro-animations, and gold accent styling.

---

## 🛠️ Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (Static Export)
- **UI Library**: [React 19](https://react.dev/)
- **Styling**: Vanilla CSS Design Tokens (Zero bloated UI frameworks)
- **Processing**: HTML5 Canvas 2D Context, Web Audio API, MediaRecorder API, JSZip

---

## 🚀 Getting Started Locally

### Prerequisites
- [Node.js](https://nodejs.org/) (v18.0 or newer)
- npm or yarn

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/harik90/Gemini_WatermarkHider.git
   cd Gemini_WatermarkHider
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```

4. **Open in browser**:
   Navigate to [http://localhost:3000](http://localhost:3000)

---

## 📦 Production Build & Static Export

To build the static application bundle:

```bash
npm run build
```

The optimized static website will be generated in the `out/` directory, ready to deploy to GitHub Pages, Cloudflare Pages, Vercel, or any static host.

---

## 🌐 Deploying to GitHub Pages

This repository comes pre-configured with a GitHub Actions workflow (`.github/workflows/deploy.yml`):

1. Go to your repository on GitHub: **Settings** > **Pages**.
2. Under **Build and deployment** > **Source**, select **GitHub Actions**.
3. Push any commit to the `main` branch:
   ```bash
   git add .
   git commit -m "Deploy Hide Gemini Watermark"
   git push origin main
   ```
4. GitHub Actions will automatically build and publish your site at:  
   `https://harik90.github.io/Gemini_WatermarkHider/`

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!  
Feel free to check the [issues page](https://github.com/harik90/Gemini_WatermarkHider/issues).

If you find this project useful, please consider giving it a ⭐ on GitHub!

---

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.
