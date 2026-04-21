import React, { useState, useEffect, useMemo } from 'react';
import Accordion from 'react-bootstrap/Accordion';
import Sidebar from './components/Sidebar';
import Auth from './components/Auth';
import EvaluationSetSelector from './components/EvaluationSetSelector'; // Import the new component
import ActionItemManager from './components/ActionItemManager'; // Import the new component
import Dashboard from './components/Dashboard'; // Import the new Dashboard component
import Settings from './components/Settings'; // 新しく追加
import DeleteAccountModal from './components/DeleteAccountModal';
import { auth } from './firebase';
import { User, onAuthStateChanged, signOut, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import Button from 'react-bootstrap/Button';
import Spinner from 'react-bootstrap/Spinner';
import ReactMarkdown from 'react-markdown';
import Modal from 'react-bootstrap/Modal';
import Form from 'react-bootstrap/Form';
import Alert from 'react-bootstrap/Alert';
import { Container, Nav, Navbar, Badge } from 'react-bootstrap';

export type Status = '未評価' | '達成' | '未達成' | '該当なし' | '一部達成';

// Data model for AI Advice, as returned from the server
interface AIAdvice {
  advice_text: string;
  updatedAt: string;
}

// Data model for a single criterion from the backend
export interface Criterion {
  requirement_id: string;
  requirement_name?: string;
  requirement_text: string;
  star_level: number;
  criterion_id: string;
  criterion_text: string;
  category1_no: string;
  category1: string;
  category2_no: string;
  category2: string;
  level3_no: string;
  Level4_no: string;
  // Frontend-managed state
  status: Status;
  notes: string;
  advice?: AIAdvice; // AI advice is now part of the criterion
}

// New data model for a Requirement, which groups criteria
export interface Requirement {
  id: string; // requirement_id
  name?: string; // requirement_name
  text: string; // requirement_text
  category1_no: string;
  category1: string;
  category2_no: string;
  category2: string;
  criteria: Criterion[];
  overallStatus: Status;
}

export interface ActionItem {
  actionItemId: string;
  evaluationSetId: string;
  requirement_id: string; // 追加
  criterion_id: string;
  taskDescription: string;
  assignee?: string;
  dueDate?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

// --- Helper Functions ---

const getDynamicId = (req: Requirement, starFilter: '3' | '4'): string => {
    if (starFilter === '3') {
        const crit3 = req.criteria.find(c => c.level3_no);
        if (crit3 && crit3.level3_no) return crit3.level3_no;
    }
    const crit4 = req.criteria.find(c => c.Level4_no);
    if (crit4 && crit4.Level4_no) return crit4.Level4_no;
    return req.id;
};

const calculateOverallStatus = (criteria: Criterion[]): Status => {
    if (!criteria || criteria.length === 0) return '該当なし';
    const statuses = criteria.map(c => c.status);
    if (statuses.includes('未評価')) return '未評価';
    const hasAchieved = statuses.includes('達成');
    const hasNotAchieved = statuses.includes('未達成');
    const hasPartiallyAchieved = statuses.includes('一部達成');
    if ((hasAchieved && hasNotAchieved) || (hasAchieved && hasPartiallyAchieved) || (hasNotAchieved && hasPartiallyAchieved)) {
        return '一部達成';
    }
    if (hasNotAchieved) return '未達成';
    if (hasPartiallyAchieved) return '一部達成';
    if (hasAchieved) return '達成';
    return '未評価';
};

// --- UI Components ---

const StatusBadge: React.FC <{ status: Status }> = ({ status }) => {
  const badgeClass = {
    '達成': 'bg-success',
    '未達成': 'bg-danger',
    '該当なし': 'bg-secondary',
    '未評価': 'bg-light text-dark',
    '一部達成': 'bg-warning text-dark'
  }[status];
  return <span className={`badge ${badgeClass}`}>{status}</span>;
};

const CriterionItem: React.FC <{
    criterion: Criterion, 
    onUpdate: (updatedCriterion: Criterion) => void 
}> = ({ criterion, onUpdate }) => {

    const handleStatusChange = (newStatus: Status) => {
        onUpdate({ ...criterion, status: newStatus });
    };

    const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onUpdate({ ...criterion, notes: e.target.value });
    };

    return (
        <div className="list-group-item">
            <div className="d-flex justify-content-between align-items-start">
                <div className="me-auto">
                    <div className="fw-bold" style={{ whiteSpace: 'pre-wrap' }}>
                        ★{criterion.star_level} {criterion.criterion_id}<br/>
                        {criterion.criterion_text}
                    </div>
                </div>
                <StatusBadge status={criterion.status} />
            </div>
            <div className="mt-2">
                <div className="btn-group btn-group-sm" role="group">
                    <button type="button" className={`btn ${criterion.status === '達成' ? 'btn-success' : 'btn-outline-success'}`} onClick={() => handleStatusChange('達成')}>達成</button>
                    <button type="button" className={`btn ${criterion.status === '未達成' ? 'btn-danger' : 'btn-outline-danger'}`} onClick={() => handleStatusChange('未達成')}>未達成</button>
                    <button type="button" className={`btn ${criterion.status === '該当なし' ? 'btn-secondary' : 'btn-outline-secondary'}`} onClick={() => handleStatusChange('該当なし')}>該当なし</button>
                </div>
            </div>
            <div className="mt-3">
                <label htmlFor={`notes-${criterion.requirement_id}-${criterion.criterion_id}`} className="form-label small text-muted">備考:</label>
                <textarea
                    id={`notes-${criterion.requirement_id}-${criterion.criterion_id}`}
                    className="form-control form-control-sm"
                    rows={2}
                    value={criterion.notes}
                    onChange={handleNotesChange}
                    placeholder="未達成の状況や改善点などを記入してください"
                ></textarea>
            </div>
        </div>
    );
};

const RequirementItem: React.FC <{
    requirement: Requirement, 
    onUpdate: (updatedCriterion: Criterion) => void,
    starFilter: '3' | '4'
}> = ({ requirement, onUpdate, starFilter }) => {

    return (
        <Accordion.Item eventKey={requirement.id} id={`req-item-${requirement.id}`}>
            <Accordion.Header>
                <div className="d-flex justify-content-between w-100 align-items-center me-3">
                    <span><strong>{requirement.id}. {requirement.name ? <>{`【${requirement.name}】`}<br/></> : ''}{requirement.text}</strong></span>
                    <StatusBadge status={requirement.overallStatus} />
                </div>
            </Accordion.Header>
            <Accordion.Body>
                <div className="list-group">
                    {requirement.criteria.map(criterion => (
                        <CriterionItem key={criterion.criterion_id} criterion={criterion} onUpdate={onUpdate} />
                    ))}
                </div>
            </Accordion.Body>
        </Accordion.Item>
    );
};

const ProgressSummary: React.FC <{ requirements: Requirement[], id?: string }> = ({ requirements, id }) => {
    const total = requirements.length;
    if (total === 0) return null;

    const achieved = requirements.filter(r => r.overallStatus === '達成').length;
    const unachieved = requirements.filter(r => r.overallStatus === '未達成').length;
    const partiallyAchieved = requirements.filter(r => r.overallStatus === '一部達成').length;
    const notApplicable = requirements.filter(r => r.overallStatus === '該当なし').length;
    const evaluated = achieved + unachieved + partiallyAchieved + notApplicable;
    const unevaluated = total - evaluated;

    return (
        <div className="card mb-4" id={id}>
            <div className="card-header"><h3 className="mb-0">進捗サマリー</h3></div>
            <div className="card-body">
                <div className="d-flex justify-content-between"><span>評価進捗</span><span>{evaluated} / {total} 件 (評価済み)</span></div>
                <div className="progress" style={{height: '20px'}}>
                    <div className="progress-bar" role="progressbar" style={{ width: `${evaluated / total * 100}%` }} aria-valuenow={evaluated / total * 100}>{Math.round(evaluated / total * 100)}%</div>
                </div>
                <div className="row text-center mt-3">
                    <div className="col"> 
                        <h5 className="mb-0">{achieved}</h5>
                        <span className="text-success small">達成</span>
                    </div>
                    <div className="col"> 
                        <h5 className="mb-0">{unachieved}</h5>
                        <span className="text-danger small">未達成</span>
                    </div>
                    <div className="col"> 
                        <h5 className="mb-0">{partiallyAchieved}</h5>
                        <span className="text-warning text-dark small">一部達成</span>
                    </div>
                    <div className="col"> 
                        <h5 className="mb-0">{notApplicable}</h5>
                        <span className="text-secondary small">該当なし</span>
                    </div>
                    <div className="col"> 
                        <h5 className="mb-0">{unevaluated}</h5>
                        <span className="text-muted small">未評価</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

const UnachievedItems: React.FC <{
    requirements: Requirement[], 
    starFilter: '3' | '4',
    onGetAdvice: (criterion: Criterion, requirement: Requirement) => void,
    loadingAdviceIds: Set<string>, // Changed prop type
    adviceError: { criterionId: string; message: string } | null
}> = ({ requirements, starFilter, onGetAdvice, loadingAdviceIds, adviceError }) => {
    const groupedUnachieved = useMemo(() => {
        const grouped: Map<string, Map<string, Map<string, { req: Requirement; criteria: Criterion[] }>>> = new Map();

        requirements.forEach(req => {
            const unachievedCrits = req.criteria.filter(c => c.status === '未達成' || c.status === '一部達成');
            if (unachievedCrits.length > 0) {
                if (!grouped.has(req.category1)) grouped.set(req.category1, new Map());
                const cat1Map = grouped.get(req.category1)!;

                if (!cat1Map.has(req.category2)) cat1Map.set(req.category2, new Map());
                const cat2Map = cat1Map.get(req.category2)!;
                
                cat2Map.set(req.id, { req, criteria: unachievedCrits });
            }
        });
        return grouped;
    }, [requirements]);

    const handleScrollToItem = (reqId: string) => {
        const accordionItem = document.getElementById(`req-item-${reqId}`);
        if (accordionItem) {
            accordionItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const headerButton = accordionItem.querySelector('.accordion-header button');
            if (headerButton && headerButton.getAttribute('aria-expanded') === 'false') {
                (headerButton as HTMLElement).click();
            }
        }
    };

    return (
        <div className="card mt-4">
            <div className="card-header bg-warning">
                <h2 className="mb-0">要対応項目 (未達成・一部達成)</h2>
            </div>
            <div className="card-body">
                {groupedUnachieved.size === 0 ? (
                    <p>現在、未達成または一部達成の項目はありません。</p>
                ) : (
                    Array.from(groupedUnachieved.entries()).map(([cat1, cat1Map]) => {
                        const firstReqInCat1 = cat1Map.values().next().value?.values().next().value?.req;
                        return (
                            <div key={cat1} className="mb-4">
                                <h3 className="bg-light p-2 rounded">{firstReqInCat1?.category1_no}. {cat1}</h3>
                                {Array.from(cat1Map.entries()).map(([cat2, cat2Map]) => {
                                    const firstReqInCat2 = cat2Map.values().next().value?.req;
                                    return (
                                        <div key={cat2} className="ps-3 mb-3">
                                            <h4 className="border-bottom pb-1 mb-2">{firstReqInCat2?.category2_no}. {cat2}</h4>
                                            {Array.from(cat2Map.entries()).map(([reqId, { req, criteria }]) => (
                                                <div key={reqId} className="mb-3 ps-3">
                                                    <div className="d-flex w-100 justify-content-between align-items-center mb-2">
                                                        <h5 className="mb-0">{req.id}. {req.name ? `【${req.name}】 ` : ''}{req.text}</h5>
                                                        <button className="btn btn-sm btn-outline-primary" onClick={() => handleScrollToItem(reqId)}>
                                                            該当箇所へ移動
                                                        </button>
                                                    </div>
                                                    <div className="list-group">
                                                        {criteria.map(criterion => {
                                                            const isLoading = loadingAdviceIds.has(criterion.criterion_id); // Changed check
                                                            const isThisItemError = adviceError?.criterionId === criterion.criterion_id;
                                                            return (
                                                                <div key={criterion.criterion_id} className="list-group-item list-group-item-action flex-column align-items-start">
                                                                    <p className="mb-1 fw-bold" style={{ whiteSpace: 'pre-wrap' }}>
                                                                        ★{criterion.star_level} {criterion.criterion_id}<br/>
                                                                        {criterion.criterion_text}
                                                                    </p>
                                                                    <div className="d-flex align-items-center mb-2">
                                                                        <strong>ステータス:</strong><span className="ms-2"><StatusBadge status={criterion.status} /></span>
                                                                    </div>
                                                                    {criterion.notes && (
                                                                        <div className="mt-2">
                                                                            <strong>備考:</strong>
                                                                            <p className="bg-light p-2 rounded mb-0">{criterion.notes}</p>
                                                                        </div>
                                                                    )}
                                                                    {isThisItemError && <Alert variant="danger" className="mt-3">{adviceError.message}</Alert>}
                                                                    <div className="mt-3 border-top pt-3">
                                                                        {criterion.advice ? (
                                                                            <div>
                                                                                <div className="d-flex justify-content-between align-items-center">
                                                                                    <h6 className="mb-0 text-info">AIによる改善アドバイス</h6>
                                                                                    <small className="text-muted">最終更新: {new Date(criterion.advice.updatedAt).toLocaleString()}</small>
                                                                                </div>
                                                                                <div className="p-3 mt-2 bg-light rounded"><ReactMarkdown>{criterion.advice.advice_text}</ReactMarkdown></div>
                                                                                <div className="text-end mt-2">
                                                                                    <Button variant="outline-info" size="sm" onClick={() => onGetAdvice(criterion, req)} disabled={isLoading}>
                                                                                        {isLoading ? <><Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" /> 更新中...</> : '内容を更新する'}
                                                                                    </Button>
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="text-end">
                                                                                <Button variant="info" size="sm" onClick={() => onGetAdvice(criterion, req)} disabled={isLoading}>
                                                                                    {isLoading ? <><Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" /> 生成中...</> : 'AIによる改善アドバイスを生成'}
                                                                                </Button>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    }) 
                )}
            </div>
        </div>
    );
};


function App() {
  const [allRequirements, setAllRequirements] = useState<Requirement[]>([]);
  const [message, setMessage] = useState('...');
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [currentView, setCurrentView] = useState<'main'>('main'); // settingsを削除
  const [showSettingsModal, setShowSettingsModal] = useState(false); // モーダル用のステート
  const [evaluationSetId, setEvaluationSetId] = useState<string | null>(() => {
    return localStorage.getItem('selectedEvaluationSetId');
  });
  const [evaluationSetName, setEvaluationSetName] = useState<string>('');
  const [evaluationSetCreator, setEvaluationSetCreator] = useState<{ email: string, companyName: string } | null>(null);
  const [starFilter, setStarFilter] = useState<'3' | '4'>(() => {
    const savedFilter = localStorage.getItem('starFilter');
    return savedFilter === '4' ? '4' : '3';
  });

  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [loadingActionItems, setLoadingActionItems] = useState(false);

  const [loadingAdviceIds, setLoadingAdviceIds] = useState<Set<string>>(new Set()); // Changed state
  const [adviceError, setAdviceError] = useState<{ criterionId: string; message: string } | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // State for Password Change Modal
  const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordChangeError, setPasswordChangeError] = useState('');
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState('');

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [notification, setNotification] = useState<{type: 'success' | 'danger', message: string} | null>(null);

  useEffect(() => { 
    localStorage.setItem('starFilter', starFilter); 
    // DBへの同期
    if (evaluationSetId && user) {
      fetch(`/api/evaluationsets/${evaluationSetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starLevel: parseInt(starFilter, 10) }),
      }).catch(err => console.error('Failed to sync starLevel:', err));
    }
  }, [starFilter, evaluationSetId, user]);

  useEffect(() => {
    if (evaluationSetId) {
      localStorage.setItem('selectedEvaluationSetId', evaluationSetId);
    } else {
      localStorage.removeItem('selectedEvaluationSetId');
      setEvaluationSetName('');
      setEvaluationSetCreator(null); // 追加
    }
  }, [evaluationSetId]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, currentUser => {
      setNotification(null);
      setUser(currentUser);
      setLoadingAuth(false);
      if (currentUser) {
        fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firebaseUid: currentUser.uid, email: currentUser.email }) });
      } else {
        setEvaluationSetId(null);
        setAllRequirements([]);
        setActionItems([]);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (evaluationSetId) {
      setMessage('評価データを読み込み中...');
      setLoadingActionItems(true);

      const fetchData = async () => {
        try {
            const resSet = await fetch(`/api/evaluationset/${evaluationSetId}`);
            if (!resSet.ok) {
                // Evaluation set not found or ID is malformed (e.g. after DB reset)
                console.warn(`Evaluation set ${evaluationSetId} could not be retrieved. Resetting...`);
                localStorage.removeItem('selectedEvaluationSetId');
                setEvaluationSetId(null);
                setNotification({ type: 'danger', message: '選択された評価セットが見つかりませんでした。削除されたか、データに不整合が発生した可能性があります。' });
                return;
            }
            
            const dataSet = await resSet.json();
            setEvaluationSetName(dataSet.name);
            if (dataSet.starLevel) {
              setStarFilter(dataSet.starLevel.toString() as '3' | '4');
            }
            if (dataSet.User) {
              setEvaluationSetCreator({
                email: dataSet.User.email,
                companyName: dataSet.User.companyName
              });
            }

            const [criteriaData, answersData, actionItemsData] = await Promise.all([
                fetch('/api/criteria').then(res => res.ok ? res.json() : []),
                fetch(`/api/answers/${evaluationSetId}`).then(res => res.ok ? res.json() : []),
                fetch(`/api/actionitems/${evaluationSetId}`).then(res => res.ok ? res.json() : [])
            ]);

            const answersMap = new Map<string, { status: Status, notes: string, advice?: AIAdvice }>(answersData.map((a: any) => [`${a.requirement_id}-${a.criterion_id}`, { status: a.status, notes: a.notes, advice: a.advice }]));
            
            const criteriaWithAnswers: Criterion[] = criteriaData.map((c: any) => ({
            ...c,
            status: answersMap.get(`${c.requirement_id}-${c.criterion_id}`)?.status || '未評価',
            notes: answersMap.get(`${c.requirement_id}-${c.criterion_id}`)?.notes || '',
            advice: answersMap.get(`${c.requirement_id}-${c.criterion_id}`)?.advice
            }));

            const groupedByReqId = new Map<string, Criterion[]>();
            criteriaWithAnswers.forEach(c => {
                const group = groupedByReqId.get(c.requirement_id) || [];
                group.push(c);
                groupedByReqId.set(c.requirement_id, group);
            });

            const finalRequirements: Requirement[] = Array.from(groupedByReqId.entries()).map(([reqId, criteria]) => ({
                id: reqId,
                name: criteria[0].requirement_name,
                text: criteria[0].requirement_text,
                category1_no: criteria[0].category1_no,
                category1: criteria[0].category1,
                category2_no: criteria[0].category2_no,
                category2: criteria[0].category2,
                criteria: criteria,
                overallStatus: calculateOverallStatus(criteria)
            }));

            setAllRequirements(finalRequirements);
            setActionItems(actionItemsData);
            setMessage(`✓ データを読み込みました。`);

        } catch (error) {
            console.error('Fetch error:', error);
            setNotification({ type: 'danger', message: 'データの読み込みに失敗しました。' });
        } finally {
            setLoadingActionItems(false);
        }
      };

      fetchData();
    } else {
      setAllRequirements([]);
      setActionItems([]);
      setMessage('評価セットを選択してください。');
    }
  }, [evaluationSetId]);

  const handleCriterionUpdate = (updatedCriterion: Criterion) => {
    setAllRequirements(prev => prev.map(req => {
        if (req.id === updatedCriterion.requirement_id) {
            const newCriteria = req.criteria.map(c => c.criterion_id === updatedCriterion.criterion_id ? updatedCriterion : c);
            return { ...req, criteria: newCriteria, overallStatus: calculateOverallStatus(newCriteria) };
        }
        return req;
    }));
    if (user && evaluationSetId) {
      fetch('/api/answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evaluationSetId: evaluationSetId,
          requirement_id: updatedCriterion.requirement_id,
          criterion_id: updatedCriterion.criterion_id,
          status: updatedCriterion.status,
          notes: updatedCriterion.notes,
        }),
      });
    }
  };

  const handleGetAdvice = async (criterion: Criterion, req: Requirement) => {
    if (!user || !evaluationSetId) return;

    if (adviceError?.criterionId === criterion.criterion_id) {
      setAdviceError(null);
    }
    
    // Add to loading set
    setLoadingAdviceIds(prev => new Set(prev).add(criterion.criterion_id));

    try {
      const response = await fetch('/api/ai/advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evaluationSetId: evaluationSetId,
          requirement_id: req.id,
          criterion_id: criterion.criterion_id,
          requirementText: req.text,
          criterionText: criterion.criterion_text,
          notes: criterion.notes,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Server Error: ${response.status} ${response.statusText}`;
        try {
            const errorJson = JSON.parse(errorText);
            if (errorJson.message) errorMessage = errorJson.message;
            if (errorJson.error) errorMessage = errorJson.error;
        } catch (e) {
            if (errorText.length < 200) errorMessage += ` (${errorText})`;
        }
        throw new Error(errorMessage);
      }

      let data: any;
      try {
        data = await response.json();
      } catch (e) {
        throw new Error('サーバーからの応答が無効です (JSON parse error)。');
      }
      
      setAllRequirements(prevRequirements => prevRequirements.map(r => {
        if (r.id === req.id) {
          const newCriteria = r.criteria.map(c => {
            if (c.criterion_id === criterion.criterion_id) {
              return { ...c, advice: data };
            }
            return c;
          });
          return { ...r, criteria: newCriteria };
        }
        return r;
      }));

    } catch (error: any) {
      console.error(error);
      setAdviceError({ criterionId: criterion.criterion_id, message: error.message });
    } finally {
      // Remove from loading set
      setLoadingAdviceIds(prev => {
          const next = new Set(prev);
          next.delete(criterion.criterion_id);
          return next;
      });
    }
  };

  const handleAddActionItem = async (item: Omit<ActionItem, 'actionItemId' | 'createdAt' | 'updatedAt'>) => {
    if (!evaluationSetId) return;
    try {
      const response = await fetch('/api/actionitems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...item, evaluationSetId }),
      });
      if (!response.ok) throw new Error('Failed to add action item');
      const newItem = await response.json();
      setActionItems(prev => [...prev, newItem]);
    } catch (error) {
      setNotification({ type: 'danger', message: 'アクションアイテムの追加に失敗しました。' });
    }
  };

  const handleUpdateActionItem = async (item: ActionItem) => {
    try {
      const response = await fetch(`/api/actionitems/${item.actionItemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      if (!response.ok) throw new Error('Failed to update action item');
      const updatedItem = await response.json();
      setActionItems(prev => prev.map(i => i.actionItemId === updatedItem.actionItemId ? updatedItem : i));
    } catch (error) {
      setNotification({ type: 'danger', message: 'アクションアイテムの更新に失敗しました。' });
    }
  };

  const handleActionItemDeleteClick = (actionItemId: string) => {
    setDeletingActionItemId(actionItemId);
    setShowActionItemDeleteConfirm(true);
  };

  const handleActionItemDeleteCancel = () => {
    setShowActionItemDeleteConfirm(false);
    setDeletingActionItemId(null);
  };

  const handleActionItemDeleteConfirm = async () => {
    if (!deletingActionItemId) return;
    setIsDeletingActionItem(true);
    try {
      const response = await fetch(`/api/actionitems/${deletingActionItemId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete action item');
      setActionItems(prev => prev.filter(i => i.actionItemId !== deletingActionItemId));
      setShowActionItemDeleteConfirm(false);
      setDeletingActionItemId(null);
    } catch (error) {
      setNotification({ type: 'danger', message: 'アクションアイテムの削除に失敗しました。' });
    } finally {
      setIsDeletingActionItem(false);
    }
  };

  const [deletingActionItemId, setDeletingActionItemId] = useState<string | null>(null);
  const [showActionItemDeleteConfirm, setShowActionItemDeleteConfirm] = useState(false);
  const [isDeletingActionItem, setIsDeletingActionItem] = useState(false);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordChangeError('');
    setPasswordChangeSuccess('');
    if (newPassword !== confirmPassword) {
        setPasswordChangeError('新しいパスワードが一致しません。');
        return;
    }
    if (newPassword.length < 6) {
        setPasswordChangeError('パスワードは6文字以上で設定してください。');
        return;
    }
    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.email) {
        setPasswordChangeError('ユーザー情報が見つかりません。再度ログインしてください。');
        return;
    }
    try {
        const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
        await reauthenticateWithCredential(currentUser, credential);
        await updatePassword(currentUser, newPassword);
        setPasswordChangeSuccess('パスワードが正常に更新されました。');
        setTimeout(() => {
            setShowPasswordChangeModal(false);
            setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
            setPasswordChangeError(''); setPasswordChangeSuccess('');
        }, 2000);
    } catch (error: any) {
        setPasswordChangeError('パスワードの変更中にエラーが発生しました。');
    }
  };

  const handleClosePasswordChangeModal = () => {
    setShowPasswordChangeModal(false);
    setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    setPasswordChangeError(''); setPasswordChangeSuccess('');
  };

  const handleLogout = () => {
    localStorage.removeItem('selectedEvaluationSetId');
    signOut(auth);
  };

 const handleConfirmDelete = async () => {
    if (!user) return;
    try {
      const idToken = await user.getIdToken();
      const response = await fetch(`/api/users/${user.uid}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${idToken}` },
      });
      if (!response.ok) throw new Error('アカウントの削除に失敗しました。');
      sessionStorage.setItem('auth-message', 'アカウントが正常に削除されました。');
      setShowDeleteModal(false);
      localStorage.removeItem('selectedEvaluationSetId');
      await signOut(auth);
    } catch (error: any) {
      setNotification({ type: 'danger', message: `アカウントの削除中にエラーが発生しました: ${error.message}` });
      setShowDeleteModal(false);
    }
  };

  const handleExportCSV = () => {
    const headers = ["大分類No.", "大分類", "中分類No.", "中分類", "要求事項No.", "★3", "★4", "要求事項名", "要求事項", "★3/★4", "評価基準No.", "評価基準", "評価結果", "備考"];
    const rows = filteredRequirements.flatMap(req => 
        req.criteria.map(crit => [
            req.category1_no, 
            req.category1, 
            req.category2_no, 
            req.category2, 
            req.id, 
            crit.level3_no ? '○' : '', 
            crit.Level4_no ? '○' : '', 
            req.name || '', 
            req.text, 
            crit.star_level === 3 ? '★3' : '★4', 
            crit.criterion_id, 
            crit.criterion_text, 
            crit.status, 
            crit.notes
        ])
    );
    const escapeCsvCell = (cell: any): string => {
        const strCell = String(cell === null || cell === undefined ? '' : cell);
        if (strCell.includes(',') || strCell.includes('"') || strCell.includes('\n')) return `"${strCell.replace(/"/g, '""')}"`;
        return strCell;
    };
    const csvContent = [headers.map(escapeCsvCell).join(','), ...rows.map(row => row.map(escapeCsvCell).join(','))].join('\n');
    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", "security-evaluation.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = async () => {
    if (!user || !evaluationSetId) return;
    setIsExportingPdf(true);
    try {
        const response = await fetch('/api/report/pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                requirements: groupedForDisplay,
                evaluationSetName: evaluationSetName,
                actionItems: actionItems // Pass action items to backend
            }),
        });
        if (!response.ok) {
            const errorData = await response.json();
            setNotification({ type: 'danger', message: `PDFレポート出力に失敗しました: ${errorData.error || response.statusText}` });
            return;
        }
        const pdfBlob = await response.blob();
        const url = window.URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url; a.download = 'security-report.pdf';
        document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
    } catch (error) {
        setNotification({ type: 'danger', message: 'PDFレポート出力中にエラーが発生しました。' });
    } finally {
        setIsExportingPdf(false);
    }
  };

  const filteredRequirements = useMemo(() => {
      return allRequirements.filter(req => req.criteria.some(c => c.star_level <= parseInt(starFilter, 10)))
      .map(req => {
          const visibleCriteria = req.criteria.filter(c => c.star_level <= parseInt(starFilter, 10));
          return { ...req, criteria: visibleCriteria, overallStatus: calculateOverallStatus(visibleCriteria) };
      });
  }, [allRequirements, starFilter]);

  const groupedForDisplay = useMemo(() => {
      return filteredRequirements.reduce((acc, req) => {
        const { category1, category2 } = req;
        if (!acc[category1]) acc[category1] = {};
        if (!acc[category1][category2]) acc[category1][category2] = [];
        acc[category1][category2].push(req);
        return acc;
      }, {} as { [key: string]: { [key: string]: Requirement[] } });
  }, [filteredRequirements]);

  if (loadingAuth) return <div className="container mt-5">読み込み中...</div>;
  if (!user) return <Auth onAuthSuccess={() => {}} />;

  return (
    <div className="container-fluid full-height-layout px-0">
        <Navbar bg="dark" variant="dark" expand="lg" sticky="top" className="shadow">
          <Container fluid>
            <Navbar.Brand href="#" className="px-3 fs-6" onClick={() => setCurrentView('main')}>
                サプライチェーン強化に向けたセキュリティ対策評価制度 セルフチェック支援ツール
            </Navbar.Brand>
            <Navbar.Toggle aria-controls="responsive-navbar-nav" />
            <Navbar.Collapse id="responsive-navbar-nav">
              <Nav className="ms-auto align-items-center">
                {user && <Navbar.Text className="px-3 small text-light">ようこそ、{user.email || 'ゲスト'}さん</Navbar.Text>}
                <Nav.Link as={Button} variant="dark" className="px-3" onClick={() => setShowSettingsModal(true)}>組織設定</Nav.Link>
                <Nav.Link as={Button} variant="dark" className="px-3" onClick={() => setShowPasswordChangeModal(true)}>パスワード変更</Nav.Link>
                <Nav.Link as={Button} variant="dark" className="px-3" onClick={handleLogout}>ログアウト</Nav.Link>
                <Nav.Link as={Button} variant="danger" className="px-3 ms-lg-2" onClick={() => setShowDeleteModal(true)}>アカウント削除</Nav.Link>
              </Nav>
            </Navbar.Collapse>
          </Container>
        </Navbar>
       {notification && (
         <div className="position-fixed top-0 start-50 translate-middle-x p-3" style={{ zIndex: 2000}}>
           <Alert variant={notification.type} onClose={() => setNotification(null)} dismissible>{notification.message}</Alert>
         </div>
       )}
         <div className="row flex-grow-1 main-content-row mx-0">
        {evaluationSetId && (
          <div className="col-md-3 col-lg-2 d-md-block bg-light sidebar collapse sticky-sidebar">
          <Sidebar groupedRequirements={groupedForDisplay} onBackToSelection={() => setEvaluationSetId(null)} />
        </div>
        )}
        <main className={`px-md-4 scrollable-main ${evaluationSetId ? 'col-md-9 ms-sm-auto col-lg-10' : 'col-12'}`}>
          {evaluationSetId ? (
            <>
              <div className="d-flex align-items-center justify-content-between mt-3 mb-4">
                <div className="d-flex align-items-baseline">
                  <h1 className="mb-0">評価項目</h1>
                  {evaluationSetName && <span className="text-muted h4 ms-3">({evaluationSetName})</span>}
                  {evaluationSetCreator?.companyName && (
                    <Badge bg="info" className="ms-3 align-self-center fw-normal">
                      作成者: {evaluationSetCreator.companyName}
                    </Badge>
                  )}
                </div>
                <Button variant="outline-primary" size="sm" onClick={() => setEvaluationSetId(null)}>
                    評価セット選択に戻る
                </Button>
              </div>
              <p className="lead">{message}</p>
              <div className="d-flex justify-content-between align-items-center mb-4">
                <div className="card w-100">
                    <div className="card-body text-center">
                    <h5 className="card-title">評価対象フィルタ</h5>
                    <div className="btn-group" role="group">
                        <button type="button" className={`btn ${starFilter === '3' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setStarFilter('3')}>★3</button>
                        <button type="button" className={`btn ${starFilter === '4' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setStarFilter('4')}>★4</button>
                    </div>
                    </div>
                </div>
                <div className="ms-3"><Button variant="success" onClick={handleExportCSV}>CSVエクスポート</Button></div>
                <div className="ms-3">
                    <Button variant="primary" onClick={handleExportPDF} disabled={isExportingPdf}>
                        {isExportingPdf ? <><Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" /> 出力中...</> : 'PDFレポート出力'}
                    </Button>
                </div>
              </div>
              <ProgressSummary id="progress-summary" requirements={filteredRequirements} />
              <Dashboard id="dashboard-section" requirements={filteredRequirements} />
              {Object.entries(groupedForDisplay).sort((a, b) => {
                    const noA = parseInt(Object.values(a[1])[0]?.[0]?.category1_no || '999', 10);
                    const noB = parseInt(Object.values(b[1])[0]?.[0]?.category1_no || '999', 10);
                    return noA - noB;
                }).map(([category1, subCategories]) => (
                <div id={`category-${category1.replaceAll('/', '-')}`} key={category1} className="card mb-4">
                    <div className="card-header bg-light"><h2 className="mb-0">{Object.values(subCategories)[0]?.[0]?.category1_no}. {category1}</h2></div>
                    <div className="card-body">
                        {Object.entries(subCategories).sort((a, b) => (a[1][0]?.category2_no || '').localeCompare(b[1][0]?.category2_no || '', undefined, { numeric: true, sensitivity: 'base' }))
                            .map(([category2, items]: [string, Requirement[]]) => (
                            <div 
                                key={category2} 
                                id={`subcategory-${items[0]?.category1_no}-${items[0]?.category2_no}`}
                                className="p-3 border rounded mb-3"
                            >
                                <h4>{items[0]?.category2_no}. {category2}</h4>
                                <Accordion alwaysOpen>
                                    {items.map((req) => (
                                        <RequirementItem key={req.id} requirement={req} onUpdate={handleCriterionUpdate} starFilter={starFilter} />
                                    ))}
                                </Accordion>
                            </div>
                        ))}
                    </div>
                </div>
              ))}
              <UnachievedItems 
                requirements={filteredRequirements} 
                starFilter={starFilter} 
                onGetAdvice={handleGetAdvice} 
                loadingAdviceIds={loadingAdviceIds} // Pass new state
                adviceError={adviceError}
              />
              <ActionItemManager actionItems={actionItems} requirements={allRequirements} evaluationSetId={evaluationSetId} onAddActionItem={handleAddActionItem} onUpdateActionItem={handleUpdateActionItem} onDeleteActionItem={handleActionItemDeleteClick} />
            </>
          ) : (
            <>
              <h1 className="mt-3 mb-4 text-center">評価セットの選択または新規作成</h1>
              <p className="lead text-center mb-4">このアプリケーションは、セキュリティセルフチェックを支援します。既存の評価セットを選択するか、新しい評価を開始するために作成してください。</p>
              <EvaluationSetSelector user={user} onSelect={setEvaluationSetId} />
            </>
          )}
        </main>
      </div>
      <footer className="footer mt-auto py-3 bg-light">
        <div className="container text-center">
          <span className="text-muted small">
            <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="text-decoration-none">利用規約・免責事項</a>
            <span className="mx-2">|</span>
            <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="text-decoration-none">プライバシーポリシー</a>
            <span className="mx-2">|</span>
            <a href="https://docs.google.com/forms/d/e/1FAIpQLSci5IKrSAJPov5Dri2heP6RVmD_LTGJKioGeKVS32Vf3UpWbA/viewform?usp=header" target="_blank" rel="noopener noreferrer" className="text-decoration-none">フィードバック</a>
          </span>
        </div>
      </footer>
      <Settings show={showSettingsModal} onHide={() => setShowSettingsModal(false)} user={user} />
      <Modal show={showPasswordChangeModal} onHide={handleClosePasswordChangeModal} centered>
        <Modal.Header closeButton>
          <Modal.Title>パスワードの変更</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {passwordChangeSuccess && <Alert variant="success">{passwordChangeSuccess}</Alert>}
          {passwordChangeError && <Alert variant="danger">{passwordChangeError}</Alert>}
          <Form onSubmit={handlePasswordChange}>
            <Form.Group className="mb-3" controlId="currentPassword">
              <Form.Label>現在のパスワード</Form.Label>
              <Form.Control type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
            </Form.Group>
            <Form.Group className="mb-3" controlId="newPassword">
              <Form.Label>新しいパスワード</Form.Label>
              <Form.Control type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
            </Form.Group>
            <Form.Group className="mb-3" controlId="confirmPassword">
              <Form.Label>新しいパスワード（確認用）</Form.Label>
              <Form.Control type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            </Form.Group>
            <Button variant="primary" type="submit">パスワードを更新</Button>
          </Form>
        </Modal.Body>
      </Modal>
      <Modal show={showActionItemDeleteConfirm} onHide={handleActionItemDeleteCancel} centered>
        <Modal.Header closeButton>
          <Modal.Title>アクションアイテムの削除確認</Modal.Title>
        </Modal.Header>
        <Modal.Body>本当にこのアクションアイテムを削除しますか？この操作は元に戻せません。</Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleActionItemDeleteCancel} disabled={isDeletingActionItem}>キャンセル</Button>
          <Button variant="danger" onClick={handleActionItemDeleteConfirm} disabled={isDeletingActionItem}>{isDeletingActionItem ? <><Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" /> 削除中...</> : '削除'}</Button>
        </Modal.Footer>
      </Modal>
      <DeleteAccountModal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} onConfirm={handleConfirmDelete} />
    </div>
  );
}

export default App;
