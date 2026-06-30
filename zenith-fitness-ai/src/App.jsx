import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import Tracker from './components/Tracker';
import MedicalReports from './components/MedicalReports';
import Supplements from './components/Supplements';
import './App.css';

const FULL_SYSTEM_PROMPT = `
You are **ZENITH**, an elite-level personal trainer, certified sports nutritionist, strength and conditioning specialist, and wellness coach embedded into this fitness platform.

CORE BEHAVIORAL RULES:
1. Evidence-first: Ground every recommendation in exercise science, peer-reviewed research.
2. Safety-first: Always flag contraindications, injury risks.
3. Personalization: Tailor advice to the user's goals, level, equipment.
4. Positive reinforcement: Celebrate wins.
`;

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || atob("QVEuQWI4Uk42TDZOUUwzYzFBdWRXSjJkc2ctVzh6V0tlQl9adndqVVpwU2Q5V2pKX09uMUE=");

// Build medical context from the latest analyzed report
function getMedicalContext() {
  try {
    const saved = localStorage.getItem('fitcoach_medical_reports');
    if (!saved) return '';
    const reports = JSON.parse(saved);
    if (!reports.length) return '';
    const latest = reports[0]; // Most recent report
    return `\n\nIMPORTANT MEDICAL CONTEXT (from the user's most recent medical report analyzed on ${latest.date}):\n${latest.analysis}\n\nYou MUST factor these medical findings into ALL fitness, nutrition, and wellness recommendations. Adjust exercise intensity, diet plans, and supplement advice to align with the user's health profile. Flag any recommendations that may conflict with their medical conditions.`;
  } catch {
    return '';
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState('chat'); // 'chat', 'tracker', or 'reports'
  
  const [sessions, setSessions] = useState(() => {
    const saved = localStorage.getItem('fitcoach_sessions');
    return saved ? JSON.parse(saved) : [{
      id: 1,
      title: "New Workout Plan",
      date: "Today",
      messages: [
        { role: 'model', content: "Welcome to ZENITH. I'm your elite personal trainer. How can I help you reach your goals today?" }
      ]
    }];
  });
  
  const [currentSessionId, setCurrentSessionId] = useState(() => {
    const saved = localStorage.getItem('fitcoach_current_session');
    return saved ? parseInt(saved, 10) : 1;
  });

  const [inputVal, setInputVal] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editTitleVal, setEditTitleVal] = useState('');
  
  const messagesEndRef = useRef(null);

  const currentSession = sessions.find(s => s.id === currentSessionId) || sessions[0];
  const messages = currentSession ? currentSession.messages : [];

  // Persist chat data
  useEffect(() => {
    localStorage.setItem('fitcoach_sessions', JSON.stringify(sessions));
    localStorage.setItem('fitcoach_current_session', currentSessionId);
  }, [sessions, currentSessionId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (activeTab === 'chat') {
      scrollToBottom();
    }
  }, [messages, isLoading, activeTab]);

  const handleNewChat = () => {
    const newSession = {
      id: Date.now(),
      title: "New Chat",
      date: new Date().toLocaleDateString(),
      messages: [
        { role: 'model', content: "New session started. How can I assist you?" }
      ]
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setActiveTab('chat');
  };

  const handleDeleteSession = (idToDelete) => {
    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== idToDelete);
      if (filtered.length === 0) {
        const newSessionId = Date.now();
        const newSession = {
          id: newSessionId,
          title: "New Chat",
          date: new Date().toLocaleDateString(),
          messages: [{ role: 'model', content: "New session started. How can I assist you?" }]
        };
        setCurrentSessionId(newSessionId);
        return [newSession];
      }
      if (idToDelete === currentSessionId) {
        setCurrentSessionId(filtered[0].id);
      }
      return filtered;
    });
  };

  const handleRenameSubmit = (id) => {
    if (editTitleVal.trim()) {
      setSessions(prev => prev.map(s => s.id === id ? { ...s, title: editTitleVal.trim() } : s));
    }
    setEditingSessionId(null);
  };

  const handleSend = async () => {
    if (!inputVal.trim() || isLoading) return;

    const userText = inputVal.trim();
    setInputVal('');
    
    let sessionTitle = currentSession.title;
    if (messages.length === 1 && userText.length > 5) {
      sessionTitle = userText.substring(0, 20) + '...';
    }

    const newMessages = [...messages, { role: 'user', content: userText }];
    
    setSessions(prev => prev.map(s => 
      s.id === currentSessionId ? { ...s, title: sessionTitle, messages: newMessages } : s
    ));
    setIsLoading(true);

    try {
      const contextMessages = newMessages.map(m => ({
        role: m.role,
        parts: [{ text: m.content }]
      }));

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: FULL_SYSTEM_PROMPT + getMedicalContext() + `\nCurrent Context Time: ${new Date().toISOString()}` }] },
          contents: contextMessages,
          generationConfig: { temperature: 0.7, maxOutputTokens: 2000 }
        })
      });

      if (!response.ok) throw new Error('API Response was not OK');

      const data = await response.json();
      let botText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't process that.";

      setSessions(prev => prev.map(s => 
        s.id === currentSessionId ? { ...s, messages: [...s.messages, { role: 'model', content: botText }] } : s
      ));
    } catch (error) {
      console.error('Error:', error);
      setSessions(prev => prev.map(s => 
        s.id === currentSessionId ? { ...s, messages: [...s.messages, { role: 'model', content: "**Error:** Experiencing connection issues." }] } : s
      ));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
      <div className="app-layout">
        {/* Sidebar */}
      <div className={`glass-panel sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <h2>Z.E.N.I.T.H</h2>
        </div>
        
        {/* Navigation Tabs */}
        <div className="main-nav">
          <button 
            className={`nav-tab ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            AI Coach
          </button>
          
          <button 
            className={`nav-tab ${activeTab === 'tracker' ? 'active' : ''}`}
            onClick={() => setActiveTab('tracker')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
            Tracker Dashboard
          </button>
          
          <button 
            className={`nav-tab ${activeTab === 'reports' ? 'active' : ''}`}
            onClick={() => setActiveTab('reports')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            Medical Reports
          </button>

          <button 
            className={`nav-tab ${activeTab === 'supplements' ? 'active' : ''}`}
            onClick={() => setActiveTab('supplements')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"></path></svg>
            Supplements
          </button>
        </div>

        {/* Dynamic Sidebar Content depending on active tab */}
        {activeTab === 'chat' ? (
          <>
            <button className="new-chat-btn" onClick={handleNewChat}>
              <span>+</span> New Chat Session
            </button>
            <div className="history-list">
              <div className="history-label">Recent Chats</div>
              {sessions.map(s => (
                <div 
                  key={s.id} 
                  className={`history-item ${s.id === currentSessionId ? 'active' : ''}`}
                  onClick={() => setCurrentSessionId(s.id)}
                >
                  {editingSessionId === s.id ? (
                    <input 
                      type="text" 
                      value={editTitleVal}
                      onChange={(e) => setEditTitleVal(e.target.value)}
                      onBlur={() => handleRenameSubmit(s.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameSubmit(s.id);
                        if (e.key === 'Escape') setEditingSessionId(null);
                      }}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                      style={{ 
                        background: 'rgba(0,0,0,0.2)', 
                        border: '1px solid var(--accent-cyan)', 
                        color: 'white', 
                        borderRadius: '4px', 
                        padding: '2px 4px', 
                        width: '65%',
                        outline: 'none',
                        fontSize: '0.85rem'
                      }}
                    />
                  ) : (
                    <div 
                      className="history-title" 
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditingSessionId(s.id);
                        setEditTitleVal(s.title);
                      }}
                      title="Double click to rename"
                    >
                      {s.title}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    {editingSessionId !== s.id && (
                      <button 
                        className="edit-session-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingSessionId(s.id);
                          setEditTitleVal(s.title);
                        }}
                        title="Rename Chat"
                        style={{ 
                          background: 'transparent', 
                          border: 'none', 
                          color: 'var(--text-secondary)', 
                          cursor: 'pointer', 
                          fontSize: '0.9rem',
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        ✎
                      </button>
                    )}
                    <button 
                      className="delete-session-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSession(s.id);
                      }}
                      title="Delete Chat"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : activeTab === 'tracker' ? (
          <div className="history-list" style={{ marginTop: '2rem' }}>
            <div className="history-label">Tracker Info</div>
            <p style={{ padding: '0 0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Use the dashboard to monitor your daily metrics. All entries are saved locally.
            </p>
          </div>
        ) : activeTab === 'reports' ? (
          <div className="history-list" style={{ marginTop: '2rem' }}>
            <div className="history-label">Medical Reports</div>
            <p style={{ padding: '0 0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Upload blood work, lab results, or prescriptions. AI will analyze and suggest personalized fitness plans.
            </p>
          </div>
        ) : (
          <div className="history-list" style={{ marginTop: '2rem' }}>
            <div className="history-label">Supplements</div>
            <p style={{ padding: '0 0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              AI-powered supplement recommendations based on your medical reports and fitness data.
            </p>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="main-content">
        {activeTab === 'chat' ? (
          <div className="glass-panel chat-interface">
            <div className="chat-header">
              <button className="toggle-sidebar" onClick={() => setSidebarOpen(!sidebarOpen)}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
              </button>
              <div className="header-title-container">
                <h1 className="header-title">{currentSession.title}</h1>
                <div className="header-status">
                  <span className="status-dot"></span> Active Session
                </div>
              </div>
            </div>

            <div className="chat-messages">
              {messages.map((msg, index) => (
                <div key={index} className={`message-wrapper ${msg.role}`}>
                  <div className={`message ${msg.role}`}>
                    {msg.role === 'model' ? (
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="message-wrapper model">
                  <div className="message ai typing-indicator">
                    <span className="typing-dot"></span><span className="typing-dot"></span><span className="typing-dot"></span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="input-area">
              <div className="input-container">
                <textarea 
                  className="chat-input"
                  placeholder="Ask your coach anything..."
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                />
                <button className="send-button" onClick={handleSend} disabled={isLoading || !inputVal.trim()} aria-label="Send Message">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ) : activeTab === 'tracker' ? (
          <Tracker apiKey={API_KEY} medicalContext={getMedicalContext()} />
        ) : activeTab === 'reports' ? (
          <MedicalReports apiKey={API_KEY} />
        ) : (
          <Supplements apiKey={API_KEY} />
        )}
      </div>
    </div>
  );
}
