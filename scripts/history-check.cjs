// Test-only: expected historical text is supplied by the user and never sent to Codex.
function validateHistoryScreen(screen, marker) {
  if (typeof marker !== 'string' || marker.trim().length < 12) throw new Error('Provide MULTI_CLI_TEST_HISTORY_MARKER (at least 12 characters of known prior conversation).');
  const compact = text => text.normalize('NFC').replace(/\s+/g, '');
  if (!/Codex/i.test(screen) || /Failed to resume session|TERM is set to "dumb"|Continue anyway\?/i.test(screen)) return false;
  // A NoExit PowerShell prompt at the bottom means Codex has returned to its parent shell.
  if (/^PS [^\r\n]*>\s*$/m.test(screen.trimEnd().split(/\r?\n/).at(-1) ?? '')) return false;
  return compact(screen).includes(compact(marker));
}
module.exports = {validateHistoryScreen};
