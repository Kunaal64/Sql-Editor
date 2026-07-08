export function ErrorPanel({ error }) {
  if (!error) return null;

  return (
    <div className="error-panel">
      <strong>{error.code}</strong>
      <p>{error.message}</p>
    </div>
  );
}
