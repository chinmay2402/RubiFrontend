import { useMemo, useState, useEffect } from 'react'
import api from './api/api'
import { reviewerProfile } from './data/mockData'
import { AdminHeader } from './components/AdminHeader'
import { AdminSidebar } from './components/AdminSidebar'
import { Button } from './components/Button'
import { DataTable } from './components/DataTable'
import { InfoPair } from './components/InfoPair'
import { StatusPill } from './components/StatusPill'
import io from 'socket.io-client'

const queueItems = [
  { id: 'all_reviewers', label: 'All Reviewers', accent: 'slate' },
  { id: 'all', label: 'All Tasks', accent: 'blue' },
  { id: 'under_review', label: 'Under Review', accent: 'purple' },
  { id: 'approved', label: 'Approved', accent: 'green' },
  { id: 'rejected', label: 'Rejected', accent: 'red' },
  { id: 'pending', label: 'Unassigned', accent: 'amber' },
]

const toolItems = [
  // { id: 'analytics', label: 'Analytics' },
  // { id: 'settings', label: 'Settings' },
  // { id: 'help', label: 'Help' },
  { id: 'createUser', label: 'Create User' },
  { id: 'addReview', label: 'Add Review Task' },
  { id: 'bulkUpload', label: 'Bulk CSV Upload' },
  { id: 'userLogs', label: 'User Logs' },
]

