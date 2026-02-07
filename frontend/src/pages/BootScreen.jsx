import { Component } from 'react';
import nucleus from '../lib/nucleus.js';

class BootScreen extends Component {
  componentDidMount() {
    setTimeout(() => {
      const auth = nucleus.payload.keys !== null;
      window.location.hash = auth ? '#feed' : '#login';
    }, 1500);
  }
  
  render() {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column' }}>
        <h1 className="heading-xl" style={{ background: 'linear-gradient(135deg, #FF006E, #00F5FF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', textAlign: 'center' }}>
          EVERY<br/>MUSIC
        </h1>
        <p style={{ opacity: 0.7, textAlign: 'center' }}>Find your bandmates. Build your sound.</p>
      </div>
    );
  }
}

export default BootScreen;
