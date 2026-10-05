// Test-only: known prior text is never sent to agy as a prompt.
function validateAgyHistoryScreen(screen, marker) {
  if (typeof marker !== 'string' || marker.trim().length < 12) throw new Error('Provide MULTI_CLI_TEST_AGY_HISTORY_MARKER (at least 12 characters of known prior conversation).');
  if (!/Antigravity|\bagy\b/i.test(screen) || /Conversation [^\r\n]* not found|ignoring --conversation|failed to resume|TERM is set to "dumb"/i.test(screen)) return false;
  if (/^PS [^\r\n]*>\s*$/m.test(screen.trimEnd().split(/\r?\n/).at(-1) ?? '')) return false;
  const compact = value => value.normalize('NFC').replace(/\s+/g, '');
  return compact(screen).includes(compact(marker));
}
module.exports = {validateAgyHistoryScreen};
