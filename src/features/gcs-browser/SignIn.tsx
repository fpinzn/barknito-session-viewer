import { useCallback } from 'react'
import { initGoogleSignIn, isGsiAvailable } from './auth'

interface SignInProps {
  onSignedIn: () => void
}

export function SignIn({ onSignedIn }: SignInProps) {
  const handleSignIn = useCallback(() => {
    initGoogleSignIn(onSignedIn)
  }, [onSignedIn])

  if (!isGsiAvailable()) {
    return (
      <div className="signin-screen">
        <p className="signin-error">Google Identity Services not available.</p>
        <p className="signin-hint">Make sure the GSI script is loaded.</p>
      </div>
    )
  }

  return (
    <div className="signin-screen">
      <button className="btn-signin" onClick={handleSignIn}>
        Sign in with Google
      </button>
    </div>
  )
}
