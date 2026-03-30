import {
  Abril_Fatface,
  Assistant,
  Bodoni_Moda,
  Cormorant_Garamond,
  DM_Sans,
  Figtree,
  Fraunces,
  Inter,
  Libre_Baskerville,
  Lora,
  Manrope,
  Merriweather,
  Montserrat,
  Newsreader,
  Nunito_Sans,
  Playfair_Display,
  Plus_Jakarta_Sans,
  Prata,
  Source_Sans_3,
  Space_Grotesk,
  Spectral,
  Work_Sans,
} from "next/font/google";

const abrilFatface = Abril_Fatface({
  subsets: ["latin"],
  variable: "--font-abril-fatface",
  weight: ["400"],
});

const assistant = Assistant({
  subsets: ["latin"],
  variable: "--font-assistant",
  weight: ["400", "500", "600", "700"],
});

const bodoniModa = Bodoni_Moda({
  subsets: ["latin"],
  variable: "--font-bodoni-moda",
  weight: ["400", "500", "600", "700"],
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-cormorant",
  weight: ["400", "500", "600", "700"],
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  weight: ["400", "500", "600", "700"],
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["400", "500", "600", "700"],
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  weight: ["400", "500", "600", "700"],
});

const libreBaskerville = Libre_Baskerville({
  subsets: ["latin"],
  variable: "--font-libre-baskerville",
  weight: ["400", "700"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500", "700"],
});

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
  weight: ["400", "500", "600", "700"],
});

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-lora",
  weight: ["400", "500", "600", "700"],
});

const merriweather = Merriweather({
  subsets: ["latin"],
  variable: "--font-merriweather",
  weight: ["400", "700"],
});

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  weight: ["400", "500", "600", "700"],
});

const workSans = Work_Sans({
  subsets: ["latin"],
  variable: "--font-work-sans",
  weight: ["400", "500", "600", "700"],
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  weight: ["400", "500", "600", "700"],
});

const nunito = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-nunito",
  weight: ["400", "500", "600", "700"],
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "600", "700"],
});

const prata = Prata({
  subsets: ["latin"],
  variable: "--font-prata",
  weight: ["400"],
});

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source-sans-3",
  weight: ["400", "500", "600", "700"],
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  weight: ["400", "500", "600", "700"],
});

const spectral = Spectral({
  subsets: ["latin"],
  variable: "--font-spectral",
  weight: ["400", "500", "600", "700"],
});

export const webFontVariables = [
  abrilFatface.variable,
  assistant.variable,
  bodoniModa.variable,
  cormorant.variable,
  manrope.variable,
  fraunces.variable,
  plusJakarta.variable,
  libreBaskerville.variable,
  dmSans.variable,
  figtree.variable,
  lora.variable,
  merriweather.variable,
  montserrat.variable,
  workSans.variable,
  playfair.variable,
  nunito.variable,
  newsreader.variable,
  inter.variable,
  prata.variable,
  sourceSans.variable,
  spaceGrotesk.variable,
  spectral.variable,
].join(" ");
