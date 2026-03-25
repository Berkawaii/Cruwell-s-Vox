import { useState, useRef, useEffect } from 'react';
import './App.css';
import { useAuth } from './contexts/AuthContext';
import { useVoice } from './contexts/VoiceContext';
import Login from './components/Login';
import ChatArea from './components/ChatArea';
import VoiceRoom from './components/VoiceRoom';
import SidebarVoiceUser from './components/SidebarVoiceUser';
import SettingsModal from './components/SettingsModal';
import ServerJoin from './components/ServerJoin';
import InviteModal from './components/InviteModal';
import AdminModal from './components/AdminModal';
import ChannelModal from './components/ChannelModal';
import { useChannels } from './hooks/useChannels';
import { useUsers } from './hooks/useUsers';
import { useGlobalParticipants } from './hooks/useGlobalParticipants';
import { LogOut, Hash, Volume2, Plus, Mic, MicOff, PhoneOff, Settings, Monitor, MonitorOff, ShieldAlert, Edit2, Trash2, Download } from 'lucide-react';

function AudioPlayer({ stream, volume, sinkId }) {
  const audioRef = useRef(null);
  useEffect(() => {
    if (audioRef.current) {
      if (stream) audioRef.current.srcObject = stream;
      audioRef.current.volume = volume ?? 1;
      if (sinkId && sinkId !== 'default' && typeof audioRef.current.setSinkId === 'function') {
        audioRef.current.setSinkId(sinkId).catch(console.error);
      }
    }
  }, [stream, volume, sinkId]);
  return <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />;
}

