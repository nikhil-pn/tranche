// The Books assistant: AG Studio's own agents, answering with Claude. The adapter posts each turn to
// app/api/ai/books, which holds the key, so nothing secret reaches the browser.

import type { AgAiHarnessSetup, AgAiPromptStarter, AgStudioApi } from "ag-studio";
import { createAiHarness } from "ag-studio";
import { claudeAdapter } from "./claudeAdapter";

// Shown in a new conversation before anything is typed. The button text is short; the prompt is what
// Claude receives.
const PROMPT_STARTERS: AgAiPromptStarter[] = [
  {
    label: "Who is still owed?",
    prompt: "Who on the crew has been paid, and who is still owed? Answer from the crew ledger.",
  },
  {
    label: "Chart money collected per gate",
    prompt: "Add a chart of money collected per payment gate, using the receivables data.",
  },
  {
    label: "Which payments were late?",
    prompt: "Which client payments were late, and by how many days?",
  },
];

/** AG Studio's own tools already read every Books dataset, so the assistant needs nothing else. */
export function createBooksAi(): AgAiHarnessSetup {
  const adapter = claudeAdapter();
  return ({ api }) =>
    createAiHarness(api as AgStudioApi, {
      adapter,
      promptStarters: PROMPT_STARTERS,
    });
}
