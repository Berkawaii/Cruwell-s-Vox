import { useState, useEffect, useRef } from 'react';
import { useVoice } from '../contexts/VoiceContext';
import { X, Mic, Speaker, Settings2, Play, Square } from 'lucide-react';
import './SettingsModal.css';

export default function SettingsModal({ onClose }) {
  const { deviceSettings, changeAudioSettings, localStream } = useVoice();
  const [devices, setDevices] = useState({ inputs: [], outputs: [] });
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [testStream, setTestStream] = useState(null);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const audioPreviewRef = useRef(null);

  useEffect(() => {
    if (audioPreviewRef.current && testStream) {
      audioPreviewRef.current.srcObject = testStream;
      audioPreviewRef.current.play().catch(e => console.error("Audio play failed", e));
    }
  }, [testStream]);

  useEffect(() => {
    let animationFrame;
    if (isTestRunning && testStream) {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(testStream);
      source.connect(analyser);
      analyser.fftSize = 256;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateVolume = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        setVolumeLevel(average);
        animationFrame = requestAnimationFrame(updateVolume);
      };
      updateVolume();

      return () => {
        cancelAnimationFrame(animationFrame);
        audioContext.close();
      };
    } else {
      setVolumeLevel(0);
    }
  }, [isTestRunning, testStream]);

  const toggleMicTest = async () => {
    if (isTestRunning) {
      if (testStream) {
        testStream.getTracks().forEach(t => t.stop());
      }
      setTestStream(null);
      setIsTestRunning(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: deviceSettings.audioInput !== 'default' ? { exact: deviceSettings.audioInput } : undefined,
            noiseSuppression: deviceSettings.noiseSuppression,
            echoCancellation: deviceSettings.echoCancellation
          }
        });
        setTestStream(stream);
        setIsTestRunning(true);
      } catch (err) {
        console.error("Error starting mic test:", err);
      }
    }
  };

  useEffect(() => {
    return () => {
      if (testStream) {
        testStream.getTracks().forEach(t => t.stop());
      }
    };
  }, [testStream]);

  useEffect(() => {
    async function getDevices() {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true }); 
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        
        const inputs = allDevices.filter(d => d.kind === 'audioinput');
        const outputs = allDevices.filter(d => d.kind === 'audiooutput');
        
        // Browsers prefix a default device sometimes. Use deduplication if necessary, but native works fine.
        setDevices({ inputs, outputs });
      } catch (e) {
        console.error("Could not enumerate audio devices", e);
      }
    }
    getDevices();
  }, []);

  return (
    <div className="settings-overlay">
      <div className="settings-modal glass-panel animate-fade-in">
        <div className="settings-header">
          <h2><Settings2 size={24}/> Voice & Video Settings</h2>
          <button className="close-btn" onClick={onClose}><X size={24} /></button>
        </div>

        <div className="settings-content">
          <div className="settings-section">
            <h3 className="section-label"><Mic size={18}/> Input Device (Microphone)</h3>
            <select 
               className="input-select" 
               value={deviceSettings.audioInput} 
               onChange={e => changeAudioSettings('audioInput', e.target.value)}
            >
              <option value="default">Default System Input</option>
              {devices.inputs.map(d => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId}`}</option>
              ))}
            </select>
          </div>

          <div className="settings-section">
            <h3 className="section-label"><Mic size={18}/> Input Volume (Gain)</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input 
                type="range" 
                min="0" 
                max="2" 
                step="0.01" 
                value={deviceSettings.manualGain} 
                onChange={e => changeAudioSettings('manualGain', parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--primary)' }}
              />
              <span style={{ minWidth: '40px', textAlign: 'right', fontSize: '13px' }}>{Math.round(deviceSettings.manualGain * 100)}%</span>
            </div>
          </div>

          <div className="settings-section toggle-section">
            <div className="toggle-info">
              <h3 className="section-label">Auto Gain Control</h3>
              <p>Automatically adjusts your microphone volume so you're always heard at a consistent level.</p>
            </div>
            <label className="switch">
              <input 
                type="checkbox" 
                checked={deviceSettings.autoGainControl} 
                onChange={e => changeAudioSettings('autoGainControl', e.target.checked)}
              />
              <span className="slider round"></span>
            </label>
          </div>

          <div className="divider"></div>

          <div className="settings-section">
            <h3 className="section-label">Mic Test & Input Sensitivity</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Check your level and adjust the sensitivity to cut out background noise.
            </p>
            
            <div className="sensitivity-control" style={{ marginBottom: '16px' }}>
              <label className="label-text" style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'bold' }}>SENSITIVITY (THRESHOLD: {deviceSettings.noiseThreshold}dB)</label>
              <input 
                type="range" 
                min="-100" 
                max="-20" 
                step="1" 
                value={deviceSettings.noiseThreshold} 
                onChange={e => changeAudioSettings('noiseThreshold', parseInt(e.target.value))}
                style={{ width: '100%', marginTop: '8px', accentColor: 'var(--primary)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                <span>Strict (Silence)</span>
                <span>Relaxed (Always on)</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button 
                className={`btn ${isTestRunning ? 'btn-kinetic-secondary' : 'btn-kinetic-primary'}`} 
                onClick={toggleMicTest}
                style={{ height: '36px', padding: '0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                {isTestRunning ? <><Square size={16} /> Stop Test</> : <><Play size={16} /> Start Test</>}
              </button>
              
              <div style={{ flex: 1, height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                <div 
                  style={{ 
                    width: `${Math.min(100, (volumeLevel / 100) * 100)}%`, 
                    height: '100%', 
                    background: (20 * Math.log10(volumeLevel / 100)) < (deviceSettings.noiseThreshold + 50) ? 'var(--text-muted)' : 'var(--primary)',
                    boxShadow: (20 * Math.log10(volumeLevel / 100)) < (deviceSettings.noiseThreshold + 50) ? 'none' : '0 0 10px var(--primary)',
                    transition: 'width 0.1s ease-out, background 0.2s'
                  }} 
                />
              </div>
              <div style={{ 
                fontSize: '10px', 
                fontWeight: 'bold', 
                color: (20 * Math.log10(volumeLevel / 100)) < (deviceSettings.noiseThreshold + 50) ? 'var(--text-muted)' : 'var(--primary)',
                minWidth: '45px'
              }}>
                {(20 * Math.log10(volumeLevel / 100)) < (deviceSettings.noiseThreshold + 50) ? 'SILENT' : 'SPEAKING'}
              </div>
            </div>
            {isTestRunning && (
              <audio 
                autoPlay 
                ref={audioPreviewRef}
                style={{ display: 'none' }}
              />
            )}
          </div>

          <div className="settings-section">
            <h3 className="section-label"><Speaker size={18}/> Output Device (Speakers/Headphones)</h3>
            <select 
               className="input-select" 
               value={deviceSettings.audioOutput} 
               onChange={e => changeAudioSettings('audioOutput', e.target.value)}
            >
              <option value="default">Default System Output</option>
              {devices.outputs.map(d => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || `Speaker ${d.deviceId}`}</option>
              ))}
            </select>
          </div>

          <div className="divider"></div>

          <div className="settings-section toggle-section">
            <div className="toggle-info">
              <h3 className="section-label">Noise Cancellation (Suppression)</h3>
              <p>Uses AI features in the browser to filter out background noises like typings or fans.</p>
            </div>
            <label className="switch">
              <input 
                type="checkbox" 
                checked={deviceSettings.noiseSuppression} 
                onChange={e => changeAudioSettings('noiseSuppression', e.target.checked)}
              />
              <span className="slider round"></span>
            </label>
          </div>

          <div className="settings-section toggle-section">
            <div className="toggle-info">
              <h3 className="section-label">Echo Cancellation</h3>
              <p>Prevents feedback loops and speaker screeching computationally. Recommended!</p>
            </div>
            <label className="switch">
              <input 
                type="checkbox" 
                checked={deviceSettings.echoCancellation} 
                onChange={e => changeAudioSettings('echoCancellation', e.target.checked)}
              />
              <span className="slider round"></span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
