export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const BRAND = {
  name: "alma",
  tagline: "Tu hogar, bajo control.",
  domain: "mialma.app",
  colors: {
    olive: "#7A8060",
    deepOlive: "#555A40",
    sageMist: "#B5B89A",
    warmStone: "#F0F0EA",
    parchment: "#f8f8f5",
    forestNight: "#252620",
  },
} as const;

export const PRICING = {
  alma: {
    name: "Alma",
    price: 24.99,
    fundadorasPrice: 19.99,
    features: [
      "briefing",
      "maintenance",
      "capture",
      "whatsapp",
      "memory",
      "partnerNudges",
    ],
  },
  familia: {
    name: "Alma Familia",
    price: 39.99,
    fundadorasPrice: 29.99,
    features: [
      "briefing",
      "maintenance",
      "capture",
      "whatsapp",
      "memory",
      "partnerNudges",
      "familyMembers",
      "familyBriefings",
    ],
  },
} as const;

export const FUNDADORAS_TOTAL = 50;
export const FUNDADORAS_REMAINING = 50;

export const WHATSAPP_NUMBER = "";
export const WHATSAPP_DEEP_LINK = WHATSAPP_NUMBER
  ? `https://wa.me/${WHATSAPP_NUMBER}?text=Hola%20Alma%2C%20quiero%20comenzar`
  : "";

export const TRIAL_DAYS = 7;

export const SOCIAL_PROOF_STATS = {
  mentalLoad: 73,
  deferMaintenance: 65,
  emergencyCost: 5000,
  weeklyHoursMin: 2,
  weeklyHoursMax: 10,
} as const;
