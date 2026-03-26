import './LoadingScreen.css';

export default function LoadingScreen() {
  return (
    <div className="loading-wrapper">
      <div className="loading-spinner">
        <div className="spinner"></div>
        <p className="loading-text">Loading Cruwells Vox...</p>
      </div>
    </div>
  );
}
