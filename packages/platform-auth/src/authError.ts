/** Provider-neutral password-auth failures safe to present through app copy. */
export type AuthErrorCode =
  | 'rateLimited'
  | 'alreadyRegistered'
  | 'invalidCredentials'
  | 'emailNotConfirmed'
  | 'failure'

export class AuthError extends Error {
  constructor(readonly code: AuthErrorCode) {
    super(code)
    this.name = 'AuthError'
  }
}
