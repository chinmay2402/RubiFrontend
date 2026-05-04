import { useMemo, useState, useEffect } from 'react'
import api from './api/api'
import {
  auditEvents,
  reviewerProfile,
  statCards,
  workflowSteps,
} from './data/mockData'
import { Sidebar } from './components/Sidebar'
import { Navbar } from './components/Navbar'
import { PageHeader } from './components/PageHeader'
import { StatCard } from './components/StatCard'
import { DataTable } from './components/DataTable'
import { Panel } from './components/Panel'
import { Button } from './components/Button'
import { ActivityList } from './components/ActivityList'
import { StatusPill } from './components/StatusPill'
import io from 'socket.io-client'

const tableColumns = [
  {
    key: 'task',
    label: 'Task/Source',
    render: (item) => (
      <div>
        <div className="table-title">Review Request</div>
        <div className="table-subtitle">{item._id}</div>
      </div>
    ),
  },
  { key: 'createdAt', label: 'Submitted At', render: (item) => new Date(item.createdAt).toLocaleString() },
  { key: 'type', label: 'Type', render: () => 'LLM Output' },
  {
    key: 'status',
    label: 'Status',
    render: (item) => <StatusPill status={item.status?.state || 'pending'} />,
  },
]

function Dashboard() {
  const [activePage, setActivePage] = useState('overview')
  const [tasks, setTasks] = useState([])
  const [selectedTaskId, setSelectedTaskId] = useState(null)
  const [history, setHistory] = useState([])
  const [reviewView, setReviewView] = useState('review')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [reviewerComment, setReviewerComment] = useState('')
  const [profileOpen, setProfileOpen] = useState(false)

  const fetchLogs = async (taskId) => {
    try {
      const response = await api.get(`/reviews/${taskId}/logs`)
      setHistory(response.data)
    } catch (err) {
      console.error('Failed to fetch logs:', err)
    }
  }

  useEffect(() => {
    if (selectedTaskId && reviewView === 'history') {
      fetchLogs(selectedTaskId)
    }
  }, [selectedTaskId, reviewView])

  useEffect(() => {
    fetchTasks()
  }, [])

  // Socket.IO connection for real-time task updates
  useEffect(() => {
    const socket = io('https://rubiscape-backend.onrender.com') // Backend URL

    socket.on('reviewLocked', (data) => {
      console.log('Review locked by another reviewer:', data)
      // Refresh tasks to hide the locked task from this reviewer's view
      fetchTasks()
    })

    socket.on('reviewUnlocked', (data) => {
      console.log('Review unlocked:', data)
      // Refresh tasks to show the unlocked task again
      fetchTasks()
    })

    socket.on('reviewUpdated', (data) => {
      console.log('Review updated:', data)
      // Refresh tasks when a review is updated (e.g., reassigned to this reviewer)
      fetchTasks()
    })

    socket.on('reviewCreated', (data) => {
      console.log('Review created:', data)
      // Refresh tasks when new reviews are created (might be assigned to this reviewer)
      fetchTasks()
    })

    socket.on('reviewsCreated', (data) => {
      console.log('Reviews created:', data)
      // Refresh tasks when multiple new reviews are created
      fetchTasks()
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  const fetchTasks = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const response = await api.get('/reviews')
      setTasks(response.data)
    } catch (err) {
      console.error('Failed to fetch tasks:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleTaskSelect = (taskId) => {
    setSelectedTaskId(taskId)
    setReviewView('review')
    setActivePage('review')
  }

  const handleLockTask = async () => {
    try {
      const token = localStorage.getItem('token')
      await api.post(`/reviews/${selectedTaskId}/lock`, {})
      await fetchTasks()
    } catch (err) {
      console.error('Failed to lock task:', err)
      alert(`Locking failed: ${err.response?.data?.msg || err.message}`)
    }
  }

  const handleUnlockTask = async () => {
    try {
      const token = localStorage.getItem('token')
      await api.post(`/reviews/${selectedTaskId}/unlock`, {})
      await fetchTasks();
      setSelectedTaskId(null)
      setActivePage('overview')
    } catch (err) {
      console.error('Failed to unlock task:', err)
      alert(`Error releasing lock: ${err.response?.data?.msg || err.message}`)
    }
  }

// REMOVED: handlePutUnderReview (handled by auto-lock)

  const handleSubmitDecision = async (decision) => {
    try {
      const token = localStorage.getItem('token')
      const comment = reviewerComment || `${decision.charAt(0).toUpperCase() + decision.slice(1)} by reviewer`;
      
      await api.post(`/reviews/${selectedTaskId}/submit`, { 
        decision, 
        comment
      })
      
      // Clear state and refresh
      setReviewerComment('')
      fetchTasks()
      setActivePage('overview')
      setSelectedTaskId(null)
    } catch (err) {
      console.error('Failed to submit decision:', err)
      alert(`Submission failed: ${err.response?.data?.error || err.message}`)
    }
  }

  const selectedTask = tasks.find((item) => item._id === selectedTaskId)

  const navItems = useMemo(() => [
    { id: 'overview', label: 'All Tasks', count: tasks.length, accent: 'blue' },
    { id: 'pending', label: 'Global Pool', count: tasks.filter(t => (t.status?.state === 'pending' || !t.status?.state) && !t.isLocked).length, accent: 'amber' },
    { id: 'active', label: 'Under Review', count: tasks.filter(t => t.status?.state === 'under_review' || t.isLocked).length, accent: 'indigo' },
    { id: 'completed', label: 'Completed', count: tasks.filter(t => t.status?.state === 'approved').length, accent: 'green' },
    { id: 'rejected', label: 'Rejected', count: tasks.filter(t => t.status?.state === 'rejected').length, accent: 'red' },
  ], [tasks])

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return tasks.filter((item) => {
      const matchesPage =
        activePage === 'overview'
          ? true
          : activePage === 'completed'
            ? item.status?.state === 'approved'
            : activePage === 'active'
              ? (item.status?.state === 'under_review' || item.isLocked)
              : item.status?.state === activePage
      
      const matchesQuery =
        normalizedQuery.length === 0 ||
        `${item._id} ${item.aiPrompt}`
          .toLowerCase()
          .includes(normalizedQuery)

      return matchesPage && matchesQuery
    })
  }, [activePage, query, tasks])

  return (
    <div className="app-shell">
      <Sidebar
        brand="HITL AI Review"
        navItems={navItems}
        secondaryItems={[]}
        activeItem={activePage}
        onItemSelect={setActivePage}
      />

      <main className="app-main">
        <Navbar
          reviewer={reviewerProfile}
          searchValue={query}
          onSearchChange={setQuery}
          onProfileClick={() => setProfileOpen((o) => !o)}
          profileOpen={profileOpen}
        />

        <div className="app-content">
          {activePage === 'overview' && (
            <OverviewPage
              items={filteredItems}
              onTaskSelect={handleTaskSelect}
              selectedTask={selectedTask}
              tasks={tasks}
            />
          )}

          {activePage === 'pending' && (
            <QueuePage
              title="Pending Review Queue"
              description="Items waiting for human approval, rejection, or revision."
              items={filteredItems}
              onTaskSelect={handleTaskSelect}
            />
          )}

          {activePage === 'completed' && (
            <QueuePage
              title="Completed Reviews"
              description="Recently resolved items with final reviewer decisions."
              items={filteredItems}
              onTaskSelect={handleTaskSelect}
            />
          )}

          {activePage === 'active' && (
            <QueuePage
              title="My Active Work"
              description="Tasks you have currently locked and are reviewing."
              items={filteredItems}
              onTaskSelect={handleTaskSelect}
            />
          )}

          {activePage === 'rejected' && (
            <QueuePage
              title="Rejected Outputs"
              description="AI outputs that were blocked and sent back for correction."
              items={filteredItems}
              onTaskSelect={handleTaskSelect}
            />
          )}

          {activePage === 'review' && (
            <ReviewDetailPage
              task={selectedTask}
              history={history}
              reviewView={reviewView}
              onReviewViewChange={setReviewView}
              onBack={() => {
                setActivePage('overview');
                fetchTasks(); // Refresh list on back
              }}
              onLock={handleLockTask}
              onUnlock={handleUnlockTask}
              onSubmit={handleSubmitDecision}
              comment={reviewerComment}
              onCommentChange={setReviewerComment}
            />
          )}
          {activePage === 'audit' && <AuditPage />}
          {activePage === 'settings' && <SettingsPage />}
        </div>
      </main>

      {profileOpen && (
        <ProfileCard onClose={() => setProfileOpen(false)} />
      )}
    </div>
  )
}

function OverviewPage({ items, onTaskSelect, selectedTask, tasks }) {
  return (
    <section className="page-section">
      <PageHeader
        eyebrow="Queue"
        title="Reviewer Command Center"
        description="Monitor AI content flow, triage risky outputs, and keep every decision fully auditable."
      />

      <div className="stats-grid">
        <StatCard 
          label="Total Handled" 
          value={tasks.filter(t => ['approved', 'rejected'].includes(t.status?.state)).length}
          trend="+12%" 
          trendStyle="up"
        />
        <StatCard 
          label="Current Queue" 
          value={tasks.filter(t => t.status?.state === 'pending').length}
          trend="-2" 
          trendStyle="down"
        />
        <StatCard 
          label="Active Session" 
          value={tasks.filter(t => t.status?.state === 'under_review').length}
          trend="Live" 
          trendStyle="up"
        />
      </div>

      <Panel
        title="Stats"
        subtitle="Live review queue modeled after your reference screen."
      >
        <DataTable
          columns={tableColumns}
          rows={items}
          onRowClick={(row) => onTaskSelect(row._id)}
        />
      </Panel>
    </section>
  )
}

function QueuePage({ title, description, items, onTaskSelect }) {
  return (
    <section className="page-section">
      <PageHeader
        eyebrow="Tasks"
        title={title}
        description={description}
        actions={
          <>
            <Button variant="ghost">Filter</Button>
          </>
        }
      />

      <Panel title="Review Items" subtitle={`${items.length} results`}>
        <DataTable
          columns={tableColumns}
          rows={items}
          onRowClick={(row) => onTaskSelect(row._id)}
        />
      </Panel>
    </section>
  )
}

function ReviewDetailPage({
  task,
  history,
  reviewView,
  onReviewViewChange,
  onBack,
  onLock,
  onUnlock,
  onSubmit,
  comment,
  onCommentChange,
}) {
  if (!task) return <div>No task selected</div>;

  const historyColumns = [
    { key: 'createdAt', label: 'Timestamp', render: (row) => new Date(row.createdAt).toLocaleString() },
    { key: 'action', label: 'Action', render: (row) => row.action.toUpperCase().replace('_', ' ') },
    { key: 'performedBy', label: 'Performed By', render: (row) => row.performedBy?.name || 'Unknown' },
    { key: 'comment', label: 'Comment' },
  ]

  return (
    <div className="review-screen">
      <aside className="review-rail">
        <button className="back-circle" type="button" onClick={onBack}>
          {'<-'}
        </button>

        <div className="review-rail__actions">
          <button
            className={`review-mode-button ${
              reviewView === 'review' ? 'is-active' : ''
            }`}
            type="button"
            onClick={() => onReviewViewChange('review')}
          >
            Review
          </button>
          <button
            className={`review-mode-button ${
              reviewView === 'history' ? 'is-active' : ''
            }`}
            type="button"
            onClick={() => onReviewViewChange('history')}
          >
            History
          </button>
        </div>
      </aside>

      <section className="review-stage">
        {reviewView === 'review' ? (
          <div className="review-card review-card--plain">
            {task.status?.comment && (
              <div className="review-block admin-feedback">
                <label className="review-label">Admin Feedback:</label>
                <div className="review-bubble review-bubble--admin">{task.status.comment}</div>
              </div>
            )}

            <div className="review-block">
              <label className="review-label">Prompt:</label>
              <div className="review-bubble review-bubble--prompt">{task.aiPrompt}</div>
            </div>

            <div className="review-block">
              <label className="review-label">Answer:</label>
              <div className="review-bubble review-bubble--answer">{task.aiOutput}</div>
            </div>

            {task.isLocked && !['approved', 'rejected'].includes(task.status?.state) && (
              <div className="review-block reasoning-input animate-fade-in">
                <label className="review-label" style={{ color: 'var(--blue-600)', fontWeight: '600' }}>Reviewer Reasoning (Required):</label>
                <textarea
                  className="review-textarea"
                  placeholder="Record your observation or justification for this decision..."
                  value={comment}
                  onChange={(e) => onCommentChange(e.target.value)}
                  style={{ 
                    width: '100%', 
                    minHeight: '120px', 
                    padding: '12px', 
                    borderRadius: '12px', 
                    border: '2px solid var(--blue-100)', 
                    background: 'var(--blue-50)',
                    fontFamily: 'inherit',
                    fontSize: '0.95rem',
                    transition: 'all 0.2s ease',
                    marginTop: '8px',
                    outline: 'none'
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--blue-400)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--blue-100)'}
                />
              </div>
            )}

            <div className="review-block">
              <label className="review-label">Actions:</label>
              <div className="review-actions" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {!['approved', 'rejected'].includes(task.status?.state) && (
                  <>
                    {!task.isLocked ? (
                      <Button variant="success" onClick={onLock}>Lock Task</Button>
                    ) : (
                      <>
                        <Button variant="ghost" onClick={onUnlock}>Release Lock</Button>
                        <div style={{ flex: 1 }}></div>
                        <Button 
                          variant="danger" 
                          disabled={!comment?.trim()}
                          onClick={() => onSubmit('rejected')}
                          style={{ opacity: !comment?.trim() ? 0.5 : 1 }}
                        >
                          Reject
                        </Button>
                        <Button 
                          variant="success" 
                          disabled={!comment?.trim()}
                          onClick={() => onSubmit('approved')}
                          style={{ opacity: !comment?.trim() ? 0.5 : 1 }}
                        >
                          Approve Task
                        </Button>
                      </>
                    )}
                  </>
                )}
                {['approved', 'rejected'].includes(task.status?.state) && (
                   <div className="status-badge" style={{ padding: '10px', borderRadius: '8px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                     Status: <strong>{task.status.state.toUpperCase()}</strong>
                   </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="history-shell">
            <div className="history-card">
              <div className="history-title">History Logs</div>
              <div className="history-owner">
                <span className="history-owner__dot"></span>
                <span>Traceability Trace</span>
              </div>
              <div className="history-table-shell">
                <DataTable columns={historyColumns} rows={Array.isArray(history) ? history : []} />
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function AuditPage() {
  return (
    <section className="page-section">
      <PageHeader
        eyebrow="Audit"
        title="Decision Traceability"
        description="Every reviewer action, timestamp, and content change stays visible for compliance and debugging."
        actions={
          <>
            <Button variant="ghost">Download CSV</Button>
            <Button>Open Report</Button>
          </>
        }
      />

      <div className="audit-layout">
        <Panel title="Recent Activity" subtitle="Latest reviewer events">
          <ActivityList items={auditEvents} />
        </Panel>
        <Panel title="SLA Snapshot" subtitle="Operational health">
          <div className="sla-stack">
            <div className="sla-card">
              <span>Median response</span>
              <strong>00:11:42</strong>
            </div>
            <div className="sla-card">
              <span>Escalation rate</span>
              <strong>3.1%</strong>
            </div>
            <div className="sla-card">
              <span>Audit coverage</span>
              <strong>100%</strong>
            </div>
          </div>
        </Panel>
      </div>
    </section>
  )
}

function SettingsPage() {
  return (
    <section className="page-section">
      <PageHeader
        eyebrow="Admin"
        title="Workspace Settings"
        description="Control reviewer thresholds, workflow defaults, and notification preferences."
        actions={<Button>Save Changes</Button>}
      />

      <div className="settings-grid">
        <Panel title="Review Rules" subtitle="Core workflow controls">
          <div className="settings-list">
            <SettingRow
              label="Auto-expire stale pending reviews"
              value="After 48 hours"
            />
            <SettingRow
              label="High-risk items require dual approval"
              value="Enabled"
            />
            <SettingRow label="Default reviewer queue" value="Fraud & Safety" />
          </div>
        </Panel>

        <Panel title="Notifications" subtitle="Team coordination">
          <div className="settings-list">
            <SettingRow label="Slack alerts" value="#rubiscape-review" />
            <SettingRow label="Escalation email" value="ops@rubiscape.ai" />
            <SettingRow label="Latency threshold" value="200ms target" />
          </div>
        </Panel>
      </div>
    </section>
  )
}

function SettingRow({ label, value }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ProfileCard({ onClose }) {
  const user = JSON.parse(localStorage.getItem('user') || 'null')
  const name    = user?.name   || 'Reviewer'
  const email   = user?.email  || '—'
  const role    = user?.role   ? (user.role.charAt(0).toUpperCase() + user.role.slice(1)) : 'Reviewer'
  const mobile  = user?.mobile || '—'
  const initials = name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <>
      <div className="profile-backdrop" onClick={onClose} />
      <div className="profile-card animate-scale-in">
        <button className="profile-card__close" onClick={onClose} title="Close">
          ×
        </button>

        <div className="profile-card__avatar">
          <span className="profile-card__initials">{initials}</span>
          <span className="profile-card__status-dot" />
        </div>

        <div className="profile-card__name">{name}</div>
        <div className="profile-card__role">{role}</div>

        <div className="profile-card__divider" />

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

export default Dashboard