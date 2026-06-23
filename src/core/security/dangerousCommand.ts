const DANGEROUS_COMMAND =
  /\b(rm\s+-rf|docker\s+volume\s+rm|drop\s+database|prisma\s+migrate\s+reset|git\s+clean\s+-fdx?)\b/i;

export function isDangerousCommand(command: string): boolean {
  return DANGEROUS_COMMAND.test(command);
}
