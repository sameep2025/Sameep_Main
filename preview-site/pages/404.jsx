export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
      <div style={{ background: '#fff', padding: 24, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', width: 360, textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Page Not Found</h1>
        <p style={{ color: '#6b7280' }}>The page you’re looking for doesn’t exist.</p>
      </div>
    </div>
  );
}
