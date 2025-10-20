# SEEiT-CV 👁️

**SEEiT-CV** is a React Native accessibility app that uses computer vision to help visually impaired users navigate their environment through real-time object detection and audio feedback.

## Features

- 🎥 **Real-time Object Detection**: Uses ML Kit for live camera object detection
- 🔊 **Audio Feedback**: Text-to-speech announcements for detected objects
- ♿ **Accessibility First**: Built with comprehensive accessibility features
- 🌗 **Theme Support**: Light and dark mode support
- 🎛️ **Camera Controls**: Torch, camera switching, pause/resume functionality
- 🔄 **Color Blind Support**: Specialized features for color vision deficiency
- 📱 **Android Target**: Optimized for Android devices

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Android Studio and Android SDK
- Expo CLI (`npm install -g @expo/cli`)

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Kinosaur/SEEiT-CV.git
   cd SEEiT-CV
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npx expo start
   ```

4. **Run on Android**
   ```bash
   npx expo run:android
   ```

## Project Structure

```
SEEiT-CV/
├── app/                          # Main application screens
│   ├── index.tsx                 # Main camera detection screen
│   ├── colorBlindCameraScreen.tsx # Color blind assistance features
│   ├── colorBlindnessSelect.tsx  # Color blindness type selection
│   └── feedback.tsx              # User feedback screen
├── components/                   # Reusable UI components
│   ├── Buttons.tsx              # Custom button components
│   ├── DetectionOverlay.tsx     # Object detection overlay
│   └── ui/                      # UI components
├── constants/                    # App constants and configuration
├── hooks/                       # Custom React hooks
├── services/                    # Core services (TTS, speech)
├── utils/                       # Utility functions
├── assets/                      # Images, fonts, ML models
│   └── models/                  # TensorFlow Lite models
└── android/                     # Android-specific configuration
```

## Key Technologies

- **React Native** (0.79.5) with Expo (53.0.22)
- **React Native Vision Camera** for camera functionality
- **ML Kit Object Detection** for real-time computer vision
- **React Native TTS** for text-to-speech functionality
- **React Navigation** for app navigation
- **TensorFlow Lite** models for enhanced detection

## Development

- **Linting**: `npm run lint`
- **Android Build**: `npm run android`
- **Start Dev Server**: `npm start`

## Configuration

The app is configured for Android-only deployment. Key configurations:
- Camera and microphone permissions
- ML Kit frame processors
- Text-to-speech capabilities
- Accessibility features

## Documentation

- [System Architecture](./app/system_architecture.md) - Technical architecture overview
- [Project Report](.docs/SEEiT Senior Porject 1 report.pdf) - Comprehensive project documentation and findings

## Contributing

This project focuses on accessibility and computer vision for Android platforms. When contributing:

1. Ensure accessibility compliance
2. Test with Android devices
3. Follow the existing code patterns
4. Update documentation as needed

## License

This project is developed for educational and accessibility purposes.

## Contact

For questions or feedback about SEEiT-CV, please use the in-app feedback feature or contact the development team.
