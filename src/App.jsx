import { useState, useRef, useEffect } from 'react';
import './App.css';

// Point this to your FastAPI backend
const API_BASE_URL = 'https://kural-voice-demo-backend.onrender.com';

function App() {
  const [activeTab, setActiveTab] = useState('kiosk');

  //timer
  const [timeLeft, setTimeLeft] = useState(30);
  
  // Kiosk State
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [details, setDetails] = useState('');
  
  // Dashboard State
  const [insights, setInsights] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Audio Refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimeoutRef = useRef(null);

  useEffect(() => {
  if (!isRecording) return;

  const interval = setInterval(() => {
    setTimeLeft((prev) => {
      if (prev <= 1) {
        clearInterval(interval);
        return 0;
      }
      return prev - 1;
    });
  }, 1000);

  return () => clearInterval(interval);
}, [isRecording]);

  // --- KIOSK LOGIC ---
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        audioChunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        setStatus("Processing...");
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        const formData = new FormData();
        formData.append('file', audioBlob, 'feedback.webm');

        try {
          const response = await fetch(`${API_BASE_URL}/api/upload`, {
            method: 'POST',
            body: formData
          });
          const result = await response.json();
          
          if (result.status === "queued") {
            setStatus("Feedback Submitted Successfully!");
            setDetails(`Job ID: ${result.job_id}`);
          } else {
            setStatus(result.message || "Upload failed.");
          }
        } catch (err) {
          setStatus("Error uploading to server.");
          console.error(err);
        }
      };
      setTimeLeft(30);
      mediaRecorderRef.current.start();
      recordingTimeoutRef.current = setTimeout(() => {
  if (
    mediaRecorderRef.current &&
    mediaRecorderRef.current.state === "recording"
  ) {
    stopRecording();
    setStatus("Maximum recording time reached (30 seconds)");
  }
}, 30000);
      setIsRecording(true);
      setStatus("Recording... Speak now.");
      setDetails("");

    } catch (err) {
      setStatus("Microphone access denied.");
      console.error(err);
    }
  };

  const stopRecording = () => {
    if (recordingTimeoutRef.current) {
  clearTimeout(recordingTimeoutRef.current);
  recordingTimeoutRef.current = null;
}
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      // Stop all audio tracks to release the microphone
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };
  const toggleRecording = () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
};


  // --- DASHBOARD LOGIC ---
  const fetchDashboard = async (query = "") => {
    setIsLoading(true);
    try {
      let url = `${API_BASE_URL}/api/dashboard/recent`;
      let options = { method: 'GET' };
      
      if (query.trim()) {
        url = `${API_BASE_URL}/api/dashboard/search`;
        options = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query })
        };
      }

      const res = await fetch(url, options);
      const result = await res.json();
      
      if (result.data) {
        setInsights(result.data);
      }
    } catch (e) {
      console.error("Failed to fetch dashboard data", e);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch data when switching to dashboard tab
  useEffect(() => {
    if (activeTab === 'dashboard') {
      fetchDashboard(searchQuery);
    }
  }, [activeTab]);

  // Debounce search input
  useEffect(() => {
    if (activeTab !== 'dashboard') return;
    const timer = setTimeout(() => {
      fetchDashboard(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);


  return (
    <div className="app-container">
      {/* Navigation Tabs */}
      <div className="tabs">
        <div 
          className={`tab ${activeTab === 'kiosk' ? 'active' : ''}`} 
          onClick={() => setActiveTab('kiosk')}
        >
          🎙️ Customer Kiosk
        </div>
        <div 
          className={`tab ${activeTab === 'dashboard' ? 'active' : ''}`} 
          onClick={() => setActiveTab('dashboard')}
        >
          📊 Owner Dashboard
        </div>
      </div>

      {/* Main Content Area */}
      <div className="content">
        
        {/* --- KIOSK VIEW --- */}
        {activeTab === 'kiosk' && (
          <div className="kiosk-wrapper">
            <h2>Leave Your Feedback</h2>
            <p>
  Record your feedback in English or Tamil.
</p>
            
            <button
  className={`record-btn ${isRecording ? 'recording' : ''}`}
  onClick={toggleRecording}
>
  {isRecording
    ? "⏹ Tap to Stop"
    : "Tap to Record"}
</button>
{isRecording && (
  <div className="timer">
    {timeLeft}s remaining
  </div>
)}
            
            <div className="status-text" style={{ color: status.includes('Error') ? 'var(--danger)' : 'var(--text)' }}>
              {status}
            </div>
            <div className="details-text">{details}</div>
          </div>
        )}

        {/* --- DASHBOARD VIEW --- */}
        {activeTab === 'dashboard' && (
          <div>
            <input 
              type="text" 
              className="search-bar" 
              placeholder="Semantic search... e.g., 'complaints about spicy food'"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            
            {isLoading ? (
              <div className="loading">
                Analyzing feedback...
              </div>
            ) : insights.length > 0 ? (
              <div className="feed-grid">
                {insights.map((item) => (
                  <div className="card" key={item.id}>
                    <span className="category">{item.category}</span>
                    <span className={`badge ${item.sentiment.toLowerCase()}`}>
                      {item.sentiment}
                    </span>
                    {item.urgency > 3 && (
                      <span className="badge urgent">Urgent: Lvl {item.urgency}</span>
                    )}
                    <p className="summary">{item.summary}</p>
                    
                    {item.similarity && (
                      <div className="match-score">
                        Match Score: {(item.similarity * 100).toFixed(1)}%
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p>No feedback found.</p>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

export default App;