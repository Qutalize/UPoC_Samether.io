/*
 * Image-matching threshold exploration tool.
 * Keep reference images and production thresholds on the server.
 */

export default function PhotoVerifyLab({ samples = [] }) {
  return (
    <main className="photo-verify-lab">
      <header>
        <h1>Photo Verify Lab</h1>
        <p>画像照合しきい値の検証用リファレンス</p>
      </header>

      <table>
        <thead>
          <tr>
            <th>サンプル</th>
            <th>期待値</th>
            <th>スコア</th>
          </tr>
        </thead>
        <tbody>
          {samples.map((sample) => (
            <tr key={sample.id}>
              <td>{sample.name}</td>
              <td>{sample.expectedMatch ? "一致" : "不一致"}</td>
              <td>{sample.score ?? "未計測"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
