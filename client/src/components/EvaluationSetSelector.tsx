import React, { useState, useEffect, useCallback } from 'react';
import { User } from 'firebase/auth';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import ListGroup from 'react-bootstrap/ListGroup';
import Card from 'react-bootstrap/Card';
import Spinner from 'react-bootstrap/Spinner';
import Alert from 'react-bootstrap/Alert';
import Modal from 'react-bootstrap/Modal'; // For confirmation dialog

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
        throw new Error('新しい評価セットの作成に失敗しました。');
      }

      const newSet = await response.json();
      onSelect(newSet.evaluationSetId); // Immediately select the new set

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsCreating(false);
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
        body: JSON.stringify({ firebaseUid: user.uid }), // Pass firebaseUid for authorization
      });

      if (!response.ok) {
        throw new Error('評価セットの削除に失敗しました。');
      }

      // If the currently selected evaluation set was deleted, clear the selection
      if (deletingSetId === localStorage.getItem('selectedEvaluationSetId')) {
        localStorage.removeItem('selectedEvaluationSetId');
        onSelect(''); // Clear selection in App.tsx
      }
      
      fetchEvaluationSets(); // Refresh the list
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
                className="d-flex justify-content-between align-items-center" // Changed to align-items-center
              >
                <div className="me-auto">
                  <a href="#" onClick={(e) => { e.preventDefault(); onSelect(set.evaluationSetId); }} className="fw-bold text-decoration-none">
                    {set.name}
                  </a>
                  {set.description && <small className="text-muted d-block">{set.description}</small>}
                  <small className="text-muted">最終更新: {new Date(set.updatedAt).toLocaleDateString()}</small>
                </div>
                <Button 
                  variant="danger" 
                  size="sm" 
                  onClick={() => handleDeleteClick(set.evaluationSetId)}
                  disabled={isDeleting}
                >
                  削除
                </Button>
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

      {/* Delete Confirmation Modal */}
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
