import React, { useState, useEffect } from 'react';
import { auth } from '../firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signInAnonymously } from 'firebase/auth';

interface AuthProps {
  onAuthSuccess: () => void;
}

const Auth: React.FC<AuthProps> = ({ onAuthSuccess }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false); // New state for agreement
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isLoggingInAnonymously, setIsLoggingInAnonymously] = useState(false);

  // On component mount, check for a flash message from sessionStorage
  useEffect(() => {
    const flashMessage = sessionStorage.getItem('auth-message');
    if (flashMessage) {
      setMessage(flashMessage);
      sessionStorage.removeItem('auth-message'); // Clear after displaying
    }
  }, []);

  const handleAuthSuccess = async (firebaseUser: any) => {
    // Ensure user data is saved/synchronized in our backend DB after any Firebase auth operation
    if (firebaseUser) {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firebaseUid: firebaseUser.uid,
          email: firebaseUser.email || '', // email is null for anonymous users
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to synchronize user data with backend.');
      }
      console.log('User synchronized with backend:', firebaseUser.email || 'Anonymous');
    }
    onAuthSuccess(); // Notify App.tsx of successful authentication
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (isRegistering && !agreedToTerms) {
      setError('利用規約およびプライバシーポリシーへの同意が必要です。');
      return;
    }

    try {
      let firebaseUser;

      if (isRegistering) {
        // Register user with Firebase
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        firebaseUser = userCredential.user;
      } else {
        // Login user
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        firebaseUser = userCredential.user;
      }

      await handleAuthSuccess(firebaseUser);
    } catch (err: any) {
      console.error('Authentication error:', err);
      let customError = '認証中に不明なエラーが発生しました。しばらくしてからもう一度お試しください。';
      switch (err.code) {
        case 'auth/invalid-credential':
        case 'auth/user-not-found': // Firebase often returns invalid-credential for user-not-found for security
        case 'auth/wrong-password':
          customError = 'メールアドレスまたはパスワードが正しくありません。';
          break;
        case 'auth/email-already-in-use':
          customError = 'このメールアドレスは既に使用されています。';
          break;
        case 'auth/weak-password':
          customError = 'パスワードは6文字以上で設定してください。';
          break;
        case 'auth/invalid-email':
          customError = '無効なメールアドレス形式です。';
          break;
        default:
          // For backend errors or other unexpected issues
          if (err.message.includes('Failed to synchronize user data')) {
            customError = 'ユーザー情報の保存に失敗しました。';
          }
          break;
      }
      setError(customError);
    }
  };

  const handleAnonymousLogin = async () => {
    setError('');
    setMessage('');
    setIsLoggingInAnonymously(true);
    try {
      const userCredential = await signInAnonymously(auth);
      await handleAuthSuccess(userCredential.user);
    } catch (err: any) {
      console.error('Anonymous authentication error:', err);
      setError('ゲストログインに失敗しました。しばらくしてからもう一度お試しください。');
    } finally {
      setIsLoggingInAnonymously(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email) {
      setError('パスワードをリセットするにはメールアドレスを入力してください。');
      setMessage('');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      setMessage('ご入力のメールアドレスにアカウントが存在する場合、パスワードリセット用のリンクを送信しました。');
      setError('');
    } catch (err: any) {
      setError(err.message);
      setMessage('');
    }
  };

  // Clears messages when toggling between login and register forms
  const toggleRegistering = () => {
    setIsRegistering(!isRegistering);
    setError('');
    setMessage('');
    setAgreedToTerms(false); // Reset agreement on toggle
  };

  return (
    <div className="container mt-5">
      <div className="row justify-content-center">
        <div className="col-md-6">
          <div className="card">
            <div className="card-header text-center">
              <h3>{isRegistering ? '新規登録' : 'ログイン'}</h3>
            </div>
            <div className="card-body">
              <form onSubmit={handleSubmit}>
                <div className="mb-3">
                  <label htmlFor="emailInput" className="form-label">メールアドレス</label>
                  <input
                    type="email"
                    className="form-control"
                    id="emailInput"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="mb-3">
                  <label htmlFor="passwordInput" className="form-label">パスワード</label>
                  <input
                    type="password"
                    className="form-control"
                    id="passwordInput"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  {isRegistering && (
                    <small className="form-text text-muted">パスワードは6文字以上です。</small>
                  )}
                </div>

                {isRegistering && (
                  <div className="mb-3 form-check">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      id="termsCheckbox"
                      checked={agreedToTerms}
                      onChange={(e) => setAgreedToTerms(e.target.checked)}
                      required
                    />
                    <label className="form-check-label small" htmlFor="termsCheckbox">
                      <a href="https://github.com/slash-level/SupplyChain/blob/main/TERMS.md" target="_blank" rel="noopener noreferrer">利用規約</a>
                      {' '}および{' '}
                      <a href="https://github.com/slash-level/SupplyChain/blob/main/PRIVACY.md" target="_blank" rel="noopener noreferrer">プライバシーポリシー</a>
                      に同意します
                      <br />
                      <span className="text-muted">（外部サイト: GitHubへ移動します）</span>
                    </label>
                  </div>
                )}

                {error && <div className="alert alert-danger">{error}</div>}
                {message && <div className="alert alert-success">{message}</div>}
                <div className="d-grid gap-2">
                  <button 
                    type="submit" 
                    className="btn btn-primary"
                    disabled={isRegistering && !agreedToTerms}
                  >
                    {isRegistering ? '同意して登録' : 'ログイン'}
                  </button>
                </div>
              </form>
              <div className="mt-3 text-center">
                <button
                  className="btn btn-link"
                  onClick={toggleRegistering}
                >
                  {isRegistering ? 'すでにアカウントをお持ちの方はこちら' : '新規登録はこちら'}
                </button>
              </div>
              {!isRegistering && (
                <div className="mt-2 text-center border-top pt-3">
                  <button
                    className="btn btn-link"
                    onClick={handlePasswordReset}
                  >
                    パスワードをお忘れですか？
                  </button>
                </div>
              )}

              {/* Guest Login Section */}
              {!isRegistering && (
                <div className="text-center mt-3 border-top pt-3">
                  <p className="small text-muted mb-2">登録せずに試してみたい方はこちら</p>
                  <button 
                    className="btn btn-outline-secondary w-100" 
                    onClick={handleAnonymousLogin}
                    disabled={isLoggingInAnonymously}
                  >
                    {isLoggingInAnonymously ? 'ログイン中...' : 'ゲストとして利用する'}
                  </button>
                  <div className="small text-muted mt-2" style={{ fontSize: '0.75rem' }}>
                    ※ゲスト利用の場合、ログアウトやブラウザのキャッシュ削除を行うと、入力したデータには二度とアクセスできなくなります。<br />
                    ※将来的に一部機能が制限される可能性があります。
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
