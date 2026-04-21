import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { Form, Button, Modal, Alert, Spinner, ListGroup, Badge, Dropdown, DropdownButton } from 'react-bootstrap';

interface Organization {
  id: string;
  name: string;
  inviteCode: string;
  ownerUid: string;
  Users?: Array<{
    firebaseUid: string;
    email: string;
    companyName: string;
    role: string;
  }>;
}

interface SettingsProps {
  show: boolean;
  onHide: () => void;
  user: User;
  onSaveSuccess?: () => void;
}

interface UserProfile {
  companyName: string;
  role: string;
  organizationId: string | null;
}

const Settings: React.FC<SettingsProps> = ({ show, onHide, user, onSaveSuccess }) => {
  const [profile, setProfile] = useState<UserProfile>({
    companyName: '',
    role: 'user',
    organizationId: null,
  });
  const [org, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'danger'; text: string } | null>(null);

  const [newOrgName, setNewOrgName] = useState('');
  const [inviteCodeInput, setInviteCodeInput] = useState('');

  // States for pending member updates
  const [pendingRoles, setPendingRoles] = useState<{ [uid: string]: string }>({});
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<{ uid: string, name: string } | null>(null);

  useEffect(() => {
    if (show) {
      fetchData();
    }
  }, [show, user]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const resUser = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firebaseUid: user.uid, email: user.email }),
      });
      if (resUser.ok) {
        const userData = await resUser.json();
        setProfile({
          companyName: userData.companyName || '',
          role: userData.role || 'user',
          organizationId: userData.organizationId || null,
        });

        if (userData.organizationId) {
          const resOrg = await fetch(`/api/organizations/${userData.organizationId}`);
          if (resOrg.ok) {
            const orgData = await resOrg.json();
            setOrganization(orgData);
            // Reset pending roles when data is refreshed
            setPendingRoles({});
          }
        } else {
          setOrganization(null);
        }
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim() || user.isAnonymous) return;
    setSaving(true);
    try {
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newOrgName, ownerUid: user.uid }),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: '組織を作成しました。' });
        await fetchData();
      } else {
        throw new Error('作成に失敗しました。');
      }
    } catch (error) {
      setMessage({ type: 'danger', text: 'エラーが発生しました。' });
    } finally {
      setSaving(false);
    }
  };

  const handleJoinOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCodeInput.trim() || user.isAnonymous) return;
    setSaving(true);
    try {
      const res = await fetch('/api/organizations/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode: inviteCodeInput, firebaseUid: user.uid }),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: '組織に参加しました。' });
        await fetchData();
      } else {
        const err = await res.json();
        throw new Error(err.error || '参加に失敗しました。');
      }
    } catch (error: any) {
      setMessage({ type: 'danger', text: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleRoleSelect = (uid: string, role: string) => {
    setPendingRoles(prev => ({ ...prev, [uid]: role }));
  };

  const handleUpdateMemberRole = async (memberUid: string) => {
    const newRole = pendingRoles[memberUid];
    if (!newRole) return;
    
    setSaving(true);
    try {
      const res = await fetch(`/api/organizations/members/${memberUid}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminUid: user.uid, newRole }),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: '権限を更新しました。' });
        await fetchData();
      } else {
        const err = await res.json();
        throw new Error(err.error || '更新に失敗しました。');
      }
    } catch (error: any) {
      setMessage({ type: 'danger', text: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!memberToRemove) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/organizations/members/${memberToRemove.uid}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminUid: user.uid }),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'メンバーを除外しました。' });
        setShowRemoveModal(false);
        setMemberToRemove(null);
        await fetchData();
      } else {
        const err = await res.json();
        throw new Error(err.error || '除外に失敗しました。');
      }
    } catch (error: any) {
      setMessage({ type: 'danger', text: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
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
        }),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'プロフィールを保存しました。' });
        if (onSaveSuccess) onSaveSuccess();
      } else {
        throw new Error('保存に失敗しました。');
      }
    } catch (error) {
      setMessage({ type: 'danger', text: 'エラーが発生しました。' });
    } finally {
      setSaving(false);
    }
  };

  const isOwner = org && org.ownerUid === user.uid;

  return (
    <>
      <Modal show={show} onHide={onHide} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title>組織設定</Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-4">
          {loading ? (
            <div className="text-center py-4">
              <Spinner animation="border" />
              <p className="mt-2">読み込み中...</p>
            </div>
          ) : (
            <>
              {message && <Alert variant={message.type} dismissible onClose={() => setMessage(null)}>{message.text}</Alert>}

              {/* 1. Profile Section */}
              <section className="mb-5">
                <h5 className="border-bottom pb-2 mb-3">個人プロフィール</h5>
                <Form onSubmit={handleSaveProfile}>
                  <Form.Group className="mb-3" controlId="displayName">
                    <Form.Label className="fw-bold">表示名 (部署名・氏名など)</Form.Label>
                    <Form.Control
                      type="text"
                      value={profile.companyName}
                      onChange={(e) => setProfile({ ...profile, companyName: e.target.value })}
                      placeholder="例: 情報システム部 佐藤"
                    />
                  </Form.Group>
                  
                  <Form.Group className="mb-3">
                    <Form.Label className="fw-bold">現在の権限</Form.Label>
                    <div>
                      <Badge bg={profile.role === 'admin' ? 'danger' : 'info'} className="fs-6">
                        {profile.role === 'admin' ? '管理者' : '一般ユーザー'}
                      </Badge>
                      <Form.Text className="text-muted d-block mt-1">
                        権限の変更が必要な場合は、組織のオーナーに依頼してください。
                      </Form.Text>
                    </div>
                  </Form.Group>

                  <div className="text-end">
                    <Button variant="primary" size="sm" type="submit" disabled={saving}>設定を保存</Button>
                  </div>
                </Form>
              </section>

              {/* 2. Organization Section */}
              <section>
                <h5 className="border-bottom pb-2 mb-3">所属組織</h5>
                {user.isAnonymous && !profile.organizationId && (
                  <Alert variant="warning">
                    「登録せずに試す」で利用中のため、組織機能（作成・参加）は制限されています。これらの機能を利用するにはアカウントを作成してください。
                  </Alert>
                )}
                
                {org ? (
                  <div className="bg-light p-3 rounded">
                    <div className="d-flex justify-content-between align-items-start mb-3">
                      <div>
                        <h6 className="mb-1">組織名: <span className="text-primary">{org.name}</span></h6>
                        {profile.role === 'admin' && (
                          <div className="mt-3">
                            <small className="fw-bold text-muted d-block mb-1">招待コード:</small>
                            <code className="fs-5 fw-bold bg-white px-2 py-1 border rounded d-inline-block">
                              {org.inviteCode}
                            </code>
                            <Form.Text className="text-muted d-block mt-1">
                              アカウント登録した他のメンバーが、「組織設定」画面でこの招待コードを登録することにより、組織に参加できます。
                            </Form.Text>
                          </div>
                        )}
                      </div>
                    </div>

                    {org.Users && (
                      <div className="mt-4">
                        <h6 className="small fw-bold text-muted mb-2">組織メンバー一覧</h6>
                        <ListGroup variant="flush" className="small border rounded bg-white">
                          {org.Users.map((u, i) => {
                            const currentRole = pendingRoles[u.firebaseUid] || u.role;
                            const hasChanged = currentRole !== u.role;

                            return (
                              <ListGroup.Item key={i} className="d-flex justify-content-between align-items-center">
                                <div>
                                  <strong>{u.companyName || '(名前未設定)'}</strong>
                                  <span className="text-muted ms-2">({u.email || '匿名ユーザー'})</span>
                                  {u.firebaseUid === org.ownerUid && <Badge bg="dark" className="ms-2">オーナー</Badge>}
                                </div>
                                <div className="d-flex align-items-center">
                                  {isOwner && u.firebaseUid !== user.uid ? (
                                    <>
                                      <DropdownButton
                                        variant="outline-secondary"
                                        size="sm"
                                        title={currentRole === 'admin' ? '管理者' : '一般ユーザー'}
                                        className="me-2"
                                        onSelect={(role) => role && handleRoleSelect(u.firebaseUid, role)}
                                        disabled={saving}
                                      >
                                        <Dropdown.Item eventKey="user">一般ユーザー</Dropdown.Item>
                                        <Dropdown.Item eventKey="admin">管理者</Dropdown.Item>
                                      </DropdownButton>
                                      {hasChanged && (
                                        <Button 
                                          variant="success" 
                                          size="sm" 
                                          className="me-2 py-0 px-2"
                                          onClick={() => handleUpdateMemberRole(u.firebaseUid)}
                                          disabled={saving}
                                        >
                                          更新
                                        </Button>
                                      )}
                                      <Button 
                                        variant="outline-danger" 
                                        size="sm" 
                                        className="py-0 px-2"
                                        onClick={() => {
                                          setMemberToRemove({ uid: u.firebaseUid, name: u.companyName || u.email });
                                          setShowRemoveModal(true);
                                        }}
                                        disabled={saving}
                                      >
                                        除外
                                      </Button>
                                    </>
                                  ) : (
                                    <Badge bg="light" text="dark" className="border">{u.role}</Badge>
                                  )}
                                </div>
                              </ListGroup.Item>
                            );
                          })}
                        </ListGroup>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="row g-4">
                    <div className="col-md-6">
                      <div className="card h-100 shadow-sm">
                        <div className="card-body">
                          <h6>組織を新規作成</h6>
                          <p className="small text-muted">新しく組織を登録し、メンバーを招待したい管理者の方向けです。</p>
                          <Form onSubmit={handleCreateOrg}>
                            <Form.Group className="mb-3">
                              <Form.Control
                                size="sm"
                                placeholder="新しい組織名を入力"
                                value={newOrgName}
                                onChange={(e) => setNewOrgName(e.target.value)}
                                disabled={user.isAnonymous}
                              />
                            </Form.Group>
                            <Button variant="success" size="sm" type="submit" className="w-100" disabled={!newOrgName || saving || user.isAnonymous}>
                              組織を作成
                            </Button>
                          </Form>
                        </div>
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="card h-100 shadow-sm">
                        <div className="card-body">
                          <h6>既存の組織に参加</h6>
                          <p className="small text-muted">管理者から共有された招待コードを入力してください。</p>
                          <Form onSubmit={handleJoinOrg}>
                            <Form.Group className="mb-3">
                              <Form.Control
                                size="sm"
                                placeholder="招待コードを入力"
                                value={inviteCodeInput}
                                onChange={(e) => setInviteCodeInput(e.target.value)}
                                disabled={user.isAnonymous}
                              />
                            </Form.Group>
                            <Button variant="primary" size="sm" type="submit" className="w-100" disabled={!inviteCodeInput || saving || user.isAnonymous}>
                              組織に参加
                            </Button>
                          </Form>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              <div className="d-flex justify-content-end gap-2 mt-5 pt-3 border-top">
                <Button variant="secondary" onClick={onHide} disabled={saving}>
                  閉じる
                </Button>
              </div>
            </>
          )}
        </Modal.Body>
      </Modal>

      {/* Custom Modal for Member Removal Confirmation */}
      <Modal show={showRemoveModal} onHide={() => !saving && setShowRemoveModal(false)} centered>
        <Modal.Header closeButton={!saving}>
          <Modal.Title>メンバーの除外確認</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p><strong>{memberToRemove?.name}</strong> を組織から除外してもよろしいですか？</p>
          <p className="text-danger small">※除外されたユーザーは、組織内の共有データにアクセスできなくなります。</p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowRemoveModal(false)} disabled={saving}>
            キャンセル
          </Button>
          <Button variant="danger" onClick={handleRemoveMember} disabled={saving}>
            {saving ? '実行中...' : '組織から除外する'}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default Settings;
