/**
 * Visual style presets for AI image generation.
 * Each style controls: prompt suffix, Leonardo presetStyle, and rendering hints.
 */

export const VISUAL_STYLES = [
  {
    key: "cinematic",
    name: "Cinematic",
    emoji: "🎬",
    description: "Photorealistic film stills with dramatic lighting",
    promptSuffix: "photorealistic, cinematic still frame, dramatic lighting, shallow depth of field",
    leonardoPreset: "CINEMATIC",
    bgClass: "from-slate-800 to-slate-950",
    accentColor: "#e2a832",
  },
  {
    key: "anime",
    name: "Anime",
    emoji: "✨",
    description: "Japanese animation style with vibrant colors",
    promptSuffix: "anime art style, cel-shaded illustration, bold outlines, vibrant saturated colors, 2D animation",
    leonardoPreset: "ANIME",
    stripPhotorealistic: true,
    bgClass: "from-pink-900 to-purple-950",
    accentColor: "#f472b6",
  },
  {
    key: "hand_drawn",
    name: "Hand-Drawn",
    emoji: "✏️",
    description: "Pencil sketch illustration with expressive linework",
    promptSuffix: "hand-drawn illustration, pencil sketch, expressive linework, warm paper texture, ink drawing",
    leonardoPreset: "SKETCH_COLOR",
    stripPhotorealistic: true,
    bgClass: "from-amber-900 to-stone-950",
    accentColor: "#f59e0b",
  },
  {
    key: "watercolor",
    name: "Watercolor",
    emoji: "🎨",
    description: "Soft painterly washes with impressionistic edges",
    promptSuffix: "watercolor painting, soft color washes, painterly impressionistic style, delicate brushwork, artistic",
    leonardoPreset: "CREATIVE",
    stripPhotorealistic: true,
    bgClass: "from-teal-900 to-cyan-950",
    accentColor: "#2dd4bf",
  },
  {
    key: "comic_book",
    name: "Comic Book",
    emoji: "💥",
    description: "Bold ink lines, high contrast, flat graphic colors",
    promptSuffix: "comic book art style, bold ink outlines, halftone dots, flat colors, graphic novel illustration",
    leonardoPreset: "DYNAMIC",
    stripPhotorealistic: true,
    bgClass: "from-yellow-900 to-orange-950",
    accentColor: "#facc15",
  },
  {
    key: "animation_3d",
    name: "3D Animation",
    emoji: "🎭",
    description: "Pixar-inspired smooth 3D renders with rich textures",
    promptSuffix: "3D rendered, Pixar animation style, smooth subsurface shading, vibrant clean textures, studio lighting",
    leonardoPreset: "CREATIVE",
    stripPhotorealistic: true,
    bgClass: "from-blue-900 to-indigo-950",
    accentColor: "#60a5fa",
  },
  {
    key: "noir",
    name: "Noir",
    emoji: "🌑",
    description: "High-contrast black & white with dramatic shadows",
    promptSuffix: "black and white noir photography, extreme contrast, deep dramatic shadows, moody film noir, grainy",
    leonardoPreset: "MONOCHROME",
    bgClass: "from-zinc-800 to-zinc-950",
    accentColor: "#a1a1aa",
  },
  {
    key: "vintage",
    name: "Vintage",
    emoji: "📷",
    description: "Faded film photography with warm retro tones",
    promptSuffix: "vintage 35mm film photography, faded warm tones, light leaks, film grain, retro 1970s aesthetic",
    leonardoPreset: "RETRO",
    bgClass: "from-orange-900 to-red-950",
    accentColor: "#fb923c",
  },
]

export function getVisualStyle(key) {
  return VISUAL_STYLES.find((s) => s.key === key) || VISUAL_STYLES[0]
}

export const DEFAULT_VISUAL_STYLE = "cinematic"
