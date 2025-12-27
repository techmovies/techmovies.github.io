# VORTEX Streaming

A modern, responsive web application for streaming movies and TV shows online. Built with vanilla JavaScript, HTML5, and CSS3, featuring a sleek dark theme and progressive web app capabilities.

![VORTEX Streaming](https://img.shields.io/badge/VORTEX-Streaming-blue?style=for-the-badge&logo=netflix&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-yellow?style=flat-square&logo=javascript)
![HTML5](https://img.shields.io/badge/HTML5-5.0-orange?style=flat-square&logo=html5)
![CSS3](https://img.shields.io/badge/CSS3-3.0-blue?style=flat-square&logo=css3)
![PWA](https://img.shields.io/badge/PWA-Ready-green?style=flat-square&logo=pwa)

## 🌟 Features

- **🎬 Movie & TV Show Streaming**: Browse and watch thousands of movies and TV shows
- **🔥 Trending Content**: Discover the most popular and trending media
- **📱 Progressive Web App**: Installable on mobile devices with offline capabilities
- **🎯 Genre Filtering**: Filter content by genres (Action, Comedy, Drama, Thriller, etc.)
- **🔍 Smart Search**: Search for movies and TV shows with real-time suggestions
- **📋 My List**: Save your favorite content for later viewing
- **🎨 Dark Theme**: Modern dark UI for comfortable viewing
- **📱 Responsive Design**: Optimized for all screen sizes
- **⚡ Fast Loading**: Optimized with minified assets and lazy loading
- **🌐 Multi-language Support**: Google Translate integration

## 🚀 Live Demo

[View Live Demo](https://night677coder.github.io/vortex)

## 📋 Prerequisites

- Modern web browser with JavaScript enabled
- Internet connection for streaming content
- Node.js (for development and building)

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/night677coder/vortex.git
   cd vortex
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the project**
   ```bash
   npm run build
   ```

4. **Serve locally** (optional)
   ```bash
   # Use any static server, for example:
   python -m http.server 8000
   # or
   npx serve .
   ```

## 📖 Usage

### For Users
1. Open the application in your web browser
2. Browse trending content or use the search bar
3. Click on any movie/TV show to view details
4. Click "Watch Now" to start streaming
5. Add content to your list using the "Add to List" button

### For Developers
- **Development**: Edit source files (`script.js`, `styles.css`, `index.html`)
- **Building**: Run `npm run build` to minify and optimize assets
- **Deployment**: The `dist/` folder contains production-ready files

## 🏗️ Project Structure

```
vortex/
├── index.html              # Main homepage
├── movies.html             # Movies page
├── tvshows.html            # TV Shows page
├── trending.html           # Trending content page
├── mylist.html             # User's saved list
├── movie-detail.html       # Movie/TV show detail page
├── script.js               # Main JavaScript file
├── script.min.js           # Minified JavaScript (generated)
├── styles.css              # Main CSS file
├── styles.min.css          # Minified CSS (generated)
├── manifest.json           # PWA manifest
├── service-worker.js       # Service worker for PWA
├── build.mjs               # Build script
├── package.json            # Project dependencies
├── .htaccess               # Apache configuration
├── icon.svg                # App icon
└── README.md               # This file
```

## 🛠️ Technologies Used

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **APIs**: TMDB API for movie/TV show data
- **Build Tools**: Node.js, Terser (JS minification), CleanCSS (CSS minification)
- **PWA**: Service Worker, Web App Manifest
- **Icons**: Font Awesome, Google Fonts (Inter)
- **Ads**: Google AdSense integration

## 🎨 Customization

### Changing Colors
Edit the CSS custom properties in `styles.css`:

```css
:root {
  --primary-color: #ff6b6b;
  --secondary-color: #4ecdc4;
  --background-color: #101010;
  --text-color: #ffffff;
  /* ... other variables */
}
```

### Adding New Features
1. Modify `script.js` for new functionality
2. Update `styles.css` for styling
3. Test across different devices and browsers

## 📱 Progressive Web App (PWA)

The app includes PWA features:
- **Installable**: Can be installed on mobile devices
- **Offline Support**: Basic offline functionality
- **Fast Loading**: Cached assets for quick loading
- **Native Feel**: App-like experience on mobile

## 🔧 Build Process

The build process includes:
- JavaScript minification and obfuscation
- CSS minification
- Asset optimization
- Service worker generation

Run `npm run build` to generate production files.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is for educational purposes only. Please respect copyright laws and content ownership.

## ⚠️ Disclaimer

This application is a demonstration of web development skills and uses publicly available APIs. It does not host or distribute copyrighted content. Users are responsible for complying with local laws and regulations regarding media consumption.

## 📞 Support

For questions or support:
- Open an issue on GitHub
- Check the documentation in this README

## 🙏 Acknowledgments

- [TMDB](https://www.themoviedb.org/) for providing movie and TV show data
- [Font Awesome](https://fontawesome.com/) for icons
- [Google Fonts](https://fonts.google.com/) for typography
- [Unsplash](https://unsplash.com/) and [Picsum](https://picsum.photos/) for placeholder images

---

**Made with ❤️ for streaming enthusiasts**
