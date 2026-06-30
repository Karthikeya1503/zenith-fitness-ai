# 🏋️ Zenith AI — Fitness Coach

<div align="center">

![Zenith AI](https://img.shields.io/badge/Zenith-AI%20Fitness%20Coach-00f5d4?style=for-the-badge&logo=react)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite)
![Google Gemini](https://img.shields.io/badge/Google-Gemini%20AI-4285F4?style=flat-square&logo=google)
![Firebase](https://img.shields.io/badge/Firebase-Deployed-FFCA28?style=flat-square&logo=firebase)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

**Your personal AI-powered fitness coach, nutritionist, and wellness advisor — all in one platform.**

[Live Demo](#) · [Report Bug](https://github.com/Karthikeya1503/zenith-fitness-ai/issues) · [Request Feature](https://github.com/Karthikeya1503/zenith-fitness-ai/issues)

</div>

---

## ✨ Features

| Feature | Description |
|---|---|
| 🤖 **AI Fitness Coach** | ZENITH persona powered by Google Gemini — certified trainer, nutritionist & wellness coach |
| 🩺 **Medical Report Analyzer** | Upload reports → AI factors your health conditions into ALL fitness recommendations |
| 📊 **Workout Tracker** | Log and monitor your sessions, reps, and progress over time |
| 💊 **Supplement Guide** | AI-curated supplement recommendations based on your goals and health profile |
| 💬 **Multi-Session Chat** | Persistent chat history with multiple named sessions saved locally |
| 🎨 **Premium UI** | Glassmorphism design with GSAP animations and smooth Lenis scrolling |
| 🐳 **Docker Ready** | Containerized for easy self-hosting and deployment |
| 🔥 **Firebase Deployed** | Live deployment on Firebase Hosting |

---

## 🛠️ Tech Stack

- **Frontend:** React 19, Vite 8, React Router, React Markdown
- **AI Engine:** Google Gemini API (`@google/genai`)
- **Animations:** GSAP 3, Lenis (smooth scroll)
- **Backend/Hosting:** Firebase, Express.js
- **Containerization:** Docker
- **Styling:** Custom CSS with glassmorphism design system

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Google Gemini API Key → [Get one here](https://aistudio.google.com/)

### Installation

```bash
# Clone the repository
git clone https://github.com/Karthikeya1503/zenith-fitness-ai.git
cd zenith-fitness-ai

# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Add your Gemini API key to .env:
# VITE_GEMINI_API_KEY=your_key_here

# Start development server
npm run dev
```

### Docker

```bash
# Build and run with Docker
docker build -t zenith-fitness-ai .
docker run -p 3000:3000 -e VITE_GEMINI_API_KEY=your_key zenith-fitness-ai
```

---

## 🏗️ Project Structure

```
zenith-fitness-ai/
├── src/
│   ├── components/
│   │   ├── MedicalReports.jsx   # AI medical report analyzer
│   │   ├── Tracker.jsx          # Workout tracking dashboard
│   │   └── Supplements.jsx      # Supplement recommendation engine
│   ├── App.jsx                  # Main app + ZENITH AI chat interface
│   ├── firebase.js              # Firebase configuration
│   └── main.jsx                 # Entry point
├── public/                      # Static assets
├── Dockerfile                   # Docker configuration
├── vite.config.js               # Vite build config
└── firebase.json                # Firebase hosting config
```

---

## 🔑 Environment Variables

```env
VITE_GEMINI_API_KEY=your_google_gemini_api_key
```

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">

Built with ❤️ by **[Jarugula Venkata Karthikeya](https://github.com/Karthikeya1503)**

⭐ Star this repo if you found it useful!

</div>
