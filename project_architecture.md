# Project Architecture & Context

This document serves as a high-level overview of the project's architecture, tools, and technical decisions to act as context for future agent sessions, preventing the need to re-read multiple files.

## Tech Stack
- **Framework:** React + Vite / Next.js (depending on setup, using React predominantly)
- **3D Graphics:** React Three Fiber (R3F), Drei, Three.js
- **Styling:** Tailwind CSS (or Vanilla CSS based on preference), Framer Motion for UI animations
- **State Management:** React Context / Zustand (if used)
- **Scroll Handling:** ScrollControls (from `@react-three/drei`) tying scroll position to camera rail animations and scene transitions.

## Application Structure
- **`src/components/MainPage.tsx`**: The main entry point handling the UI overlay and the WebGL canvas wrapper.
- **`src/components/WebGLCanvas.tsx`**: The core 3D scene orchestration. Uses a `CameraRail` to move through the environment based on scroll percentage. Includes sections for Sky, Ground, and Cavern.
- **`src/components/Preloader.tsx`**: A polished loading screen that unmounts once the heavy initial assets are ready.

## Scene Progression & Folds
The scroll experience moves the camera through different zones and triggers different entities:
1. **Sky:** Flying Bee, Drone
2. **Ground:** Ant, Rover
3. **Cavern/Underground:** Spider, Spy
4. **Space / Face / ID Card:** Lazy-loaded in the background and triggered seamlessly during transitions.

## Performance Optimization Strategy
- **Progressive Loading:** Initial preloader only waits for immediate viewport assets (Sky/Bee).
- **Background Loading:** The Space, Face, and ID Card assets are loaded asynchronously while the user is interacting with the first few folds.
- **Instancing/LODs:** Used where appropriate to keep draw calls low.
- **Render Loop Optimization:** Minimal use of `useFrame` for heavy logic; reliance on shaders and efficient GLTF models.

*Note: You can update this file as the project evolves to keep it as a definitive "brain" for new chat sessions.*
