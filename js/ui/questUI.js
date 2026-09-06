// Renders the quest log screen's content from state.quests (see
// core/questManager.js for how that gets populated/updated). main.js
// wires the open/close buttons and calls this in response — this
// module never touches game state or the event bus directly, same
// division of labor as ui/combatUI.js and ui/renderer.js.

export function renderQuestList(listEl, quests) {
  if (!quests.length) {
    listEl.innerHTML = '<p class="quest-empty">No quests yet.</p>';
    return;
  }
  listEl.innerHTML = quests.map((q) => {
    const complete = q.status === 'complete';
    const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
    return `
      <div class="quest-card${complete ? ' complete' : ''}">
        <div class="quest-card-header">
          <span class="quest-card-name">${q.name}</span>
          <span class="quest-card-status">${complete ? 'Complete' : 'In Progress'}</span>
        </div>
        <p class="quest-card-desc">${q.description}</p>
        <div class="bar-track"><div class="bar-fill quest" style="width:${pct}%"></div></div>
        <div class="quest-card-progress-text">${q.progress} / ${q.target}</div>
      </div>
    `;
  }).join('');
}
