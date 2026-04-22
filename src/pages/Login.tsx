import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const navigate   = useNavigate()
  const login      = useAuth(s => s.login)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) return
    setError('')
    setLoading(true)

    try {
      await login(username, password)
      navigate('/chats', { replace: true })
    } catch (err) {
      setError('שם משתמש או סיסמה שגויים')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: '#f5f5f5',
      padding: 24,
    }}>
      {/* לוגו */}
      <div style={{
        width: 80,
        height: 80,
        borderRadius: 20,
        background: '#CC0000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
        boxShadow: '0 4px 20px rgba(204,0,0,0.3)',
      }}>
        <span style={{ fontSize: 36, color: '#fff' }}>🏠</span>
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111', marginBottom: 4 }}>
        חג בגג
      </h1>
      <p style={{ fontSize: 14, color: '#8696A0', marginBottom: 32 }}>
        מערכת פנימית
      </p>

      {/* טופס */}
      <form
        onSubmit={handleSubmit}
        style={{
          width: '100%',
          maxWidth: 360,
          background: '#fff',
          borderRadius: 16,
          padding: 24,
          boxShadow: '0 2px 20px rgba(0,0,0,0.08)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* שם משתמש */}
        <div>
          <label style={{ fontSize: 13, color: '#54656F', display: 'block', marginBottom: 6 }}>
            שם משתמש
          </label>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            placeholder="למשל: asaf"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px 14px',
              border: '1.5px solid #E0E0E0',
              borderRadius: 10,
              fontSize: 15,
              outline: 'none',
              direction: 'ltr',
              textAlign: 'right',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => (e.target.style.borderColor = '#CC0000')}
            onBlur={e  => (e.target.style.borderColor = '#E0E0E0')}
          />
        </div>

        {/* סיסמה */}
        <div>
          <label style={{ fontSize: 13, color: '#54656F', display: 'block', marginBottom: 6 }}>
            סיסמה
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px 14px',
              border: '1.5px solid #E0E0E0',
              borderRadius: 10,
              fontSize: 15,
              outline: 'none',
              direction: 'ltr',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => (e.target.style.borderColor = '#CC0000')}
            onBlur={e  => (e.target.style.borderColor = '#E0E0E0')}
          />
        </div>

        {/* הודעת שגיאה */}
        {error && (
          <div style={{
            background: '#FFF2F2',
            border: '1px solid #FFCDD2',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 14,
            color: '#CC0000',
            textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        {/* כפתור כניסה */}
        <button
          type="submit"
          disabled={loading || !username.trim() || !password}
          style={{
            width: '100%',
            padding: '13px',
            borderRadius: 10,
            background: loading || !username.trim() || !password ? '#E0E0E0' : '#CC0000',
            color: loading || !username.trim() || !password ? '#9E9E9E' : '#fff',
            border: 'none',
            fontSize: 16,
            fontWeight: 600,
            fontFamily: 'Heebo, sans-serif',
            cursor: loading || !username.trim() || !password ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          {loading ? (
            <>
              <span style={{
                width: 18, height: 18,
                border: '2px solid rgba(255,255,255,0.3)',
                borderTopColor: '#fff',
                borderRadius: '50%',
                animation: 'spin 0.7s linear infinite',
                display: 'inline-block',
              }} />
              מתחבר...
            </>
          ) : 'כניסה'}
        </button>
      </form>

      <p style={{ fontSize: 12, color: '#C0C0C0', marginTop: 24 }}>
        לא זוכר סיסמה? פנה לאיציק
      </p>

      {/* spinner animation */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
