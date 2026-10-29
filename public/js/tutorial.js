/**
 * Cartagena: Escape Diaries - Interactive Tutorial Modal (How to Play)
 */

export class Tutorial {
  constructor(modalElement) {
    this.modal = modalElement;
    this.currentStep = 0;
    this.steps = [
      {
        title: 'Entry I: The Fortress & The Cards',
        subtitle: 'Every pirate starts in Cartagena Fortress jail. Your cards are your escape tools.',
        content: `
          <div class="tutorial-card-body">
            <p>Each turn you get <strong>up to 3 actions</strong> (●●●). You start with <strong>6 pirates in Jail</strong> and a hand of <strong>6 symbol cards</strong>.</p>
            <div class="tutorial-symbols-grid">
              <span>🍾 Rum Bottle</span>
              <span>🔫 Flintlock Pistol</span>
              <span>🗝️ Jail Key</span>
              <span>💀 Pirate Skull</span>
              <span>⚔️ Cutlass</span>
              <span>🎩 Tricorn Hat</span>
            </div>
            <p class="diary-note">"To break free, you must slip past the guards and navigate the 36-space stone tunnel to the sea."</p>
          </div>
        `
      },
      {
        title: 'Entry II: Action A — Move Forward',
        subtitle: 'Play a card to dash toward freedom.',
        content: `
          <div class="tutorial-card-body">
            <p><strong>1.</strong> Select one of your pirates not yet on the boat.</p>
            <p><strong>2.</strong> Play a matching symbol card from your hand.</p>
            <p><strong>3.</strong> Your pirate leaps forward to the <em>nearest space ahead</em> that shows that symbol and has <strong>fewer than 3 pirates</strong>!</p>
            <div class="tutorial-callout">
              ⭐ <strong>Captain's Secret:</strong> If all spaces with that symbol ahead are full (3 pirates) or none exist, your pirate leaps <strong>directly onto the Escape Boat</strong>!
            </div>
          </div>
        `
      },
      {
        title: 'Entry III: Action B — Move Backward',
        subtitle: 'Running out of cards? Strategically retreat to resupply!',
        content: `
          <div class="tutorial-card-body">
            <p>Moving backward costs <strong>0 cards</strong> and allows you to <strong>draw new cards</strong>!</p>
            <p><strong>1.</strong> Select a pirate currently inside the tunnel.</p>
            <p><strong>2.</strong> The pirate moves backward to the <em>nearest space behind</em> that holds <strong>exactly 1 or 2 pirates</strong> (any color). Empty spaces and full spaces (3) are skipped!</p>
            <p><strong>3.</strong> Draw <strong>1 or 2 cards</strong> matching the number of pirates that were on that space!</p>
            <p class="diary-note">"A smart pirate knows when to step back and regroup with comrades."</p>
          </div>
        `
      },
      {
        title: 'Entry IV: Winning the Escape',
        subtitle: 'First crew to board the rowboat claims victory!',
        content: `
          <div class="tutorial-card-body">
            <p>When your turn ends, you automatically draw up to <strong>6 cards</strong> if you have fewer.</p>
            <p>The match ends <strong>instantly</strong> when any captain gets <strong>all 6 pirates</strong> (or 4 in quick mode) safely aboard the rowboat!</p>
            <div class="tutorial-callout gold">
              🏆 The victor claims the glory of Cartagena!
            </div>
          </div>
        `
      }
    ];

    this._render();
  }

  show() {
    this.currentStep = 0;
    this._render();
    this.modal.classList.add('active');
  }

  hide() {
    this.modal.classList.remove('active');
  }

  next() {
    if (this.currentStep < this.steps.length - 1) {
      this.currentStep++;
      this._render();
    } else {
      this.hide();
    }
  }

  prev() {
    if (this.currentStep > 0) {
      this.currentStep--;
      this._render();
    }
  }

  _render() {
    const step = this.steps[this.currentStep];
    const isFirst = this.currentStep === 0;
    const isLast = this.currentStep === this.steps.length - 1;

    this.modal.innerHTML = `
      <div class="parchment-modal-overlay"></div>
      <div class="parchment-modal-dialog">
        <div class="parchment-header">
          <h2 class="diary-heading">${step.title}</h2>
          <button class="close-diary-btn" id="close-tutorial-btn">&times;</button>
        </div>
        <p class="diary-subtitle">${step.subtitle}</p>
        <div class="diary-content">
          ${step.content}
        </div>
        <div class="tutorial-footer">
          <div class="tutorial-dots">
            ${this.steps.map((_, i) => `<span class="dot ${i === this.currentStep ? 'active' : ''}"></span>`).join('')}
          </div>
          <div class="tutorial-nav-buttons">
            <button class="btn btn-secondary" id="tut-prev-btn" ${isFirst ? 'disabled' : ''}>Previous</button>
            <button class="btn btn-primary" id="tut-next-btn">${isLast ? "Let's Play!" : 'Next Page'}</button>
          </div>
        </div>
      </div>
    `;

    this.modal.querySelector('#close-tutorial-btn')?.addEventListener('click', () => this.hide());
    this.modal.querySelector('#tut-prev-btn')?.addEventListener('click', () => this.prev());
    this.modal.querySelector('#tut-next-btn')?.addEventListener('click', () => this.next());
    this.modal.querySelector('.parchment-modal-overlay')?.addEventListener('click', () => this.hide());
  }
}
