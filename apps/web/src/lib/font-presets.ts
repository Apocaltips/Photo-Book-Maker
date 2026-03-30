export const FONT_PRESETS = [
  {
    id: "gallery",
    label: "Gallery serif",
    description: "Cormorant + Manrope",
    headline: 'var(--font-cormorant), "Cormorant Garamond", serif',
    body: 'var(--font-manrope), "Avenir Next", sans-serif',
  },
  {
    id: "modern",
    label: "Modern editorial",
    description: "Fraunces + Plus Jakarta Sans",
    headline: 'var(--font-fraunces), Georgia, serif',
    body: 'var(--font-plus-jakarta), "Segoe UI", sans-serif',
  },
  {
    id: "novel",
    label: "Novel classic",
    description: "Libre Baskerville + DM Sans",
    headline: 'var(--font-libre-baskerville), "Palatino Linotype", serif',
    body: 'var(--font-dm-sans), "Trebuchet MS", sans-serif',
  },
  {
    id: "journal",
    label: "Journal soft",
    description: "Lora + Work Sans",
    headline: 'var(--font-lora), "Baskerville", serif',
    body: 'var(--font-work-sans), "Helvetica Neue", sans-serif',
  },
  {
    id: "romantic",
    label: "Romantic feature",
    description: "Playfair Display + Nunito Sans",
    headline: 'var(--font-playfair), "Times New Roman", serif',
    body: 'var(--font-nunito), "Avenir Next", sans-serif',
  },
  {
    id: "outdoors",
    label: "Outdoor premium",
    description: "Newsreader + Inter",
    headline: 'var(--font-newsreader), Georgia, serif',
    body: 'var(--font-inter), "Segoe UI", sans-serif',
  },
] as const;

export type FontPresetId = (typeof FONT_PRESETS)[number]["id"];
