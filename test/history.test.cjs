const {test}=require('node:test');const assert=require('node:assert/strict');
const {validateHistoryScreen}=require('../scripts/history-check.cjs');
const marker='Previously we decided to use a local session picker.';
test('history validation requires known text and works for English as well as Korean',()=>{
  assert.equal(validateHistoryScreen('OpenAI Codex\nPreviously we decided to use a\n local session picker.',marker),true);
  const korean='이전에 로컬 세션 목록을 사용하기로 결정했습니다.';
  assert.equal(validateHistoryScreen('OpenAI Codex\n'+korean,korean),true);
  assert.throws(()=>validateHistoryScreen('',undefined),/HISTORY_MARKER/);
});
test('long Korean diagnostics are not history; failed resume and a returned shell cannot pass',()=>{
  assert.equal(validateHistoryScreen('OpenAI Codex 오류 안내\n'+'synthetic '.repeat(40),marker),false);
  assert.equal(validateHistoryScreen('OpenAI Codex\n'+marker+'\nFailed to resume session',marker),false);
  assert.equal(validateHistoryScreen('OpenAI Codex\n'+marker+'\nPS C:\\synthetic> ',marker),false);
});