const reviewerColumns = [
  { key: 'name', label: 'Reviewer' },
  { key: 'total', label: 'Total Tasks' },
  { key: 'under_review', label: 'Active' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
]

const historyColumns = [
  { key: 'updatedAt', label: 'Timestamp', render: (row) => new Date(row.status?.updatedAt || row.updatedAt || row.createdAt).toLocaleString() },
  { key: 'state', label: 'Status', render: (row) => <StatusPill status={row.status?.state || row.status || 'pending'} /> },
  {
    key: 'aiPrompt',
    label: 'AI Prompt',
    render: (row) => <TruncatedCell value={row.aiPrompt} />,
  },
  {
    key: 'aiOutput',
    label: 'AI Output',
    render: (row) => <TruncatedCell value={row.aiOutput} />,
  },
]

function AdminDashboard() {
  const [searchValue, setSearchValue] = useState('')
  const [activeQueue, setActiveQueue] = useState('all_reviewers')
  const [activeTool, setActiveTool] = useState('')
  const [screen, setScreen] = useState('overview')
  const [viewMode, setViewMode] = useState('reviewers') // 'reviewers' or 'tasks'
  
  const [reviewers, setReviewers] = useState([])
  const [summary, setSummary] = useState({ total: 0, pending: 0, approved: 0, rejected: 0, under_review: 0 })
  const [globalTasks, setGlobalTasks] = useState([])
  const [userLogs, setUserLogs] = useState([])
  const [selectedReviewerId, setSelectedReviewerId] = useState(null)
  const [reviewerHistory, setReviewerHistory] = useState({ approved: [], rejected: [], pending: [], underReview: [] })
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [recordLogs, setRecordLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalConfig, setModalConfig] = useState({ action: '', reviewId: '', defaultComment: '' })
  const [profileOpen, setProfileOpen] = useState(false)

  // Fetch stats on mount
  useEffect(() => {
    fetchStats()
  }, [])

  // Socket.IO connection for real-time updates
  useEffect(() => {
    const socket = io('http://localhost:5000') // Backend URL

    socket.on('userActivity', (data) => {
      console.log('User activity:', data)
      // Refresh user logs if currently viewing the user logs screen
      if (screen === 'userLogs') {
        fetchUserLogs()
      }
    })

    // Listen for review-related events to update admin dashboard in real-time
    socket.on('reviewLocked', (data) => {
      console.log('Review locked:', data)
      // Refresh stats and tasks when a review is locked
      fetchStats()
      if (viewMode === 'tasks' && activeQueue !== 'all_reviewers') {
        fetchGlobalTasks(activeQueue)
      }
    })

    socket.on('reviewUnlocked', (data) => {
      console.log('Review unlocked:', data)
      // Refresh stats and tasks when a review is unlocked
      fetchStats()
      if (viewMode === 'tasks' && activeQueue !== 'all_reviewers') {
        fetchGlobalTasks(activeQueue)
      }
    })

    socket.on('reviewUpdated', (data) => {
      console.log('Review updated:', data)
      // Refresh stats and reviewer details when a review status changes
      fetchStats()
      if (selectedReviewerId) {
        fetchReviewerDetails(selectedReviewerId)
      }
      if (viewMode === 'tasks' && activeQueue !== 'all_reviewers') {
        fetchGlobalTasks(activeQueue)
      }
    })

    socket.on('reviewCreated', (data) => {
      console.log('Review created:', data)
      // Refresh stats when a new review is created
      fetchStats()
    })

    socket.on('reviewsCreated', (data) => {
      console.log('Reviews created:', data)
      // Refresh stats when multiple reviews are created
      fetchStats()
    })

    return () => {
      socket.disconnect()
    }
  }, [screen, viewMode, activeQueue, selectedReviewerId]) // Depend on relevant state variables

  const fetchStats = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const response = await api.get('/admin/stats')
      setReviewers(response.data.reviewers)
      setSummary(response.data.summary)
    } catch (err) {
      console.error('Failed to fetch stats:', err)
    } finally {
      setLoading(false)
    }
  }

  const selectedReviewer = reviewers.find((r) => r.reviewerId === selectedReviewerId)

  const dynamicQueueItems = useMemo(() => {
    return queueItems.map(item => {
      let count = 0;
      if (item.id === 'all_reviewers') {
        count = reviewers.length;
      } else {
        const key = item.id === 'all' ? 'total' : item.id;
        // Use global summary from backend (includes unassigned)
        count = summary[key] || 0;
      }
      return { ...item, count };
    });
  }, [reviewers, summary]);

  const filteredReviewers = useMemo(() => {
    const normalizedQuery = searchValue.trim().toLowerCase()

    const list = reviewers.filter((reviewer) => {
      // Show ALL reviewers if activeQueue is 'all_reviewers'
      if (activeQueue === 'all_reviewers') return true;

      const matchesQueue =
        activeQueue === 'approved'
          ? reviewer.approved > 0
          : activeQueue === 'rejected'
            ? reviewer.rejected > 0
            : activeQueue === 'under_review'
              ? reviewer.under_review > 0
              : reviewer.pending > 0

      const matchesQuery =
        normalizedQuery.length === 0 ||
        `${reviewer.name} ${reviewer.email}`
          .toLowerCase()
          .includes(normalizedQuery)

      return matchesQueue && matchesQuery
    })

    // SORT: Reviewers with any work (total > 0) come first
    return [...list].sort((a, b) => {
      if (a.total > 0 && b.total === 0) return -1;
      if (a.total === 0 && b.total > 0) return 1;
      return b.total - a.total; // Then sort by volume
    });
  }, [activeQueue, searchValue, reviewers])

  const handleQueueSelect = (itemId) => {
    setActiveQueue(itemId)
    setActiveTool('')
    
    if (itemId === 'all_reviewers') {
      setViewMode('reviewers')
      setScreen('overview')
    } else {
      setViewMode('tasks')
      setScreen('tasks')
      fetchGlobalTasks(itemId)
    }
  }

  const fetchGlobalTasks = async (status) => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const response = await api.get(`/admin/tasks?status=${status}`)
      setGlobalTasks(response.data)
    } catch (err) {
      console.error('Failed to fetch tasks:', err)
    } finally {
      setLoading(false)
    }
  }

  const filteredGlobalTasks = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    if (!query) return globalTasks;
    return globalTasks.filter(t => {
      try {
        const idStr = String(t?._id || "").toLowerCase();
        const promptStr = String(t?.aiPrompt || "").toLowerCase();
        const outputStr = String(t?.aiOutput || "").toLowerCase();
        const assigneeStr = String(t?.assignedTo?.name || "").toLowerCase();
        
        return idStr.includes(query) || 
               promptStr.includes(query) || 
               outputStr.includes(query) || 
               assigneeStr.includes(query);
      } catch (e) {
        return false;
      }
    });
  }, [globalTasks, searchValue]);

  const filteredReviewerHistory = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    const all = [
      ...(reviewerHistory?.approved || []),
      ...(reviewerHistory?.rejected || []),
      ...(reviewerHistory?.pending || []),
      ...(reviewerHistory?.underReview || [])
    ];
    if (!query) return all;
    return all.filter(t => {
      try {
        const idStr = String(t?._id || "").toLowerCase();
        const promptStr = String(t?.aiPrompt || "").toLowerCase();
        const outputStr = String(t?.aiOutput || "").toLowerCase();
        
        return idStr.includes(query) || 
               promptStr.includes(query) || 
               outputStr.includes(query);
      } catch (e) {
        return false;
      }
    });
  }, [reviewerHistory, searchValue]);

  const handleToolSelect = (itemId) => {
    setActiveTool(itemId)
    if (itemId === 'createUser') {
      setScreen('register')
    } else if (itemId === 'addReview') {
      setScreen('addReview')
    } else if (itemId === 'bulkUpload') {
      setScreen('bulkUpload')
    } else if (itemId === 'userLogs') {
      setScreen('userLogs')
      fetchUserLogs()
    }
  }

  const fetchUserLogs = async () => {
    setLoading(true)
    try {
      const response = await api.get('/admin/user-logs')
      setUserLogs(response.data)
    } catch (err) {
      console.error('Failed to fetch user logs:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchReviewerDetails = async (reviewerId) => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const response = await api.get(`/admin/${reviewerId}/details`)
      setReviewerHistory(response.data)
    } catch (err) {
      console.error('Failed to fetch details:', err)
    } finally {
      setLoading(false)
    }
  }

  const openReviewerHistory = (reviewerId) => {
    setSelectedReviewerId(reviewerId)
    fetchReviewerDetails(reviewerId)
    setScreen('history')
  }

  const openRecordDetail = async (record) => {
    setSelectedRecord(record)
    setScreen('detail')
    
    // Fetch logs for history
    try {
      const token = localStorage.getItem('token')
      const response = await api.get(`/reviews/${record._id}/logs`)
      setRecordLogs(response.data)
    } catch (err) {
      console.error('Failed to fetch logs:', err)
    }
  }

  const handleReassign = async (reviewId, reviewerId) => {
    try {
      const token = localStorage.getItem('token')
      await api.post(`/admin/${reviewId}/reassign`, { reviewerId })
      fetchStats()
      if (selectedReviewerId) fetchReviewerDetails(selectedReviewerId)
      setScreen('history')
    } catch (err) {
      console.error('Failed to reassign:', err)
    }
  }

  const handleAdminModify = (reviewId, action, defaultComment) => {
    setModalConfig({ reviewId, action, defaultComment });
    setModalOpen(true);
  }

  const submitAdminModify = async (comment, target) => {
    const { reviewId, action } = modalConfig;
    try {
      const token = localStorage.getItem('token');
      await api.post(`/admin/${reviewId}/modify`, { 
        decision: action, 
        comment,
        target: action === 'send_back' ? target : 'reviewer'
      });

      setModalOpen(false);
      // Refresh data
      if (selectedReviewerId) fetchReviewerDetails(selectedReviewerId);
      fetchStats();
      if (selectedRecord && selectedRecord._id === reviewId) {
        const refreshRes = await api.get('/admin/tasks');
        const updatedRecord = refreshRes.data.find(r => r._id === reviewId);
        if (updatedRecord) {
             setSelectedRecord(updatedRecord);
             // Also refresh logs
             const logsRes = await api.get(`/reviews/${reviewId}/logs`);
             setRecordLogs(logsRes.data);
        }
      }
      setScreen('overview'); // Return for safety
    } catch (err) {
      console.error('Action failed:', err);
      alert(err.response?.data?.error || "Action failed");
    }
  }

  return (
    <div className="admin-shell">
      <AdminSidebar
        brand="Human in the loop workflow"
        queueItems={dynamicQueueItems}
        toolItems={toolItems}
        activeQueue={activeQueue}
        activeTool={activeTool}
        onQueueSelect={handleQueueSelect}
        onToolSelect={handleToolSelect}
      />

      <main className="admin-main">
        <AdminHeader
          reviewer={reviewerProfile}
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          showSearch={['overview', 'tasks', 'history'].includes(screen)}
          backLabel={
            screen === 'history'
              ? 'Go Back'
              : screen === 'detail'
                ? 'Back To List'
                : ''
          }
          onBack={
            screen === 'history'
              ? () => { setScreen('overview'); setSearchValue(''); }
              : screen === 'detail'
                ? () => setScreen(selectedReviewerId ? 'history' : 'overview')
                : undefined
          }
          onProfileClick={() => setProfileOpen((o) => !o)}
          profileOpen={profileOpen}
        />

        <section className="admin-content">
          {screen === 'overview' ? (
            <AdminOverview
              reviewers={filteredReviewers}
              onReviewerSelect={openReviewerHistory}
            />
          ) : null}

          {screen === 'tasks' ? (
            <AdminGlobalQueue
              title={`${activeQueue.charAt(0).toUpperCase() + activeQueue.slice(1).replace('_', ' ')} Tasks`}
              tasks={filteredGlobalTasks}
              onRecordSelect={openRecordDetail}
            />
          ) : null}

          {screen === 'history' ? (
            <AdminHistory
              reviewer={selectedReviewer}
              history={filteredReviewerHistory}
              onRecordSelect={openRecordDetail}
            />
          ) : null}

          {screen === 'detail' ? (
            <AdminDetail 
              reviewer={selectedReviewer} 
              record={selectedRecord} 
              logs={recordLogs}
              onModify={handleAdminModify}
              onReassign={handleReassign}
              reviewers={reviewers}
              showHistory={showHistory}
              onToggleHistory={() => setShowHistory(!showHistory)}
            />
          ) : null}

          {screen === 'register' ? (
            <UserRegistration />
          ) : null}

          {screen === 'addReview' ? (
            <NewReviewForm />
          ) : null}

          {screen === 'bulkUpload' ? (
            <BulkUploadView />
          ) : null}

          {screen === 'userLogs' ? (
            <UserLogsView logs={userLogs} />
          ) : null}
        </section>
      </main>

      {modalOpen && (
        <AdminActionModal 
          config={modalConfig} 
          onClose={() => setModalOpen(false)} 
          onSubmit={submitAdminModify} 
        />
      )}

      {profileOpen && (
        <ProfileCard onClose={() => setProfileOpen(false)} />
      )}
    </div>
  )
}

