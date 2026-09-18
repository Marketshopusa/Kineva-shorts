export const LANGUAGES = [
  { code: 'tr', name: 'Turkce',    flag: '\u{1F1F9}\u{1F1F7}', direction: 'ltr' },
  { code: 'en', name: 'English',   flag: '\u{1F1EC}\u{1F1E7}', direction: 'ltr' },
  { code: 'de', name: 'Deutsch',   flag: '\u{1F1E9}\u{1F1EA}', direction: 'ltr' },
  { code: 'es', name: 'Espanol',   flag: '\u{1F1EA}\u{1F1F8}', direction: 'ltr' },
  { code: 'ar', name: '\u0627\u0644\u0639\u0631\u0628\u064A\u0629', flag: '\u{1F1F8}\u{1F1E6}', direction: 'rtl' },
]

export function getLanguageByCode(code) {
  return LANGUAGES.find(l => l.code === code)
}
