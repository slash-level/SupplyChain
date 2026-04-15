import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { Form, Button, Modal, Alert, Spinner } from 'react-bootstrap';

interface SettingsProps {
  show: boolean;
  onHide: () => void;
  user: User;
  onSaveSuccess?: () => void;
}

interface UserProfile {
  companyName: string;
  companyId: string;
  role: string;
}

const Settings: React.FC<SettingsProps> = ({ show, onHide, user, onSaveSuccess }) => {
  const [profile, setProfile] = useState<UserProfile>({
    companyName: '',
    companyId: '',
    role: 'user',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'danger'; text: string } | null>(null);

  useEffect(() => {
    if (show) {
      const fetchProfile = async () => {
        try {
          setLoading(true);
          const res = await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ firebaseUid: user.uid, email: user.email }),
          });
          if (res.ok) {
            const data = await res.json();
            setProfile({
              companyName: data.companyName || '',
              companyId: data.companyId || '',
              role: data.role || 'user',
            });
          }
        } catch (error) {
          console.error('Failed to fetch profile:', error);
        } finally {
          setLoading(false);
        }
      };
      fetchProfile();
    }
  }, [show, user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firebaseUid: user.uid,
          email: user.email,
          companyName: profile.companyName,
          companyId: profile.companyId,
          role: profile.role,
        }),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: '設定を保存しました。' });
        if (onSaveSuccess) onSaveSuccess();
        setTimeout(() => {
          onHide();
          setMessage(null);
        }, 1500);
      } else {
        throw new Error('保存に失敗しました。');
      }
    } catch (error) {
      setMessage({ type: 'danger', text: 'エラーが発生しました。' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title>組織・プロフィール設定</Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-4">
        {loading ? (
          <div className="text-center py-4">
            <Spinner animation="border" />
            <p className="mt-2">読み込み中...</p>
          </div>
        ) : (
          <>
            <Alert variant="info">
              「権限」を「管理者」に設定すると、同じ組織コードを持つ他のユーザの評価セットを参照・編集できます。
            </Alert>

            {message && <Alert variant={message.type}>{message.text}</Alert>}

            <Form onSubmit={handleSave}>
              <Form.Group className="mb-3" controlId="companyName">
                <Form.Label className="fw-bold">組織名（部署名など）</Form.Label>
                <Form.Control
                  type="text"
                  value={profile.companyName}
                  onChange={(e) => setProfile({ ...profile, companyName: e.target.value })}
                  placeholder="例: 情報システム部"
                />
                <Form.Text className="text-muted">
                  レポートに出力される作成者名として使用されます。
                </Form.Text>
              </Form.Group>

              <Form.Group className="mb-3" controlId="companyId">
                <Form.Label className="fw-bold">組織コード</Form.Label>
                <Form.Control
                  type="text"
                  value={profile.companyId}
                  onChange={(e) => setProfile({ ...profile, companyId: e.target.value })}
                  placeholder="例: MY-ORG-2026"
                />
                <Form.Text className="text-muted">
                  組織内で共通のコードを設定してください。
                </Form.Text>
              </Form.Group>

              <Form.Group className="mb-4" controlId="role">
                <Form.Label className="fw-bold">権限</Form.Label>
                <Form.Select
                  value={profile.role}
                  onChange={(e) => setProfile({ ...profile, role: e.target.value })}
                >
                  <option value="user">一般ユーザー</option>
                  <option value="admin">管理者 (組織全体の閲覧・編集が可能)</option>
                </Form.Select>
                <Form.Text className="text-muted">
                  「管理者」に設定すると、同じ組織コードを持つ全ユーザーの評価セットをダッシュボードで見ることができます。
                </Form.Text>
              </Form.Group>

              <div className="d-grid gap-2 d-md-flex justify-content-md-end">
                <Button variant="secondary" onClick={onHide} className="me-md-2" disabled={saving}>
                  キャンセル
                </Button>
                <Button variant="primary" type="submit" disabled={saving}>
                  {saving ? '保存中...' : '設定を保存する'}
                </Button>
              </div>
            </Form>
          </>
        )}
      </Modal.Body>
    </Modal>
  );
};

export default Settings;
