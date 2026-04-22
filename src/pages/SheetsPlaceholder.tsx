export default function SheetsPlaceholder() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      background: '#ECE5DD',
      gap: 16,
      padding: 32,
      textAlign: 'center',
    }}>
      <div style={{
        width: 80, height: 80, borderRadius: 20,
        background: '#CC0000',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 16px rgba(7,94,84,0.3)',
      }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="2" stroke="#fff" strokeWidth="1.8" fill="none"/>
          <line x1="3" y1="9" x2="21" y2="9" stroke="#fff" strokeWidth="1.4"/>
          <line x1="3" y1="15" x2="21" y2="15" stroke="#fff" strokeWidth="1.4"/>
          <line x1="9" y1="3" x2="9" y2="21" stroke="#fff" strokeWidth="1.4"/>
        </svg>
      </div>

      <h2 style={{ fontSize: 22, fontWeight: 700, color: '#111', margin: 0 }}>דפי ביצוע</h2>
      <p style={{ fontSize: 15, color: '#8696A0', margin: 0, lineHeight: 1.5 }}>
        מודול דפי הביצוע יחובר בקרוב.
        <br />
        כאן תוכל לנהל פרויקטים, חומרים ועבודה בשטח.
      </p>

      <div style={{
        background: 'rgba(7,94,84,0.1)',
        borderRadius: 12,
        padding: '10px 20px',
        border: '1px solid rgba(7,94,84,0.2)',
      }}>
        <span style={{ fontSize: 13, color: '#CC0000', fontWeight: 500 }}>
          🚧 בפיתוח — בקרוב
        </span>
      </div>
    </div>
  )
}