function AdminOverview({ reviewers, onReviewerSelect }) {
  return (
    <div className="admin-screen">
      <div className="admin-copy-block">
        <div className="admin-section-label">Stats:</div>
        <div className="admin-section-title">Reviewer Performance</div>
      </div>

      <section className="admin-table-card">
        <DataTable
          columns={reviewerColumns}
          rows={reviewers}
          onRowClick={(row) => onReviewerSelect(row.reviewerId)}
        />
      </section>
    </div>
  )
}

function AdminHistory({ reviewer, history, onRecordSelect }) {
  return (
    <div className="admin-screen admin-screen--panel">
      <div className="admin-history-head">
        <div>
          <div className="admin-section-title">History</div>
          <div className="admin-history-owner">
            <span className="admin-history-dot"></span>
            <span>{reviewer?.name || 'Reviewer'}</span>
          </div>
        </div>
      </div>

      <section className="admin-table-card admin-table-card--soft">
        <DataTable
          columns={historyColumns}
          rows={history}
          onRowClick={(row) => onRecordSelect(row)}
        />
      </section>
    </div>
  )
}

function AdminGlobalQueue({ title, tasks, onRecordSelect }) {
  const globalColumns = [
    ...historyColumns,
    { 
      key: 'assignedTo', 
      label: 'Assigned To', 
      render: (row) => row.assignedTo?.name || 'Unassigned' 
    },
    { 
      key: 'lockedBy', 
      label: 'Lock Status', 
      render: (row) => row.isLocked ? (
        <span className="lock-badge">🔒 {row.lockedBy?.name || 'Locked'}</span>
      ) : '---' 
    }
  ];

  return (
    <div className="admin-screen">
      <div className="admin-copy-block">
        <div className="admin-section-label">Queue:</div>
        <div className="admin-section-title">{title}</div>
      </div>

      <section className="admin-table-card">
        <DataTable
          columns={globalColumns}
          rows={tasks}
          onRowClick={(row) => onRecordSelect(row)}
        />
      </section>
    </div>
  )
}

