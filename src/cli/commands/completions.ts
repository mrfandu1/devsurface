/**
 * `devsurface completions <shell>` — print a tab-completion script for
 * bash, zsh, or PowerShell. Users pipe or source it once and get command
 * completion forever after.
 */

const COMMANDS = [
  'serve',
  'workspace',
  'scan',
  'ports',
  'status',
  'doctor',
  'env',
  'info',
  'up',
  'upgrade',
  'onboard',
  'quickstart',
  'summary',
  'tips',
  'learn',
  'why',
  'system',
  'search',
  'explain',
  'verify',
  'history',
  'badge',
  'passport',
  'init',
  'run',
  'notes',
  'todos',
  'stats',
  'deps',
  'commits',
  'clean',
  'snapshot',
  'bundle',
  'watch',
  'completions'
];

function bashScript(): string {
  return [
    '# devsurface bash completion — add to ~/.bashrc:',
    '#   eval "$(devsurface completions bash)"',
    '_devsurface_completions() {',
    '  local cur="${COMP_WORDS[COMP_CWORD]}"',
    '  if [ "$COMP_CWORD" -eq 1 ]; then',
    `    COMPREPLY=( $(compgen -W "${COMMANDS.join(' ')}" -- "$cur") )`,
    '  fi',
    '}',
    'complete -F _devsurface_completions devsurface'
  ].join('\n');
}

function zshScript(): string {
  return [
    '# devsurface zsh completion — add to ~/.zshrc:',
    '#   eval "$(devsurface completions zsh)"',
    '_devsurface() {',
    `  _arguments '1: :(${COMMANDS.join(' ')})'`,
    '}',
    'compdef _devsurface devsurface'
  ].join('\n');
}

function powershellScript(): string {
  return [
    '# devsurface PowerShell completion — add to your $PROFILE:',
    '#   devsurface completions powershell | Out-String | Invoke-Expression',
    'Register-ArgumentCompleter -Native -CommandName devsurface -ScriptBlock {',
    '  param($wordToComplete, $commandAst, $cursorPosition)',
    `  @(${COMMANDS.map((command) => `'${command}'`).join(', ')}) |`,
    '    Where-Object { $_ -like "$wordToComplete*" } |',
    '    ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, "ParameterValue", $_) }',
    '}'
  ].join('\n');
}

export async function completionsCommand(shell: string): Promise<void> {
  const normalized = shell.toLowerCase();
  if (normalized === 'bash') {
    console.log(bashScript());
    return;
  }
  if (normalized === 'zsh') {
    console.log(zshScript());
    return;
  }
  if (normalized === 'powershell' || normalized === 'pwsh') {
    console.log(powershellScript());
    return;
  }
  console.error(`Unsupported shell "${shell}". Supported: bash, zsh, powershell.`);
  process.exitCode = 1;
}
