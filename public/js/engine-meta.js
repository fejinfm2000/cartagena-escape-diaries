/**
 * Cartagena: Shared Constants and Metadata for Frontend
 */

export const SYMBOLS = ['BOTTLE', 'PISTOL', 'KEY', 'SKULL', 'SWORD', 'HAT'];

export const SYMBOL_META = {
  BOTTLE: { id: 'BOTTLE', name: 'Rum Bottle', icon: '🍾', label: 'Bottle', color: '#3FA66B' },
  PISTOL: { id: 'PISTOL', name: 'Flintlock Pistol', icon: '🔫', label: 'Pistol', color: '#D64545' },
  KEY: { id: 'KEY', name: 'Jail Key', icon: '🗝️', label: 'Key', color: '#E0A82E' },
  SKULL: { id: 'SKULL', name: 'Pirate Skull', icon: '💀', label: 'Skull', color: '#E5E9F0' },
  SWORD: { id: 'SWORD', name: 'Cutlass Dagger', icon: '⚔️', label: 'Sword', color: '#8E5BC9' },
  HAT: { id: 'HAT', name: 'Tricorn Hat', icon: '🎩', label: 'Hat', color: '#3F7CD8' }
};

export const PLAYER_COLORS = [
  { id: 'red', name: 'Crimson Buccaneer', hex: '#D64545', hatType: 'tricorn' },
  { id: 'blue', name: 'Deep Sea Raider', hex: '#3F7CD8', hatType: 'bandana' },
  { id: 'green', name: 'Tortuga Smuggler', hex: '#3FA66B', hatType: 'bicorne' },
  { id: 'yellow', name: 'Golden Galleon', hex: '#E5B93B', hatType: 'feather' },
  { id: 'purple', name: 'Shadow Corsair', hex: '#8E5BC9', hatType: 'beret' },
  { id: 'orange', name: 'Wildfire Swashbuckler', hex: '#FF7A30', hatType: 'tricorn' },
  { id: 'teal', name: 'Kraken Hunter', hex: '#14B8A6', hatType: 'bandana' },
  { id: 'pink', name: 'Siren Corsair', hex: '#E64980', hatType: 'feather' }
];

export const JAIL_INDEX = 0;
export const BOAT_INDEX = 37;
