import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext.jsx'
import styles from './auth-dialog.module.css'

function createInitialState() {
  return {
    displayName: '',
    email: '',
    password: '',
  }
}

function AuthDialog() {
  const { t } = useTranslation()
  const {
    authDialogMode,
    closeAuthDialog,
    isAuthDialogOpen,
    isAuthenticated,
    isLoading,
    login,
    openAuthDialog,
    register,
  } = useAuth()
  const [formState, setFormState] = useState(createInitialState())
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    if (!isAuthDialogOpen) {
      setFormState(createInitialState())
      setSubmitError('')
    }
  }, [isAuthDialogOpen])

  useEffect(() => {
    if (isAuthenticated && isAuthDialogOpen) {
      closeAuthDialog()
    }
  }, [closeAuthDialog, isAuthDialogOpen, isAuthenticated])

  if (!isAuthDialogOpen) {
    return null
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitError('')

    try {
      if (authDialogMode === 'register') {
        await register(formState)
      } else {
        await login(formState)
      }
    } catch (requestError) {
      setSubmitError(requestError.message)
    }
  }

  const dialog = (
    <div className={styles.Overlay} role="presentation" onClick={closeAuthDialog}>
      <div
        className={styles.Dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="local-auth-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className={styles.CloseBtn}
          onClick={closeAuthDialog}
          aria-label={t('auth_cancel')}
        >
          ×
        </button>

        <p className={styles.Eyebrow}>{t('auth_local_mode')}</p>
        <h2 id="local-auth-title" className={styles.Title}>
          {authDialogMode === 'register'
            ? t('auth_register_title')
            : t('auth_login_title')}
        </h2>
        <p className={styles.Description}>
          {authDialogMode === 'register'
            ? t('auth_register_body')
            : t('auth_login_body')}
        </p>

        <form className={styles.Form} onSubmit={handleSubmit}>
          {authDialogMode === 'register' && (
            <label className={styles.Field}>
              <span>{t('auth_display_name')}</span>
              <input
                type="text"
                value={formState.displayName}
                onChange={(event) =>
                  setFormState((currentState) => ({
                    ...currentState,
                    displayName: event.target.value,
                  }))
                }
                placeholder={t('auth_display_name')}
                maxLength="60"
              />
            </label>
          )}

          <label className={styles.Field}>
            <span>{t('auth_email')}</span>
            <input
              type="email"
              value={formState.email}
              onChange={(event) =>
                setFormState((currentState) => ({
                  ...currentState,
                  email: event.target.value,
                }))
              }
              placeholder={t('auth_email')}
              autoComplete="email"
              required
            />
          </label>

          <label className={styles.Field}>
            <span>{t('auth_password')}</span>
            <input
              type="password"
              value={formState.password}
              onChange={(event) =>
                setFormState((currentState) => ({
                  ...currentState,
                  password: event.target.value,
                }))
              }
              placeholder={t('auth_password')}
              autoComplete={
                authDialogMode === 'register' ? 'new-password' : 'current-password'
              }
              required
            />
          </label>

          <p className={`${styles.Status} ${submitError ? styles.Error : ''}`}>
            {submitError ||
              (authDialogMode === 'register'
                ? t('auth_password_rule')
                : t('auth_login_hint'))}
          </p>

          <div className={styles.Actions}>
            <button type="submit" className={styles.PrimaryBtn} disabled={isLoading}>
              {isLoading
                ? t('agent_sending')
                : authDialogMode === 'register'
                  ? t('auth_submit_register')
                  : t('auth_submit_login')}
            </button>
            <button
              type="button"
              className={styles.SecondaryBtn}
              onClick={() =>
                openAuthDialog(authDialogMode === 'register' ? 'login' : 'register')
              }
            >
              {authDialogMode === 'register'
                ? t('auth_switch_to_login')
                : t('auth_switch_to_register')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )

  if (typeof document === 'undefined' || !document.body) {
    return dialog
  }

  return createPortal(dialog, document.body)
}

export default AuthDialog
