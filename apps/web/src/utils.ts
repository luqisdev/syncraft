// Pre-assigned distinct visual colors for participants
export const PARTICIPANT_COLORS = [
  '#f85149', // Coral Red
  '#2ea043', // Jade Green
  '#1f6feb', // Ocean Blue
  '#d29922', // Amber
  '#a371f7', // Violet
  '#db61a2', // Pink
  '#2da44e', // Emerald
  '#0969da', // Deep Blue
];

export function getRandomColor(): string {
  const index = Math.floor(Math.random() * PARTICIPANT_COLORS.length);
  return PARTICIPANT_COLORS[index];
}

export function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