function App() {
  const { currentUser, currentUserProfile, logout } = useAuth();
  const { roomId, localStream, remoteStreams, participantsMeta, inRoom, joinRoom, leaveRoom, micMuted, toggleMute, userVolumes, deviceSettings, isScreenSharing, toggleScreenShare } = useVoice();
  const [activeChannel, setActiveChannel] = useState({ type: 'text', id: 'general', name: 'general' });
  const [showSettings, setShowSettings] = useState(false);
  const [sessionAccess, setSessionAccess] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const { channels, createChannel, updateChannelName, removeChannel } = useChannels();
  const { users } = useUsers();
  const globalParticipants = useGlobalParticipants();
  const [channelModalConfig, setChannelModalConfig] = useState(null);
  const [releaseDownloads, setReleaseDownloads] = useState({
    loading: true,
    error: null,
    releaseUrl: 'https://github.com/Berkawaii/Cruwell-s-Vox/releases',
    version: null,
    mac: null,
    windows: null
  });

  useEffect(() => {
    let mounted = true;

    async function loadReleaseDownloads() {
      try {
        const response = await fetch('https://api.github.com/repos/Berkawaii/Cruwell-s-Vox/releases/latest');
        if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);

        const data = await response.json();
        const assets = Array.isArray(data.assets) ? data.assets : [];

        const macAsset = assets.find(asset => /\.dmg$/i.test(asset.name));
        const windowsSetupAsset = assets.find(asset => /setup.*\.exe$/i.test(asset.name));
        const windowsAnyExeAsset = assets.find(asset => /\.exe$/i.test(asset.name));

        if (!mounted) return;

        setReleaseDownloads({
          loading: false,
          error: null,
          releaseUrl: data.html_url || 'https://github.com/Berkawaii/Cruwell-s-Vox/releases',
          version: data.tag_name || null,
          mac: macAsset
            ? { name: macAsset.name, url: macAsset.browser_download_url }
            : null,
          windows: (windowsSetupAsset || windowsAnyExeAsset)
            ? {
                name: (windowsSetupAsset || windowsAnyExeAsset).name,
                url: (windowsSetupAsset || windowsAnyExeAsset).browser_download_url
              }
            : null
        });
      } catch (error) {
        if (!mounted) return;
        setReleaseDownloads(prev => ({
          ...prev,
          loading: false,
          error: 'Desktop downloads are temporarily unavailable.'
        }));
      }
    }

    loadReleaseDownloads();
    return () => {
      mounted = false;
    };
  }, []);

  if (!currentUser) return <Login />;

  const hasAccess = sessionAccess || localStorage.getItem(`cruwells_vox_access_${currentUser.uid}`) === 'true';

  if (!hasAccess && currentUserProfile?.role !== 'admin') {
    return (
      <ServerJoin onAccessGranted={() => {
        localStorage.setItem(`cruwells_vox_access_${currentUser.uid}`, 'true');
        setSessionAccess(true);
      }} />
    );
  }

  const displayName = currentUser.displayName || 'Guest User';

  return (
    <div className="app-container glass-panel">
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showInviteModal && <InviteModal onClose={() => setShowInviteModal(false)} />}
      {showAdminModal && <AdminModal onClose={() => setShowAdminModal(false)} />}
      {channelModalConfig?.isOpen && (
        <ChannelModal 
          onClose={() => setChannelModalConfig(null)}
          defaultType={channelModalConfig.type}
          channelToEdit={channelModalConfig.editChannel}
          onCreate={createChannel}
          onEdit={updateChannelName}
        />
      )}
      
      {Object.entries(remoteStreams).map(([uid, stream]) => (
        <AudioPlayer
          key={uid}
          stream={stream}
          volume={userVolumes[uid]}
          sinkId={deviceSettings.audioOutput}
        />
      ))}

      <nav className="server-sidebar">
        <div className="server-icon active">
          <img src="/favicon.svg" alt="CruwellsVox" />
        </div>
        <div className="separator"></div>
        <div className="server-icon add-server" title="Invite Friends" onClick={() => setShowInviteModal(true)}>
          <Plus size={24} />
        </div>
      </nav>

      <aside className="channel-sidebar">
        <div className="channel-header">
          <h2 style={{ fontFamily: 'Space Grotesk', fontSize: '18px', fontWeight: '700', letterSpacing: '-0.5px' }}>Cruwell's Vox</h2>
        </div>
        <div className="channel-list">
          <div className="channel-category" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>TEXT CHANNELS</span>
            {currentUserProfile?.role === 'admin' && (
              <Plus size={14} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setChannelModalConfig({ isOpen: true, type: 'text' })} />
            )}
          </div>
          
          {channels.filter(c => c.type === 'text').map(c => (
            <div 
              key={c.id}
              className={`channel-item ${activeChannel.id === c.id ? 'active' : ''}`}
              onClick={() => setActiveChannel({ type: 'text', id: c.id, name: c.name })}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                <Hash size={18} /> {c.name}
              </div>
              {currentUserProfile?.role === 'admin' && (
                <div style={{ display: 'flex', gap: '4px' }}>
                  <Edit2 size={12} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={(e) => { e.stopPropagation(); setChannelModalConfig({ isOpen: true, type: 'text', editChannel: c }); }} />
                  {c.id !== 'general' && c.id !== 'announcements' && (
                    <Trash2 size={12} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={(e) => { e.stopPropagation(); if(window.confirm('Delete channel?')) removeChannel(c.id); }} />
                  )}
                </div>
              )}
            </div>
          ))}

          <div className="channel-category" style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>VOICE CHANNELS</span>
            {currentUserProfile?.role === 'admin' && (
              <Plus size={14} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setChannelModalConfig({ isOpen: true, type: 'voice' })} />
            )}
          </div>
          
          {channels.filter(c => c.type === 'voice').map(c => (
            <div key={c.id}>
              <div 
                className={`channel-item voice ${activeChannel.id === c.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveChannel({ type: 'voice', id: c.id, name: c.name });
                  if (roomId !== c.id) joinRoom(c.id);
                }}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  <Volume2 size={18} /> {c.name}
                </div>
                {currentUserProfile?.role === 'admin' && (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <Edit2 size={12} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={(e) => { e.stopPropagation(); setChannelModalConfig({ isOpen: true, type: 'voice', editChannel: c }); }} />
                    {c.id !== 'general-voice' && (
                      <Trash2 size={12} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={(e) => { e.stopPropagation(); if(window.confirm('Delete channel?')) removeChannel(c.id); }} />
                    )}
                  </div>
                )}
              </div>
              
              {globalParticipants[c.id] && (
                <div className="voice-participants-sidebar">
                  {globalParticipants[c.id].map((participant) => (
                    <SidebarVoiceUser 
                      key={participant.uid} 
                      meta={participant} 
                      stream={participant.uid === currentUser.uid ? localStream : remoteStreams[participant.uid]} 
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {inRoom && (
          <div className="voice-connected-panel">
            <div className="voice-connected-info">
              <span className="voice-connected-text">Voice Connected</span>
              <span className="voice-connected-channel">{channels.find(c => c.id === roomId)?.name || 'Voice'}</span>
            </div>
            <div className="voice-connected-actions">
              <button className={`control-btn-small ${isScreenSharing ? 'active-share' : ''}`} onClick={toggleScreenShare} title="Toggle Screen Share">
                {isScreenSharing ? <MonitorOff size={16} color="#111" /> : <Monitor size={16} />}
              </button>
              <button className={`control-btn-small ${micMuted ? 'muted' : ''}`} onClick={toggleMute} title="Toggle Mute">
                {micMuted ? <MicOff size={16} color="#111" /> : <Mic size={16} />}
              </button>
              <button className="control-btn-small disconnect" onClick={leaveRoom} title="Disconnect">
                <PhoneOff size={16} />
              </button>
            </div>
          </div>
        )}

        <div className="desktop-download-panel">
          <div className="desktop-download-header">
            <Download size={14} />
            <span>Desktop App</span>
          </div>

          {releaseDownloads.version && (
            <div className="desktop-download-version">Latest: {releaseDownloads.version}</div>
          )}

          {releaseDownloads.loading ? (
            <div className="desktop-download-muted">Checking latest release...</div>
          ) : (
            <div className="desktop-download-actions">
              <a
                className={`desktop-download-btn ${!releaseDownloads.mac ? 'disabled' : ''}`}
                href={releaseDownloads.mac?.url || releaseDownloads.releaseUrl}
                target="_blank"
                rel="noreferrer"
              >
                macOS
              </a>
              <a
                className={`desktop-download-btn ${!releaseDownloads.windows ? 'disabled' : ''}`}
                href={releaseDownloads.windows?.url || releaseDownloads.releaseUrl}
                target="_blank"
                rel="noreferrer"
              >
                Windows
              </a>
            </div>
          )}

          {releaseDownloads.error && (
            <div className="desktop-download-muted">{releaseDownloads.error}</div>
          )}

          <a
            className="desktop-release-link"
            href={releaseDownloads.releaseUrl}
            target="_blank"
            rel="noreferrer"
          >
            View all releases
          </a>
        </div>

        <div className="user-presence">
          <div className="avatar" style={{
            background: `hsl(${displayName.charCodeAt(0) * 12 % 360}, 70%, 60%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            color: 'white'
          }}>
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="user-info">
            <span className="username" style={{ color: currentUserProfile?.role === 'admin' ? 'var(--danger)' : 'var(--text-normal)' }}>
              {displayName}
            </span>
            <span className="status">Online</span>
          </div>
          <div style={{ flex: 1 }}></div>
          {currentUserProfile?.role === 'admin' && (
            <button onClick={() => setShowAdminModal(true)} className="logout-action" title="Admin Panel" style={{ color: 'var(--danger)' }}>
              <ShieldAlert size={16} />
            </button>
          )}
          <button onClick={() => setShowSettings(true)} className="logout-action" title="Settings">
            <Settings size={16} />
          </button>
          <button onClick={logout} className="logout-action" title="Logout">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {activeChannel.type === 'text' ? (
        <ChatArea roomId={activeChannel.id} roomName={activeChannel.name} />
      ) : (
        <VoiceRoom roomId={activeChannel.id} roomName={activeChannel.name} />
      )}

      {activeChannel.type === 'text' && (
        <aside className="members-sidebar">
          <h3 className="members-category">ONLINE — {users.length}</h3>
          {users.map(u => (
            <div key={u.uid} className="member-item">
              <div className="avatar" style={{
                background: `hsl(${u.displayName.charCodeAt(0) * 12 % 360}, 70%, 60%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                color: 'white'
              }}>
                {u.displayName.charAt(0).toUpperCase()}
              </div>
              <span className="member-name" style={{ color: u.role === 'admin' ? 'var(--danger)' : 'var(--text-normal)' }}>
                {u.displayName}
              </span>
            </div>
          ))}
        </aside>
      )}
    </div>
  );
}

export default App;