function AdminActionModal({ config, onClose, onSubmit }) {
  const [comment, setComment] = useState(config.defaultComment || '')
  const [target, setTarget] = useState('pool')

  return (
    <div className="modal-overlay">
      <div className="modal-card animate-scale-in">
        <h3 className="modal-title">Admin Override: {config.action.replace('_', ' ').toUpperCase()}</h3>
        <p className="modal-subtitle">Provide mandatory reasoning for this structural workflow change.</p>
        
        <div className="modal-body">
          <label className="modal-label">Decision Reason:</label>
          <textarea 
            className="modal-textarea"
            placeholder="Describe why this manual intervention is necessary..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />

          {config.action === 'send_back' && (
            <div className="target-selector">
              <label className="modal-label">Assignment Target:</label>
              <div className="selector-group">
                <button 
                  className={`selector-btn ${target === 'pool' ? 'is-active' : ''}`} 
                  onClick={() => setTarget('pool')}
                >
                  Global Pool
                </button>
                <button 
                  className={`selector-btn ${target === 'reviewer' ? 'is-active' : ''}`} 
                  onClick={() => setTarget('reviewer')}
                >
                  Original Reviewer
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button 
            className="btn-primary" 
            disabled={!comment.trim()} 
            onClick={() => onSubmit(comment, target)}
          >
            Execute Override
          </button>
        </div>
      </div>
    </div>
  )
}

function AdminDetail({ reviewer, record, logs, onModify, onReassign, reviewers, showHistory, onToggleHistory }) {
  if (!record) return <div>No record selected</div>;

  return (
    <div className="admin-detail-layout" style={{maxHeight: 100}}>
      <aside className="admin-detail-rail">
        {/* <button className="admin-detail-chip" type="button">
          Content Details
        </button>
        <button className="admin-detail-chip" type="button">
          {record.assignedTo?.name || reviewer?.name || 'Unassigned'}
        </button> */}
        
        {record.isLocked && (
          <div className="lock-indicator-card">
            <div className="admin-detail-label">Current Lock:</div>
            <div className="lock-badge is-active">
              🔒 Locked by {record.lockedBy?.name || 'Reviewer'}
            </div>
          </div>
        )}

        {(record.status?.state === 'approved' || record.status?.state === 'rejected') && !record.isLocked && (
          <div className="reassign-box" style={{ marginTop: '20px', padding: '15px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569', marginBottom: '8px', display: 'block' }}>
              Assign to New Reviewer:
            </label>
            <select 
              onChange={(e) => {
                if (e.target.value) onReassign(record._id, e.target.value);
              }}
              className="reassign-select"
              style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', cursor: 'pointer', background: 'white' }}
            >
              <option value="">Select User...</option>
              {reviewers.map(r => (
                <option key={r.reviewerId} value={r.reviewerId}>{r.name}</option>
              ))}
            </select>
            <p style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '8px' }}>
              * This will reset the task to Pending.
            </p>
          </div>
        )}
      </aside>

      <section className="admin-detail-stage">
        <div className="admin-detail-block">
          <div className="admin-detail-label">Prompt:</div>
          <div className="admin-bubble admin-bubble--prompt">{record.aiPrompt}</div>
        </div>

        <div className="admin-detail-block">
          <div className="admin-detail-label">Answer:</div>
          <div className="admin-bubble admin-bubble--answer">{record.aiOutput}</div>
        </div>

        <div className="admin-detail-block">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div className="admin-detail-label" style={{ marginBottom: 0 }}>Audit History:</div>
            <Button variant="ghost" size="sm" onClick={onToggleHistory}>
              {showHistory ? 'Hide History' : 'View Audit History'}
            </Button>
          </div>
          
          {showHistory && (
             <div className="audit-timeline-shell fade-in" style={{overflowY: 'scroll', maxHeight: '200px'}}>
               {logs.length === 0 ? (
                 <div className="no-logs">No activity recorded yet for this task.</div>
               ) : (
                 <div className="timeline-trail">
                   {logs.map((log, i) => (
                     <div key={i} className="timeline-item">
                       <div className="timeline-marker">
                         <div className={`marker-dot marker--${log.action}`}></div>
                         {i !== logs.length - 1 && <div className="marker-line"></div>}
                       </div>
                       <div className="timeline-content">
                         <div className="timeline-header">
                           <span className="timeline-action">{log.action.replace('_', ' ')}</span>
                           <span className="timeline-time">{new Date(log.createdAt).toLocaleString()}</span>
                         </div>
                         <div className="timeline-meta">
                           <span className="timeline-user">
                             By: {log.performedBy?.name || `User (${log.performedBy?.role || 'Unknown'})`}
                           </span>
                           <span className="timeline-role" style={{ fontSize: '0.7rem', opacity: 0.8 }}> ({log.performedBy?.role || log.role})</span>
                           {log.assignedTo && (
                             <div className="timeline-assignment-note" style={{ fontSize: '0.75rem', marginTop: '4px', color: '#64748b' }}>
                               <span style={{ fontWeight: 600 }}>Assigned To:</span> {log.assignedTo.name || 'Unassigned'}
                             </div>
                           )}
                         </div>
                         <div className="timeline-message">{log.comment}</div>
                       </div>
                     </div>
                   ))}
                 </div>
               )}
             </div>
          )}
        </div>

        <div className="admin-detail-footer">
          <InfoPair label="Last Updated" value={new Date(record.status?.updatedAt || record.createdAt).toLocaleString()} />
          <div className="admin-detail-status">
            <div className="info-pair__label">Current Status</div>
            <StatusPill status={record.status?.state || 'pending'} />
          </div>
          <div className="admin-detail-actions">
            {(record.status?.state === 'approved' || record.status?.state === 'rejected') ? (
              <>
                <Button 
                  variant="warning" 
                  icon="warning" 
                  onClick={() => onModify(record._id, 'send_back', 'Sent for manual verification.')}
                >
                  Send Back
                </Button>
                <Button 
                  variant="primary" 
                  icon="edit"
                  onClick={() => onModify(record._id, 'approved', 'Re-verified by admin')}
                >
                  Force Approve
                </Button>
              </>
            ) : (
               <div style={{ background: '#f1f5f9', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', width: '100%' }}>
                 <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic', textAlign: 'center' }}>
                   🔒 Task is currently in workflow ({record.status?.state}). Actions locked for supervisors.
                 </p>
               </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

function TruncatedCell({ value }) {
  return <span className="admin-truncate">{value}</span>
}

function UserRegistration() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "reviewer",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await api.post("/auth/register", form);
      console.log("Registration successful:", response.data);
      setSuccess("User created successfully!");
      setForm({ name: "", email: "", password: "", role: "reviewer" });
    } catch (err) {
      console.error("Registration error:", err);
      setError(err.response?.data?.msg || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-screen">
      <div className="admin-copy-block">
        <div className="admin-section-label">Management:</div>
        <div className="admin-section-title">Create New User</div>
      </div>

      <section className="admin-table-card" style={{ padding: '32px', maxWidth: '600px' }}>
        {error && <div className="mb-4 text-red-500 text-sm p-3 bg-red-50 rounded-lg">{error}</div>}
        {success && <div className="mb-4 text-green-600 text-sm p-3 bg-green-50 rounded-lg">{success}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="info-pair">
            <label className="info-pair__label">Full Name</label>
            <input
              type="text"
              name="name"
              placeholder="Full Name"
              value={form.name}
              onChange={handleChange}
              className="reassign-select"
              style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#f8fafc' }}
              required
            />
          </div>

          <div className="info-pair">
            <label className="info-pair__label">Email Address</label>
            <input
              type="email"
              name="email"
              placeholder="Email"
              value={form.email}
              onChange={handleChange}
              className="reassign-select"
              style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#f8fafc' }}
              required
            />
          </div>

          <div className="info-pair">
            <label className="info-pair__label">Password</label>
            <input
              type="password"
              name="password"
              placeholder="Password"
              value={form.password}
              onChange={handleChange}
              className="reassign-select"
              style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#f8fafc' }}
              required
            />
          </div>

          <div className="info-pair">
            <label className="info-pair__label">Role</label>
            <select
              name="role"
              value={form.role}
              onChange={handleChange}
              className="reassign-select"
              style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#f8fafc' }}
              required
            >
              <option value="reviewer">Reviewer</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
            style={{ marginTop: '10px', padding: '14px', borderRadius: '14px', background: 'linear-gradient(135deg, #1f8f6a, #0b4436)', color: 'white', fontWeight: '600', border: 'none', cursor: 'pointer' }}
          >
            {loading ? "Creating..." : "Create Account"}
          </button>
        </form>
      </section>
    </div>
  );
}

function ProfileCard({ onClose }) {
  const user = JSON.parse(localStorage.getItem('user') || 'null')
  const name    = user?.name    || 'Admin'
  const email   = user?.email   || '—'
  const role    = user?.role    ? (user.role.charAt(0).toUpperCase() + user.role.slice(1)) : 'Admin'
  const mobile  = user?.mobile  || '—'
  const initials = name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <>
      <div className="profile-backdrop" onClick={onClose} />
      <div className="profile-card animate-scale-in">
        {/* Close button */}
        <button className="profile-card__close" onClick={onClose} title="Close">
          ×
        </button>

        {/* Avatar */}
        <div className="profile-card__avatar">
          <span className="profile-card__initials">{initials}</span>
          <span className="profile-card__status-dot" />
        </div>

        {/* Identity */}
        <div className="profile-card__name">{name}</div>
        <div className="profile-card__role">{role}</div>

        {/* Divider */}
        <div className="profile-card__divider" />

        {/* Info rows */}
        <ul className="profile-card__info">
          <li className="profile-card__info-row">
            <span className="profile-card__info-icon">✉</span>
            <div>
              <span className="profile-card__info-label">Email</span>
              <span className="profile-card__info-value">{email}</span>
            </div>
          </li>
          <li className="profile-card__info-row">
            <span className="profile-card__info-icon">📱</span>
            <div>
              <span className="profile-card__info-label">Mobile</span>
              <span className="profile-card__info-value">{mobile}</span>
            </div>
          </li>
          <li className="profile-card__info-row">
            <span className="profile-card__info-icon">🔑</span>
            <div>
              <span className="profile-card__info-label">Role</span>
              <span className="profile-card__info-value">{role}</span>
            </div>
          </li>
        </ul>
      </div>
    </>
  )
}

function NewReviewForm() {
  const [form, setForm] = useState({
    aiPrompt: "",
    aiOutput: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const token = localStorage.getItem('token');
      const response = await api.post("/reviews", form);
      console.log("Task created:", response.data);
      setSuccess("Review task added successfully to the global pool!");
      setForm({ aiPrompt: "", aiOutput: "" });
    } catch (err) {
      console.error("Creation error:", err);
      setError(err.response?.data?.error || "Failed to create task.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-screen">
      <div className="admin-copy-block">
        <div className="admin-section-label">Inventory:</div>
        <div className="admin-section-title">Inject New Review Task</div>
      </div>

      <section className="admin-table-card" style={{ padding: '32px', maxWidth: '800px' }}>
        {error && <div className="mb-4 text-red-500 text-sm p-3 bg-red-50 rounded-lg">{error}</div>}
        {success && <div className="mb-4 text-green-600 text-sm p-3 bg-green-50 rounded-lg">{success}</div>}

        <p style={{ marginBottom: '24px', color: '#64748b', fontSize: '0.9rem' }}>
          Manually add data to the system for human verification. Tasks added here immediately enter the **Pending** pool.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="info-pair">
            <label className="info-pair__label">AI Prompt (Input)</label>
            <textarea
              name="aiPrompt"
              placeholder="Paste the user prompt or LLM input context here..."
              value={form.aiPrompt}
              onChange={handleChange}
              style={{ 
                width: '100%', 
                minHeight: '120px', 
                padding: '14px', 
                borderRadius: '14px', 
                border: '1px solid #cbd5e1', 
                background: '#f8fafc',
                fontFamily: 'inherit',
                fontSize: '0.95rem'
              }}
              required
            />
          </div>

          <div className="info-pair">
            <label className="info-pair__label">AI Output (Response)</label>
            <textarea
              name="aiOutput"
              placeholder="Paste the generated response that needs review..."
              value={form.aiOutput}
              onChange={handleChange}
              style={{ 
                width: '100%', 
                minHeight: '200px', 
                padding: '14px', 
                borderRadius: '14px', 
                border: '1px solid #cbd5e1', 
                background: '#f8fafc',
                fontFamily: 'inherit',
                fontSize: '0.95rem'
              }}
              required
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{ 
                flex: 1,
                padding: '16px', 
                borderRadius: '16px', 
                background: 'linear-gradient(135deg, #2f6fed, #1c57cd)', 
                color: 'white', 
                fontWeight: '600', 
                border: 'none', 
                cursor: 'pointer',
                boxShadow: '0 8px 20px rgba(47, 111, 237, 0.2)'
              }}
            >
              {loading ? "Injecting..." : "Add to Global Pool"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function BulkUploadView() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    if (!selectedFile.name.endsWith('.csv')) {
      setError("Please select a valid .csv file.");
      return;
    }
    setFile(selectedFile);
    setError("");
    setSuccess("");

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const rows = parseCSV(text);
      if (rows.length === 0) {
        setError("CSV file is empty or invalid.");
        setPreview([]);
      } else {
        setPreview(rows);
      }
    };
    reader.readAsText(selectedFile);
  };

  const parseCSV = (text) => {
    const splitCSVRow = (line) => {
      const result = [];
      let start = 0;
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') {
          inQuotes = !inQuotes;
        } else if (line[i] === ',' && !inQuotes) {
          result.push(line.substring(start, i));
          start = i + 1;
        }
      }
      result.push(line.substring(start));
      return result.map(val => val.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
    };

    const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
    if (lines.length < 2) return [];

    const headers = splitCSVRow(lines[0]);
    const promptIdx = headers.indexOf('aiPrompt');
    const outputIdx = headers.indexOf('aiOutput');

    if (promptIdx === -1 || outputIdx === -1) {
      setError("Missing required headers: 'aiPrompt' or 'aiOutput'");
      return [];
    }

    const data = [];
    for (let i = 1; i < lines.length; i++) {
      const row = splitCSVRow(lines[i]);
      if (row.length > Math.max(promptIdx, outputIdx)) {
        const prompt = row[promptIdx];
        const output = row[outputIdx];
        if (prompt && output) {
          data.push({ aiPrompt: prompt, aiOutput: output });
        }
      }
    }
    return data;
  };

  const handleUpload = async () => {
    if (preview.length === 0) return;
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const token = localStorage.getItem('token');
      const response = await api.post("/reviews/bulk", { tasks: preview });
      setSuccess(`${response.data.count} tasks successfully added to the global pool!`);
      setPreview([]);
      setFile(null);
    } catch (err) {
      console.error("Bulk upload error:", err);
      setError(err.response?.data?.error || "Bulk upload failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-screen">
      <div className="admin-copy-block">
        <div className="admin-section-label">Inventory:</div>
        <div className="admin-section-title">Bulk Task Induction</div>
      </div>

      <section className="admin-table-card" style={{ padding: '32px', maxWidth: '900px' }}>
        {error && <div className="mb-4 text-red-500 text-sm p-3 bg-red-50 rounded-lg">{error}</div>}
        {success && <div className="mb-4 text-green-600 text-sm p-3 bg-green-50 rounded-lg">{success}</div>}

        <div style={{ marginBottom: '24px' }}>
          <label className="info-pair__label">Select CSV File</label>
          <div style={{ 
            marginTop: '8px', 
            padding: '24px', 
            border: '2px dashed #cbd5e1', 
            borderRadius: '16px', 
            textAlign: 'center',
            background: '#f8fafc'
          }}>
            <input 
              type="file" 
              accept=".csv" 
              onChange={handleFileChange} 
              id="csv-upload" 
              style={{ display: 'none' }}
            />
            <label htmlFor="csv-upload" style={{ cursor: 'pointer' }}>
              <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📄</div>
              <div style={{ fontWeight: '600', color: '#1f2937' }}>{file ? file.name : "Click to select CSV"}</div>
              <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px' }}>
                Required headers: <code>aiPrompt</code>, <code>aiOutput</code>
              </div>
            </label>
          </div>
        </div>

        {preview.length > 0 && (
          <div className="animate-fade-in" style={{ marginTop: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div className="admin-section-label">Preview ({preview.length} valid rows found):</div>
              <button 
                onClick={handleUpload} 
                disabled={loading}
                className="btn-primary"
                style={{ 
                  padding: '12px 24px', 
                  borderRadius: '12px', 
                  background: 'linear-gradient(135deg, #1f8f6a, #0b4436)', 
                  color: 'white', 
                  fontWeight: '600', 
                  border: 'none', 
                  cursor: 'pointer' 
                }}
              >
                {loading ? "Inducting..." : `Inject ${preview.length} Tasks`}
              </button>
            </div>
            
            <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
              <table className="data-table" style={{ fontSize: '0.85rem' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#f1f5f9', zIndex: 1 }}>
                  <tr>
                    <th style={{ padding: '10px' }}>aiPrompt</th>
                    <th style={{ padding: '10px' }}>aiOutput</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 10).map((row, i) => (
                    <tr key={i}>
                      <td style={{ padding: '10px', borderTop: '1px solid #e2e8f0', color: '#64748b' }}>
                        <div style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.aiPrompt}
                        </div>
                      </td>
                      <td style={{ padding: '10px', borderTop: '1px solid #e2e8f0', color: '#64748b' }}>
                        <div style={{ maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.aiOutput}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {preview.length > 10 && (
                    <tr>
                      <td colSpan="2" style={{ padding: '12px', textAlign: 'center', fontStyle: 'italic', background: '#f8fafc', color: '#94a3b8' }}>
                        and {preview.length - 10} more rows...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function UserLogsView({ logs }) {
  const logColumns = [
    { key: 'userName', label: 'User' },
    { key: 'userEmail', label: 'Email' },
    { 
      key: 'loginAt', 
      label: 'Login Time', 
      render: (row) => row.loginAt ? new Date(row.loginAt).toLocaleString() : '---' 
    },
    { 
      key: 'logoutAt', 
      label: 'Logout Time', 
      render: (row) => row.logoutAt ? new Date(row.logoutAt).toLocaleString() : (row.status === 'Active' ? <span style={{ color: '#1f8f6a', fontWeight: 'bold' }}>Active Now</span> : '---') 
    },
    {
      key: 'duration',
      label: 'Duration',
      render: (row) => {
        if (!row.loginAt || !row.logoutAt) return '---';
        const diff = new Date(row.logoutAt) - new Date(row.loginAt);
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        return `${mins}m ${secs}s`;
      }
    },
    { key: 'ipAddress', label: 'IP Address' },
    { 
      key: 'status', 
      label: 'Status', 
      render: (row) => (
        <span style={{ 
          color: row.status === 'Active' ? '#1f8f6a' : (row.status === 'Completed' ? '#3b82f6' : '#64748b'),
          fontWeight: '600',
          textTransform: 'uppercase',
          fontSize: '0.75rem'
        }}>
          {row.status}
        </span>
      )
    },
  ];

  return (
    <div className="admin-screen">
      <div className="admin-copy-block">
        <div className="admin-section-label">Monitoring:</div>
        <div className="admin-section-title">User Sessions</div>
      </div>

      <section className="admin-table-card">
        <DataTable
          columns={logColumns}
          rows={logs}
        />
      </section>
    </div>
  );
}

export default AdminDashboard
