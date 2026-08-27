export default function App() {
  return (
    <div className="career-game-shell">
      <a className="career-game-skip-link" href="#career-game-main">
        本文へスキップ
      </a>

      <header className="career-game-header">
        <div className="career-game-brand">
          <span className="career-game-brand__product" lang="en">
            Career Game
          </span>
          <span className="career-game-brand__platform">Business Japanese Hub</span>
        </div>
        <p className="career-game-status">
          <span lang="en">Phase A</span> · 準備中
        </p>
      </header>

      <main className="career-game-main" id="career-game-main" tabIndex={-1}>
        <div className="career-game-intro">
          <p className="career-game-intro__label" lang="en">
            Workplace simulation
          </p>
          <h1>キャリアゲーム</h1>
          <p className="career-game-intro__lead">日本の職場で、次の一手を考える。</p>
          <p className="career-game-intro__note">
            実際の職場に近い状況で、判断とその結果を振り返るための新しい体験を準備しています。
          </p>
        </div>
      </main>
    </div>
  )
}
