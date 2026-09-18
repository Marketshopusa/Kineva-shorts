export const THEMES = [
  {
    id: 'hidden_identity',
    name: 'Hidden Identity',
    icon: '\u{1F3AD}',
    description: 'Secrets, disguises, and the truth behind the mask.',
    promptFragment: 'The story revolves around hidden identities, secrets, and dramatic reveals. Characters wear emotional masks and the truth slowly unravels.',
    defaultTone: 'mysterious, tense',
    defaultSetting: 'Urban cityscape, dimly lit interiors',
  },
  {
    id: 'betrayal_revenge',
    name: 'Betrayal & Revenge',
    icon: '\u{1F5E1}\u{FE0F}',
    description: 'Trust broken, alliances shattered, vengeance unleashed.',
    promptFragment: 'The story centers on betrayal by someone trusted and the protagonist\'s journey toward confrontation or revenge. Emotional intensity builds through each scene.',
    defaultTone: 'dark, intense',
    defaultSetting: 'Corporate offices, luxury apartments, shadowy meetings',
  },
  {
    id: 'rags_to_riches',
    name: 'Rags to Riches',
    icon: '\u{1F451}',
    description: 'From nothing to everything, but at what cost?',
    promptFragment: 'The story follows a character\'s dramatic rise from poverty to power. Each scene shows a new level of transformation, with moral dilemmas at every step.',
    defaultTone: 'inspiring, dramatic',
    defaultSetting: 'Contrast between humble origins and luxurious new life',
  },
  {
    id: 'love_and_loss',
    name: 'Love & Loss',
    icon: '\u{1F494}',
    description: 'Hearts entwined, torn apart, and left to heal.',
    promptFragment: 'The story explores deep romantic connection followed by devastating loss or separation. Emotional vulnerability drives every scene.',
    defaultTone: 'emotional, bittersweet',
    defaultSetting: 'Intimate spaces, rain-soaked streets, nostalgic locations',
  },
]

export function getThemeById(id) {
  return THEMES.find(t => t.id === id)
}
