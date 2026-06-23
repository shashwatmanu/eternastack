export const scrollState = {
  progress: 0,       // Target scroll progress (0 to 1)
  dampedProgress: 0, // Inertia damped scroll progress (0 to 1)
  speed: 0,          // Current scroll speed (normalized delta)
  bootProgress: 0,   // "Hold to Boot" value (0 to 1)
  isBooted: false,   // True once the preloader transitions to hero
  interactiveNode: null as number | null, // Currently active node in RAG constellation
  ragQuery: "",      // Current user query in AI prompt
  ragActive: false,  // True when simulating RAG paths
};
