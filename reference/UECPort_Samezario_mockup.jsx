/*
 * UI appearance reference only.
 * Do not import this React mock into the Phaser production client.
 */

const sampleStages = [
  { id: "stage-1", name: "電気通信大学", status: "available" },
  { id: "stage-2", name: "調布駅周辺", status: "locked" },
];

export default function UECPortSamezarioMockup() {
  return (
    <main className="uecport-mockup">
      <header>
        <p>UECPort</p>
        <h1>サメザリオ</h1>
      </header>

      <section aria-labelledby="stage-heading">
        <h2 id="stage-heading">ステージ選択</h2>
        <ul>
          {sampleStages.map((stage) => (
            <li key={stage.id} data-status={stage.status}>
              <strong>{stage.name}</strong>
              <span>{stage.status === "available" ? "挑戦する" : "未解放"}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
