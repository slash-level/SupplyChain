import React, { useState } from 'react';
import { ActionItem } from '../App'; // Assuming ActionItem type is exported from App.tsx
import { Requirement, Criterion } from '../App'; // Assuming these types are also available
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import Form from 'react-bootstrap/Form';
import Table from 'react-bootstrap/Table';

interface ActionItemManagerProps {
  actionItems: ActionItem[];
  requirements: Requirement[];
  evaluationSetId: string; // Add evaluationSetId to props
  onAddActionItem: (item: Omit<ActionItem, 'actionItemId' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateActionItem: (item: ActionItem) => void;
  onDeleteActionItem: (actionItemId: string) => void;
}

const ActionItemManager: React.FC<ActionItemManagerProps> = ({
  actionItems,
  requirements,
  evaluationSetId, // Destructure evaluationSetId
  onAddActionItem,
  onUpdateActionItem,
  onDeleteActionItem,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ActionItem | null>(null);
  const [formData, setFormData] = useState({
    requirement_id: '', // ★追加
    criterion_id: '',
    taskDescription: '',
    assignee: '',
    dueDate: '',
    status: '未着手',
  });

  const unachievedCriteria = requirements
    .flatMap(req => req.criteria)
    .filter(c => c.status === '未達成' || c.status === '一部達成');

  const handleShowModal = (item: ActionItem | null = null) => {
    setEditingItem(item);
    if (item) {
      setFormData({
        requirement_id: item.requirement_id, // ★追加
        criterion_id: item.criterion_id,
        taskDescription: item.taskDescription,
        assignee: item.assignee || '',
        dueDate: item.dueDate ? new Date(item.dueDate).toISOString().split('T')[0] : '',
        status: item.status,
      });
    } else {
      setFormData({
        requirement_id: '', // ★追加
        criterion_id: '',
        taskDescription: '',
        assignee: '',
        dueDate: '',
        status: '未着手',
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingItem(null);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => {
      if (name === 'criterion_id') {
        const selectedCriterion = unachievedCriteria.find(c => c.criterion_id === value);
        return {
          ...prev,
          criterion_id: value,
          requirement_id: selectedCriterion ? selectedCriterion.requirement_id : '', // ★requirement_idも更新
        };
      }
      return { ...prev, [name]: value };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingItem) {
      onUpdateActionItem({
        ...editingItem,
        ...formData,
        dueDate: formData.dueDate || undefined,
        assignee: formData.assignee || undefined,
      });
    } else {
      onAddActionItem({
        ...formData,
        evaluationSetId: evaluationSetId,
        dueDate: formData.dueDate || undefined,
        assignee: formData.assignee || undefined,
      });
    }
    handleCloseModal();
  };

  const getCriterionText = (requirementId: string, criterionId: string): string => {
    const criterion = requirements.flatMap(r => r.criteria).find(c => c.requirement_id === requirementId && c.criterion_id === criterionId);
    return criterion ? `★${criterion.star_level} [${criterion.criterion_id}] ${criterion.criterion_text.substring(0, 50)}...` : `不明な評価基準 [${criterionId}]`;
  }

  return (
    <div className="card mt-4">
      <div className="card-header bg-info text-white">
        <h2 className="mb-0">アクションアイテム管理</h2>
      </div>
      <div className="card-body">
        <Button variant="primary" onClick={() => handleShowModal()} className="mb-3">
          新しいアクションアイテムを追加
        </Button>
        <Table striped bordered hover responsive>
          <thead>
            <tr>
              <th>関連評価基準</th>
              <th>タスク内容</th>
              <th>担当者</th>
              <th>期日</th>
              <th>ステータス</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {actionItems.map(item => (
              <tr key={item.actionItemId}>
                <td style={{minWidth: '200px'}}>{getCriterionText(item.requirement_id, item.criterion_id)}</td>
                <td>{item.taskDescription}</td>
                <td>{item.assignee}</td>
                <td>{item.dueDate ? new Date(item.dueDate).toLocaleDateString() : ''}</td>
                <td>{item.status}</td>
                <td>
                  <div className="d-flex flex-column gap-1">
                    <Button variant="outline-secondary" size="sm" className="text-nowrap w-100" onClick={() => handleShowModal(item)}>編集</Button>
                    <Button variant="outline-danger" size="sm" className="text-nowrap w-100" onClick={() => onDeleteActionItem(item.actionItemId)}>削除</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <Modal show={showModal} onHide={handleCloseModal}>
        <Modal.Header closeButton>
          <Modal.Title>{editingItem ? 'アクションアイテムの編集' : 'アクションアイテムの追加'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3">
              <Form.Label>関連する評価基準 <span className="text-danger small">(必須)</span></Form.Label>
              <Form.Select name="criterion_id" value={formData.criterion_id} onChange={handleChange} required>
                <option value="">選択してください</option>
                {requirements.map(req => {
                    const availableCriteria = req.criteria.filter(c => c.status === '未達成' || c.status === '一部達成');
                    if (availableCriteria.length === 0) return null;
                    return (
                        <optgroup key={req.id} label={`${req.id} ${req.text.substring(0, 30)}...`}>
                            {availableCriteria.map(c => (
                                <option key={c.criterion_id} value={c.criterion_id}>
                                    ★{c.star_level} [{c.criterion_id}] {c.criterion_text.substring(0, 40)}...
                                </option>
                            ))}
                        </optgroup>
                    );
                })}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>タスク内容 <span className="text-danger small">(必須)</span></Form.Label>
              <Form.Control as="textarea" name="taskDescription" value={formData.taskDescription} onChange={handleChange} required placeholder="具体的なアクションを入力してください" />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>担当者 <span className="text-muted small">(任意)</span></Form.Label>
              <Form.Control type="text" name="assignee" value={formData.assignee} onChange={handleChange} placeholder="担当者名を入力" />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>期日 <span className="text-muted small">(任意)</span></Form.Label>
              <Form.Control type="date" name="dueDate" value={formData.dueDate} onChange={handleChange} />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>ステータス <span className="text-danger small">(必須)</span></Form.Label>
              <Form.Select name="status" value={formData.status} onChange={handleChange}>
                <option value="未着手">未着手</option>
                <option value="進行中">進行中</option>
                <option value="完了">完了</option>
              </Form.Select>
            </Form.Group>
            <div className="d-grid">
              <Button variant="primary" type="submit">
                {editingItem ? '変更を保存' : '追加する'}
              </Button>
            </div>
          </Form>
        </Modal.Body>
      </Modal>
    </div>
  );
};

export default ActionItemManager;
