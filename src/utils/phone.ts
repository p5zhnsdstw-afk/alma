/**
 * Phone number validation and normalization (E.164 format).
 *
 * E.164: + followed by country code + subscriber number, 8-15 digits total.
 * Examples: +593999481169 (Ecuador), +12025551234 (US)
 */

/** Country code → expected subscriber digit count (common markets) */
const COUNTRY_DIGIT_LENGTHS: Record<string, [number, number]> = {
  "1": [10, 10],     // US/Canada
  "593": [9, 10],    // Ecuador
  "52": [10, 10],    // Mexico
  "57": [10, 10],    // Colombia
  "51": [9, 9],      // Peru
  "56": [9, 9],      // Chile
  "506": [8, 8],     // Costa Rica
  "505": [8, 8],     // Nicaragua
  "504": [8, 8],     // Honduras
} as const;

const STRIP_CHARS = /[\s\-\(\)\.]/g;
const ALL_SAME_DIGIT = /^(\d)\1+$/;
const SEQUENTIAL = /^(?:0123456789|1234567890|9876543210)/;

/**
 * Parse a raw phone string into E.164 format.
 * Returns null if invalid.
 *
 * @param input Raw phone string from user (e.g., "099-948-1169", "+593 999 481169")
 * @param defaultCountryCode Country code to prepend if missing (e.g., "593")
 */
export function parsePhone(input: string, defaultCountryCode?: string): string | null {
  if (!input || typeof input !== "string") return null;

  // Strip formatting characters
  let cleaned = input.replace(STRIP_CHARS, "");

  // Handle leading +
  const hasPlus = cleaned.startsWith("+");
  if (hasPlus) {
    cleaned = cleaned.slice(1);
  }

  // Must be only digits now
  if (!/^\d+$/.test(cleaned)) return null;

  // If no + and no country code prefix, try adding default
  if (!hasPlus && defaultCountryCode) {
    // Check if it already starts with the country code
    if (!cleaned.startsWith(defaultCountryCode)) {
      // Remove leading 0 (common local format: 0999481169 → 999481169)
      if (cleaned.startsWith("0")) {
        cleaned = cleaned.slice(1);
      }
      cleaned = defaultCountryCode + cleaned;
    }
  }

  const phone = "+" + cleaned;

  if (!isValidE164(phone)) return null;

  return phone;
}

/**
 * Validate that a phone string is valid E.164 format.
 */
export function isValidE164(phone: string): boolean {
  if (!phone.startsWith("+")) return false;

  const digits = phone.slice(1);

  // E.164: 8-15 digits
  if (digits.length < 8 || digits.length > 15) return false;
  if (!/^\d+$/.test(digits)) return false;

  // Reject obviously fake numbers
  if (ALL_SAME_DIGIT.test(digits)) return false;
  if (SEQUENTIAL.test(digits)) return false;

  // Validate against known country code lengths if possible
  for (const [code, [minLen, maxLen]] of Object.entries(COUNTRY_DIGIT_LENGTHS)) {
    if (digits.startsWith(code)) {
      const subscriber = digits.slice(code.length);
      if (subscriber.length < minLen || subscriber.length > maxLen) return false;
      return true;
    }
  }

  // Unknown country code — accept if within E.164 range
  return true;
}

/**
 * Extract a phone number from free-form text.
 * Returns the first valid E.164 phone found, or null.
 */
export function extractPhone(text: string, defaultCountryCode?: string): string | null {
  // Match sequences that look like phone numbers
  const candidates = text.match(/\+?\d[\d\s\-\(\)\.]{6,18}\d/g);
  if (!candidates) return null;

  for (const candidate of candidates) {
    const parsed = parsePhone(candidate, defaultCountryCode);
    if (parsed) return parsed;
  }

  return null;
}
