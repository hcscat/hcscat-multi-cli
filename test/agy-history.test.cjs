const {test}=require('node:test'),assert=require('node:assert/strict');
const {validateAgyHistoryScreen:valid}=require('../scripts/agy-history-check.cjs');
test('agy history validation needs a known prior phrase, active TUI, and no missing-ID warning',()=>{
 const marker='Synthetic known previous response.';
 assert.throws(()=>valid('Antigravity',undefined),/12 characters/);
 assert.equal(valid('Antigravity\nSynthetic known\nprevious response.\ninput >',marker),true);
 assert.equal(valid('Antigravity\nConversation synthetic not found, ignoring --conversation flag\n'+marker,marker),false);
 assert.equal(valid('Antigravity\n'+marker+'\nPS C:\\synthetic>',marker),false);
 assert.equal(valid('Antigravity\nA long unrelated diagnostic response',marker),false);
});
