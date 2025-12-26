import React from 'react';
import { Modal, Button } from 'react-bootstrap';

interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({ isOpen, onClose, onConfirm }) => {
  return (
    <Modal show={isOpen} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>アカウント削除の確認</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>本当にアカウントを削除しますか？</p>
        <p>この操作は元に戻せません。評価データを含む、あなたに関連するすべてのデータが削除されます。</p>
        <p>続行する場合は「削除を確定」ボタンを押してください。</p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          キャンセル
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          削除を確定
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default DeleteAccountModal;
