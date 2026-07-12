import pc from 'picocolors';
import {
  GLOSSARY,
  GLOSSARY_CATEGORY_LABELS,
  lookupTerm,
  searchGlossary,
  type GlossaryCategory,
  type GlossaryEntry
} from '../../core/glossary/index.js';
import { safeTerminalText } from '../terminal.js';

function printEntry(entry: GlossaryEntry): void {
  console.log(pc.bold(pc.cyan(entry.term)));
  if ((entry.aliases?.length ?? 0) > 0) {
    console.log(pc.dim(`Also called: ${entry.aliases?.join(', ')}`));
  }
  console.log(entry.definition);
}

/**
 * `devsurface learn` — the plain-English jargon dictionary.
 * With no argument it prints the whole glossary grouped by category; with an
 * argument it looks the term up (falling back to a fuzzy search).
 */
export async function learnCommand(
  term: string | undefined,
  options: { json?: boolean } = {}
): Promise<void> {
  if (term === undefined) {
    if (options.json === true) {
      console.log(JSON.stringify(GLOSSARY, null, 2));
      return;
    }
    console.log(pc.bold(`The DevSurface glossary — ${GLOSSARY.length} terms in plain English`));
    console.log(pc.dim('Look one up with: devsurface learn <term>\n'));
    const categories = Object.keys(GLOSSARY_CATEGORY_LABELS) as GlossaryCategory[];
    for (const category of categories) {
      const entries = GLOSSARY.filter((entry) => entry.category === category);
      if (entries.length === 0) {
        continue;
      }
      console.log(pc.bold(pc.magenta(GLOSSARY_CATEGORY_LABELS[category])));
      for (const entry of entries) {
        console.log(`  ${pc.cyan(entry.term.padEnd(22))} ${pc.dim(entry.definition)}`);
      }
      console.log('');
    }
    return;
  }

  const safeQuery = safeTerminalText(term);
  const exact = lookupTerm(term);
  if (exact !== null) {
    if (options.json === true) {
      console.log(JSON.stringify(exact, null, 2));
      return;
    }
    printEntry(exact);
    return;
  }

  const matches = searchGlossary(term);
  if (options.json === true) {
    console.log(JSON.stringify(matches, null, 2));
    return;
  }
  if (matches.length === 0) {
    console.log(`No glossary entry mentions "${safeQuery}" yet.`);
    console.log(pc.dim('See every term with: devsurface learn'));
    return;
  }
  console.log(pc.dim(`No exact entry for "${safeQuery}" — ${matches.length} related:\n`));
  for (const entry of matches.slice(0, 8)) {
    printEntry(entry);
    console.log('');
  }
}
