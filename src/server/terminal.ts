export function isAllowedTerminalCommand(command: string): boolean {
  return /^[A-Za-z0-9._+-]+$/.test(command);
}
