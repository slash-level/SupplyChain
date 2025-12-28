import React, { useState, useEffect, useCallback } from 'react';
import { User } from 'firebase/auth';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import ListGroup from 'react-bootstrap/ListGroup';
import Card from 'react-bootstrap/Card';
import Spinner from 'react-bootstrap/Spinner';
import Alert from 'react-bootstrap/Alert';
import Modal from 'react-bootstrap/Modal';

interface EvaluationSet {
  evaluationSetId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EvaluationSetSelectorProps {
  user: User;
  onSelect: (evaluationSetId: string) => void;
}

const EvaluationSetSelector: React.FC<EvaluationSetSelectorProps> = ({ user, onSelect }) => {
  const [evaluationSets, setEvaluationSets] = useState<EvaluationSet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Editing state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingSetId, setDeletingSetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);


  const fetchEvaluationSets = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch(`/api/evaluationsets/${user.uid}`);
      if (!response.ok) {
        throw new Error('評価セットの読み込みに失敗しました。');
      }
      const data = await response.json();
      setEvaluationSets(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [user.uid]);

  useEffect(() => {
    fetchEvaluationSets();
  }, [fetchEvaluationSets]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setError('評価名を指定してください。');
      return;
    }
    
    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch('/api/evaluationsets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firebaseUid: user.uid,
          name: newName,
          description: newDescription,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || '新しい評価セットの作成に失敗しました。');
      }

      const newSet = await response.json();
      onSelect(newSet.evaluationSetId);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleEditClick = (set: EvaluationSet) => {
    setEditingSetId(set.evaluationSetId);
    setEditName(set.name);
    setEditDescription(set.description || '');
    setShowEditModal(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSetId || !editName.trim()) return;

    setIsUpdating(true);
    setError(null);

    try {
      const response = await fetch(`/api/evaluationsets/${editingSetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          description: editDescription,
        }),
      });

      if (!response.ok) {
        throw new Error('評価セットの更新に失敗しました。');
      }

      await fetchEvaluationSets();
      setShowEditModal(false);
      setEditingSetId(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteClick = (evaluationSetId: string) => {
    setDeletingSetId(evaluationSetId);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingSetId) return;

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/evaluationsets/${deletingSetId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firebaseUid: user.uid }),
      });

      if (!response.ok) {
        throw new Error('評価セットの削除に失敗しました。');
      }

      if (deletingSetId === localStorage.getItem('selectedEvaluationSetId')) {
        localStorage.removeItem('selectedEvaluationSetId');
        onSelect('');
      }
      
      fetchEvaluationSets();
      setShowDeleteConfirm(false);
      setDeletingSetId(null);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
    setDeletingSetId(null);
  };


  if (isLoading) {
    return (
      <div className="text-center">
        <Spinner animation="border" role="status">
          <span className="visually-hidden">読み込み中...</span>
        </Spinner>
        <p>評価セットを読み込んでいます...</p>
      </div>
    );
  }

  return (
    <div className="container mt-4" style={{ maxWidth: '800px' }}>
      <Card>
        <Card.Header as="h2" className="text-center">評価セットの選択</Card.Header>
        <Card.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          
          <ListGroup variant="flush">
            {evaluationSets.map(set => (
              <ListGroup.Item 
                key={set.evaluationSetId} 
                className="d-flex justify-content-between align-items-center"
              >
                <div className="me-auto" style={{ maxWidth: '60%' }}>
                  <a href="#" onClick={(e) => { e.preventDefault(); onSelect(set.evaluationSetId); }} className="fw-bold text-decoration-none text-truncate d-block">
                    {set.name}
                  </a>
                  {set.description && <small className="text-muted d-block text-truncate">{set.description}</small>}
                  <small className="text-muted">最終更新: {new Date(set.updatedAt).toLocaleDateString()}</small>
                </div>
                <div className="d-flex align-items-center">
                    <Button 
                    variant="outline-secondary" 
                    size="sm" 
                    className="me-2"
                    onClick={() => handleEditClick(set)}
                    disabled={isDeleting}
                    >
                    編集
                    </Button>
                    <Button 
                    variant="danger" 
                    size="sm" 
                    onClick={() => handleDeleteClick(set.evaluationSetId)}
                    disabled={isDeleting}
                    >
                    削除
                    </Button>
                </div>
              </ListGroup.Item>
            ))}
          </ListGroup>

          {evaluationSets.length === 0 && !showNewForm && (
            <div className="text-center p-3">
              <p>まだ評価セットがありません。</p>
            </div>
          )}

          <div className="mt-4">
            {showNewForm ? (
              <Form onSubmit={handleCreate}>
                <h3 className="mb-3">新しい評価セットを作成</h3>
                <Form.Group className="mb-3" controlId="newSetName">
                  <Form.Label>評価名</Form.Label>
                  <Form.Control
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="例: 2025年度 第1四半期評価"
                    required
                  />
                </Form.Group>
                <Form.Group className="mb-3" controlId="newSetDescription">
                  <Form.Label>説明（任意）</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={2}
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="例: ISMS内部監査のための自己評価"
                  />
                </Form.Group>
                <div className="d-flex justify-content-end">
                  <Button variant="secondary" onClick={() => setShowNewForm(false)} className="me-2" disabled={isCreating}>
                    キャンセル
                  </Button>
                  <Button variant="primary" type="submit" disabled={isCreating}>
                    {isCreating ? (
                      <>
                        <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" />
                        <span> 作成中...</span>
                      </>
                    ) : '作成して開始'}
                  </Button>
                </div>
              </Form>
            ) : (
              <div className="text-center">
                <Button variant="success" onClick={() => setShowNewForm(true)}>
                  + 新しい評価セットを作成
                </Button>
              </div>
            )}
          </div>
        </Card.Body>
      </Card>

      <Modal show={showEditModal} onHide={() => setShowEditModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>評価セットの編集</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form onSubmit={handleUpdate}>
            <Form.Group className="mb-3" controlId="editSetName">
              <Form.Label>評価名</Form.Label>
              <Form.Control
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3" controlId="editSetDescription">
              <Form.Label>説明</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </Form.Group>
            <div className="d-flex justify-content-end">
                <Button variant="secondary" onClick={() => setShowEditModal(false)} className="me-2" disabled={isUpdating}>
                    キャンセル
                </Button>
                <Button variant="primary" type="submit" disabled={isUpdating}>
                    {isUpdating ? (
                    <>
                        <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" />
                        <span> 更新中...</span>
                    </>
                    ) : '更新'}
                </Button>
            </div>
          </Form>
        </Modal.Body>
      </Modal>

      <Modal show={showDeleteConfirm} onHide={handleDeleteCancel} centered>
        <Modal.Header closeButton>
          <Modal.Title>評価セットの削除確認</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          本当にこの評価セットを削除しますか？この操作は元に戻せません。
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleDeleteCancel} disabled={isDeleting}>
            キャンセル
          </Button>
          <Button variant="danger" onClick={handleDeleteConfirm} disabled={isDeleting}>
            {isDeleting ? (
              <>
                <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" />
                <span> 削除中...</span>
              </>
            ) : '削除'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default EvaluationSetSelector;